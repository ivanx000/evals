# Architecture

## Overview

```
cli.ts          ← entry point, flag parsing, API key guards
  └── runner.ts ← suite loading, case orchestration, caching
        ├── providers/anthropic.ts  ← Anthropic SDK wrapper
        ├── providers/openai.ts     ← OpenAI SDK wrapper
        ├── providers/retry.ts      ← shared retry utility
        └── graders/               ← one file per criterion type
              ├── index.ts          ← dispatch router
              ├── exact_match.ts
              ├── contains.ts
              ├── max_words.ts
              ├── regex.ts
              └── llm_judge.ts
```

Supporting modules:

- `types.ts` — all Zod schemas and TypeScript interfaces
- `config.ts` — loads `.evalrc.json` / env vars into `EvalConfig`
- `cache.ts` — SHA-256 keyed semantic cache on disk
- `reporter.ts` — terminal table output (cli-table3)

## Error Handling

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

Providers (`AnthropicProvider`, `OpenAIProvider`) validate the API key in their
constructors and throw a clear, actionable message if it is missing.

API calls are wrapped in `withRetry()` (max 3 retries, exponential backoff + jitter).
Retryable status codes: 429, 500, 502, 503. Network errors are also retried.
Non-retryable errors (e.g., 401 auth failures) throw immediately with a specific message.

### Runner errors

`loadSuite()` catches all errors from file I/O, YAML parsing, and Zod schema
validation, and re-throws them as single-line messages like:

```
Suite validation failed in suite.yaml:
  • name: Required
  • cases.0.criteria: Array must contain at least 1 element(s)
```

`runCase()` catches all provider errors and stores them in `CaseResult.error`.
A case with an error is automatically marked `passed: false`. The runner never
crashes because one case fails — it continues to the next.

Per-case timeout is enforced with `Promise.race`. A timed-out case gets
`error: "Timeout: case exceeded Xms"` and `passed: false`.

### CLI errors

Before any API call, `cli.ts` checks that the required API key is present in
`EvalConfig` and prints a human-readable setup instruction, then exits with code 1.

A global `unhandledRejection` handler at the top of `cli.ts` catches any
promise that escapes the try/catch chain and prints it cleanly rather than
letting Node.js print a raw stack trace.

All failure paths exit with code 1. Success exits with code 0.

## Concurrency model

`runSuite()` uses a `Semaphore` class to bound parallel case execution.
`Promise.all()` is used over all case promises (which respects semaphore limits),
so the result array is always in suite input order regardless of completion order.

The default `--concurrency 1` is equivalent to the old sequential `for` loop.

## Semantic cache

Cache key = SHA-256 of `{ model, prompt, system_prompt, temperature, max_tokens }`.
Cache entries are JSON files in `.eval-cache/`. Reads and writes are best-effort:
any I/O error is silently swallowed so cache failures never block evaluation runs.

## Testing

Unit tests live in `tests/`. Run with `npm test` (vitest).

- `tests/graders/*.test.ts` — grader unit tests (no mocks needed)
- `tests/runner.test.ts` — integration tests with mocked providers and cache
- `tests/yaml-validation.test.ts` — direct Zod schema tests

No test makes real API calls. Providers are mocked via `vi.mock()`.
