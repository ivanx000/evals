# Architecture

## Overview

```
cli.ts              ← entry point, flag parsing, API key guards
  ├── runner.ts     ← suite loading, case orchestration, caching, concurrency
  ├── batch-runner.ts ← Anthropic Batches API path (--batch flag)
  ├── diff.ts       ← regression detection between two run results
  ├── benchmark.ts  ← multi-model benchmark harness
  ├── benchmark-reporter.ts ← benchmark terminal output
  ├── dataset.ts    ← .jsonl streaming + {{variable}} substitution
  ├── plugins.ts    ← user-land grader plugin loader
  ├── reporter.ts   ← terminal table output (cli-table3)
  └── dashboard/    ← Express REST API server
        └── server.ts
```

```
providers/
  ├── anthropic.ts  ← Anthropic SDK wrapper (+ batch submit/poll/results)
  ├── openai.ts     ← OpenAI SDK wrapper
  ├── ollama.ts     ← Ollama OpenAI-compat wrapper
  ├── gemini.ts     ← Google Generative AI wrapper
  └── retry.ts      ← shared withRetry() (exponential backoff + jitter)

graders/
  ├── index.ts      ← runGraders() dispatcher + plugin fallback
  ├── registry.ts   ← registerGrader() / getGrader() registry
  ├── types.ts      ← Grader interface
  ├── exact_match.ts
  ├── contains.ts
  ├── max_words.ts
  ├── regex.ts
  ├── llm_judge.ts
  ├── code_execution.ts
  ├── numeric_tolerance.ts
  └── calibration.ts
```

Supporting modules:

- `types.ts` — all Zod schemas and TypeScript interfaces (`EvalSuite`, `CaseResult`, `RunResult`, pricing tables, …)
- `config.ts` — loads `.evalrc.json` / env vars into `EvalConfig`
- `cache.ts` — SHA-256 keyed semantic cache on disk (`.eval-cache/`)

Dashboard UI is a separate Vite + React app in `dashboard-ui/`, served as static
files by Express in production.

## Data flow

```
YAML file
  → loadSuite()        parse + Zod validate → EvalSuite
  → runSuite()         or runSuiteBatch()
      ├── expandDataset()   .jsonl + {{var}} substitution
      ├── filter cases
      ├── makeProvider()    factory → LLMProvider
      ├── per-case: call provider → output + token counts
      ├── runGraders()      → GraderResult[]
      └── aggregate         → RunResult
  → saveResult()       → results/<timestamp>.json
  → printRunResult()   → terminal
```

For `--batch` runs, `runSuiteBatch()` replaces the Semaphore+Promise.all path:
it builds batch requests, submits them all at once to the Anthropic Batches API,
polls until `processing_status === "ended"`, then grades results in order.

## Error handling

The project follows a **fail-gracefully** philosophy: errors are returned as data,
not thrown across subsystem boundaries.

### Grader errors

Every grader wraps its logic in a `try/catch`. On any failure it returns:

```ts
{ criteria_type: "...", passed: false, error: "description of what went wrong" }
```

`runGraders()` in `graders/index.ts` additionally wraps each dispatch in its own
`try/catch`, so a bug in one grader cannot prevent other graders from running.

### Provider errors

Providers validate the API key in their constructors and throw a clear, actionable
message if it is missing. Ollama is exempt — it never requires a key.

API calls are wrapped in `withRetry()` (max 3 retries, exponential backoff + jitter).
Retryable status codes: 429, 500, 502, 503. Network errors are also retried.
Non-retryable errors (e.g., 401) throw immediately with a specific message.

### Runner errors

`loadSuite()` catches file I/O, YAML parsing, and Zod validation errors and
re-throws them with field-level messages:

```
Suite validation failed in suite.yaml:
  • name: Required
  • cases.0.criteria: Array must contain at least 1 element(s)
```

`runCase()` catches all provider errors and stores them in `CaseResult.error`.
A case with an error is automatically `passed: false`. The runner never crashes
because one case fails.

Per-case timeout is enforced with `Promise.race`. Timed-out cases get
`error: "Timeout: case exceeded Xms"` and `passed: false`.

### CLI errors

Before any API call, `cli.ts` checks that the required API key is present and
prints a human-readable setup instruction, then exits with code 1.

A global `unhandledRejection` handler at the top of `cli.ts` catches any promise
that escapes the try/catch chain and prints it cleanly.

All failure paths exit with code 1. Success exits with code 0.

## Concurrency model

### Standard runs

`runSuite()` uses a `Semaphore` class to bound parallel case execution.
`Promise.all()` over all case promises (semaphore-limited) keeps results in suite
input order regardless of completion order. Default `--concurrency 1`.

### Batch runs (`--batch`, Anthropic-only)

`runSuiteBatch()` submits all cases to the Anthropic Messages Batches API in a
single request. Cases get `custom_id = String(index)`, which is used to map
results back to input order after polling completes. Cost is 50% of standard rates.

Multi-turn cases with intermediate null assistant turns (which require mid-run API
calls) are not batchable — those cases are returned as `passed: false` with a
descriptive error.

Polling and result collection are handled by the private `_pollAndGrade()` helper,
shared between the submit path and the resume path. It polls with exponential
backoff starting at 5 s, doubling each cycle, capped at 60 s, then streams
batch results via `batchResults()` and runs graders in order.

`resumeBatch()` (exposed as `evals batch <batchId> <suite>`) re-expands and
re-filters the suite identically to the original submit — so that `custom_id`
indices still map to the correct cases — then calls `_pollAndGrade()` directly
on the existing batch ID without re-submitting any requests.

## Grader registry

Built-in graders are registered at startup via `registerGrader({ type, grade() })`
in `graders/registry.ts`. The `runGraders()` dispatcher looks up each criterion's
type in the registry, then falls back to user-land plugins (`.js` files in a
`graders/` directory in CWD).

Plugin errors are isolated — they return `{ passed: false, error: "..." }` and
never crash the runner.

## Semantic cache

Cache key = SHA-256 of `{ model, prompt, system_prompt, temperature, max_tokens }`.
Entries are JSON files in `.eval-cache/`. Any I/O error is silently swallowed.
Cache is skipped when `--no-cache` is passed. Batch mode never uses the cache.

## Multi-turn evals

Cases can use `turns: [{role, content}]` instead of `prompt`. A `content: null`
assistant turn is the one being evaluated. Intermediate null turns are filled by
calling the provider mid-run (not compatible with `--batch`).

## Dataset-backed evals

`dataset.ts` streams `.jsonl` files line-by-line (never loads the whole file).
`{{variable}}` substitution is applied via JSON stringify/replace/parse.
`--dataset <path>` overrides the suite YAML value at runtime.

## Regression detection

`evals diff <baseline> <candidate>` (via `diff.ts`) matches cases by `case_id`,
compares per-grader `passed` flags, and reports regressions (pass→fail) and
improvements (fail→pass). Exit code 1 on any regression.

## Dashboard

`evals dashboard` starts Express at `src/dashboard/server.ts`. REST endpoints:
- `GET /api/runs` — list run summaries
- `GET /api/runs/:id` — full run result
- `GET /api/compare?runIds=id1,id2` — merged case comparison
- `GET /api/diff?baseline=id1&candidate=id2` — regression diff

The React UI (`dashboard-ui/`) is served as static files in production or proxied
from Vite's dev server in development.

## Testing

Unit tests live in `tests/`. Run with `npm test` (vitest).

- `tests/graders/*.test.ts` — grader unit tests (no mocks needed)
- `tests/runner.test.ts` — integration tests with mocked providers and cache
- `tests/batch-runner.test.ts` — batch runner with mocked Anthropic batch SDK
- `tests/dataset.test.ts` — dataset expansion and variable substitution
- `tests/diff.test.ts` — regression diff logic
- `tests/multi-turn.test.ts` — multi-turn conversation building
- `tests/plugins.test.ts` — plugin loader isolation
- `tests/yaml-validation.test.ts` — Zod schema edge cases
- `tests/benchmark.test.ts` — benchmark harness

No test makes real API calls. Providers and the Anthropic SDK are mocked via `vi.mock()`.
