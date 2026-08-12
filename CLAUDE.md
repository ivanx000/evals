# evals — Project Guidelines

## Project Overview

This is a TypeScript/Node.js CLI tool (`evals`) for evaluating LLM outputs against YAML-defined test suites. Think pytest, but for LLM responses.

Key directories:
- `src/` — TypeScript source
- `src/graders/` — individual grader implementations (one file per grader type)
- `src/providers/` — LLM provider wrappers (Anthropic, OpenAI, Ollama, Gemini)
- `src/stores/` — `ResultsStore` (eval run results, `results_dir`) backends: local/S3/GCS
- `src/stores/benchmark/` — `BenchmarkReportStore` (benchmark reports, `reports_dir`) backends: local/S3/GCS
- `src/dashboard/` — Express server + REST API for the web dashboard
- `dashboard-ui/` — standalone Vite + React + TypeScript app (served by Express in prod)
- `docs/` — reference documentation kept in sync with the code
- `examples/` — example suite YAML files, datasets, and plugins
- `examples/datasets/` — `.jsonl` dataset files for dataset-backed evals
- `examples/plugins/` — example custom grader plugins (`.js`)
- `benchmarks/` — domain benchmark definitions (`<name>/tasks.yaml`), read by `evals benchmark run <name>`
- `results/` — auto-saved JSON run results (gitignored, unless `results_dir` points at S3/GCS)
- `reports/` — auto-saved benchmark JSON/MD reports (gitignored, unless `reports_dir` points at S3/GCS)
- `.eval-cache/` — semantic cache for API calls (gitignored)
- `.claude/` — Claude Code hooks and logs (hooks committed, logs gitignored)

## Hooks & Automation

Five hooks run automatically via `.claude/settings.json` whenever Claude edits files or runs bash commands. All hooks fail gracefully — they never block Claude's work.

### Hook 1 — TypeScript + ESLint check (PostToolUse: Edit|Write)

**Script:** `.claude/hooks/post-edit-typecheck.sh`

Fires after any `.ts` file edit. Runs:
1. `npx tsc --noEmit` — full project type check
2. `npx eslint <file>` — lint the edited file only

Results appear in Claude's context via `additionalContext` JSON. If TypeScript errors are found, Claude should fix them before proceeding.

### Hook 2 — Auto-stage and local commit (PostToolUse: Edit|Write)

**Script:** `.claude/hooks/post-edit-autocommit.sh`

Fires after any file edit, with a **120-second cooldown** to avoid one commit per file when Claude edits several files in sequence.

What it does:
1. Runs `git add -A` to stage all changes
2. Generates a conventional-commit message from the staged file paths (e.g., `feat(graders): update exact_match.ts`)
3. Runs `git commit -m "<message>"`
4. Prints confirmation to Claude's context

**`git push` is intentionally never called.** All commits remain local. Push manually when ready:
```bash
git push
```

The cooldown timestamp is stored in `/tmp/llm-eval-last-commit-ts`.

### Hook 3 — Docs sync reminder (PostToolUse: Edit|Write)

**Script:** `.claude/hooks/post-edit-docs-sync.sh`

Fires after edits to these paths and prints a warning to Claude's context:

| Edited file | Reminder |
|---|---|
| `src/graders/*` | Update `docs/graders.md` + check `src/types.ts` Zod schema |
| `src/providers/*` | Update `docs/providers.md` (config options, models, pricing) |
| `src/cli.ts` | Update `docs/getting-started.md` if commands/flags changed, and check the README.md command table is still accurate |
| `CLAUDE.md` | No reminder (self-contained) |

### Hook 4 — Bash command logger (PreToolUse: Bash)

**Script:** `.claude/hooks/pre-bash-logger.sh`

Fires before every bash command Claude runs. Appends a log entry to:

```
.claude/logs/commands.log
```

Format: `[2026-06-06T03:41:19Z] git status`

To read recent entries:
```bash
tail -50 .claude/logs/commands.log
```

The `logs/` directory is gitignored. Each session appends to the same file — it accumulates across sessions. To clear: `> .claude/logs/commands.log`.

### Hook 5 — Test runner (PostToolUse: Edit|Write)

**Script:** `.claude/hooks/post-edit-test-runner.sh`

Fires after edits to `src/` or `tests/`. Runs `npm test`.

- If no test files (`*.test.ts`, `*.spec.ts`) exist: silently skips
- If tests pass: prints `✅ All tests passing` to Claude's context
- If tests fail: prints the last 30 lines of output and tells Claude to fix before proceeding

Tests live in `tests/` and run with vitest. Add `*.test.ts` files there and the hook picks them up automatically.

## Development Workflow

```bash
npm run build      # compile TypeScript → dist/
npm run typecheck  # tsc --noEmit (fast, no output)
npm run lint       # eslint src --ext .ts
npm run lint:fix   # eslint src --ext .ts --fix
npm test           # vitest run --reporter=verbose
npm run test:watch # vitest (interactive watch mode)
npm run test:coverage # vitest run --coverage

# Dashboard
npm run dashboard:dev          # concurrently: Express API (3000) + Vite UI (5173)
cd dashboard-ui && npm run build  # build UI to dashboard-ui/dist/
evals dashboard                 # serve built UI + API, opens browser at localhost:3000
```

## Dashboard architecture

`evals dashboard` starts an Express server at `src/dashboard/server.ts` and opens the browser.

The React app lives in `dashboard-ui/` (Vite + React + TypeScript + Tailwind + Recharts).

REST API endpoints served by Express:
- `GET /api/runs` — list all runs as summaries
- `GET /api/runs/:id` — full run result JSON
- `GET /api/compare?runIds=id1,id2` — merged case comparison
- `GET /api/diff?baseline=id1&candidate=id2` — regression diff between two runs
- `GET /api/benchmarks` — list saved benchmark reports as summaries (optional `?benchmark=<name>` filter)
- `GET /api/benchmarks/:id` — full `BenchmarkReport` JSON, matched by `run_id`

`makeApiHandlers(resultsDir, reportsDir?)` in `src/dashboard/api.ts` resolves
`reportsDir` from an explicit arg, else a `reports/` sibling of `resultsDir`
— but only when `resultsDir` is a local path; a remote (`s3://`/`gs://`)
`resultsDir` falls back to the plain `./reports` default instead of
computing a nonsensical sibling path.

In development, Vite proxies `/api/*` to Express (`vite.config.ts`).
In production, Express serves `dashboard-ui/dist/` as static files, with a
SPA-fallback route (`app.get("/*splat", ...)` in `server.ts`) that returns
`index.html` for any non-API path. **The route must use a named wildcard**
(`/*splat`) — Express 5's `path-to-regexp@8` rejects a bare `"*"` pattern
(`Missing parameter name at index 1: *`), which previously made the
dashboard crash on startup any time `dashboard-ui/dist/` existed.

See `docs/dashboard.md` for full reference.

## Phase 3 features (deeper eval capabilities)

- **Dataset support.** `src/dataset.ts` streams `.jsonl` files line-by-line using Node.js `readline`
  (never loads the whole file into memory). `{{variable}}` substitution works via JSON stringify/replace/parse.
  `EvalSuiteSchema` has optional `dataset`, `dataset_limit`, `dataset_sample` fields.
  `--dataset <path>` CLI flag overrides the YAML value at runtime.

- **Multi-turn evals.** Cases can use `turns: [{role, content}]` instead of `prompt`.
  `content: null` means the model fills in that turn. Intermediate null turns are filled by calling
  the provider; the last null turn is evaluated by graders. `ProviderCallOptions` now accepts either
  `prompt` (string) or `messages` (array) — both providers handle both.

- **Regression detection.** `src/diff.ts` + `evals diff <baseline> <candidate>` command.
  Matches cases by `case_id`, compares per-grader results, detects regressions (pass→fail) and
  improvements (fail→pass). `--format json` for CI pipelines. Exit code 1 on any regression.
  The Compare page in the dashboard has a Regressions tab using `GET /api/diff`.
  The dashboard also has a separate Benchmarks page (`dashboard-ui/src/pages/Benchmarks.tsx`)
  for `evals benchmark` reports — unrelated to this diff mechanism, see "Domain benchmarks" below.

- **Custom grader plugins.** `src/plugins.ts` scans `graders/` in CWD at startup, dynamically imports
  `.js`/`.mjs` files, validates the `{ type, run }` shape, checks for built-in conflicts.
  Plugins are cached per process via `pluginCache` in `src/graders/index.ts`. Call
  `resetPluginCache()` in tests that need a fresh plugin state. Plugin errors are isolated —
  they return `{ passed: false, error: "..." }` and never crash the runner.

## Later grader additions

`numeric_tolerance` (relative-error tolerance on the last number extracted from
free-text output), `calibration` (parses a structured `ANSWER:`/`CONFIDENCE:`
block, attaches `{ answer, expected, correct, confidence }` to
`GraderResult.metadata` for Brier-score analysis), `json_schema` (AJV
validation against a JSON Schema, with `extract_json` fence-stripping), and
`json_path` (JSONPath extraction + `equals`/`gt`/`gte`/`lt`/`lte`/`contains`
condition) — see `docs/graders.md`.

## Remote storage (results & benchmark reports)

- **`ResultsStore`** (`src/stores/types.ts`) — `save(result)`/`list()`/`load(id)`.
  `makeResultsStore(resultsDir)` (`src/stores/index.ts`) dispatches on the
  `results_dir` string's scheme (`s3://`, `gs://`, else local path) to
  `LocalResultsStore`/`S3ResultsStore`/`GCSResultsStore`. `saveResult`/
  `listResults`/`loadResult` in `runner.ts` are thin async wrappers. `list()`/
  `save()` return fully-qualified ids; `load(id)` re-parses bucket+key from the
  id itself, so it's self-sufficient regardless of which store produced it.

- **`BenchmarkReportStore`** (`src/stores/benchmark/types.ts`) — same shape
  plus two extensions: `list(benchmarkName?)` scopes the listing to one
  benchmark's subdirectory/prefix (regression detection only ever needs one
  benchmark's history, so this avoids scanning every report ever saved), and
  `saveMarkdown(report, markdown)` persists the human-readable `.md` twin
  through the same backend. `makeBenchmarkStore(reportsDir)`
  (`src/stores/benchmark/index.ts`) dispatches the same way. Reports nest
  under a slugified-benchmark-name subdirectory/key-prefix on every backend.

- **Shared helpers.** `parseBucketUri()` (`src/stores/uri.ts`) is shared by
  both dispatchers. The S3/GCS lazy SDK loaders and error formatters
  (`loadAwsSdk`/`formatS3Error` in `stores/s3.ts`,
  `loadGcsSdk`/`formatGcsError` in `stores/gcs.ts`) are exported and reused by
  `stores/benchmark/{s3,gcs}.ts` rather than duplicated.

- **Cloud SDKs are optional peer deps** (`@aws-sdk/client-s3`,
  `@google-cloud/storage`), lazy-`import()`ed only when a remote URI is
  actually used, for both stores. Missing-credential/bucket errors are
  formatted into clear messages, never raw SDK stack traces.

- **CLI path handling.** `results_dir`/`reports_dir` can be `s3://`/`gs://` —
  `path.resolve()` would mangle those (treats them as a relative path
  segment). `resolveStorageLocation()` in `cli.ts` passes remote URIs through
  unchanged and only resolves local paths to absolute.

See `docs/results-storage.md` and `docs/benchmark-storage.md`.

## Domain benchmarks

`evals benchmark run <name>` (`src/benchmark.ts`) runs
`benchmarks/<name>/tasks.yaml` (schema in `src/benchmark-types.ts`) by
converting each task to a regular `EvalCase` via `runSuite()`, then computes
accuracy, by-category/by-difficulty breakdowns, an optional calibration Brier
score (`computeCalibration()`, only over `calibration`-graded tasks), and
regression vs. the most recent previous report for the same benchmark **and**
model (`findPreviousReport()`, via `BenchmarkReportStore`). `--regression-threshold`
(default 5 percentage points) controls when `regression.threshold_exceeded`
(and thus a non-zero exit code) is set. `evals benchmark list` and the
dashboard's `/api/benchmarks` both go through `listBenchmarkReports()`. This
is distinct from `evals diff`, which compares two arbitrary saved eval-run
JSON files. See `docs/benchmarks.md`.

## Key design decisions (hardening phase)

- **Graders never throw.** Every grader wraps its logic in try/catch and returns
  `{ passed: false, error: "..." }` on failure. `runGraders()` also wraps each
  dispatch so one broken grader can't prevent others from running.

- **llm_judge creates its Anthropic client per-call** (not module-level) so that
  the Anthropic SDK can be cleanly mocked in tests via `vi.mock('@anthropic-ai/sdk')`.

- **Provider constructors throw on missing API key.** This gives a clear error
  immediately, but the CLI also guards before calling `runSuite()` so the error
  is surfaced before any case processing begins.
  **Exception: OllamaProvider** never requires an API key — it passes `"ollama"` as a placeholder.

- **OllamaProvider uses the OpenAI SDK** pointed at `http://localhost:11434/v1` (Ollama's
  OpenAI-compatible endpoint). `OLLAMA_HOST` env var overrides the base URL.
  Cost is always `$0.00`. Connection errors and 404 (model not pulled) produce actionable messages.

- **`provider/model` format** is supported in `evals compare --models`.
  `parseProviderModel()` in `cli.ts` splits on the first `/`. Bare model names fall back
  to the `--provider` flag default. `RunOptions.providerOverride` lets the runner use a
  different provider than what the suite YAML specifies.

- **Retry uses exponential backoff with jitter.** See `src/providers/retry.ts`.
  Max 3 retries. Retryable: 429, 500, 502, 503, network errors. 401 is not retried.

- **Timeout uses Promise.race**, not AbortController (providers don't support
  cancellation). The race resolves to a failed CaseResult — it never rejects —
  so the runner always gets a valid object to aggregate.

- **Concurrency uses a Semaphore + Promise.all**. Results are always in suite
  input order because Promise.all preserves order.

- **YAML errors are field-level.** `loadSuite()` uses `safeParse` and formats
  each Zod issue as `• field.path: message` on separate lines.

## Extending the Framework

### Grader plugin architecture

Graders are dispatched through a registry (`src/graders/registry.ts`). At startup, all
built-in graders are registered with `registerGrader({ type, grade() })`. The `Grader`
interface lives in `src/graders/types.ts`:

```ts
interface Grader {
  readonly type: string;
  grade(response: string, task: Record<string, unknown>, context?: GraderContext): Promise<GraderResult>;
}
```

`runGraders()` in `index.ts` looks up each criterion's type in the registry, falls back
to user-land plugins (`.js` files in `graders/`), and returns a clear error for truly
unknown types.

To register a built-in grader programmatically (e.g., in tests):
```ts
import { registerGrader } from "./src/graders/registry.js";
registerGrader({ type: "my_grader", async grade(output, criteria) { ... } });
```

### Adding a built-in grader
1. Create `src/graders/<name>.ts` — wrap all logic in try/catch, return
   `{ criteria_type, passed, error }` on failure, never throw
2. Add Zod schema + type to `src/types.ts` and include in `CriteriaSchema`
3. Register in `src/graders/registry.ts` with `registerGrader({ type, grade() })`
4. Add the type string to `BUILTIN_TYPES` in `src/plugins.ts`
5. Export the grader function from `src/graders/index.ts`
6. Add unit tests in `tests/graders/<name>.test.ts`
7. Update `docs/graders.md`

### Adding a provider
1. Create `src/providers/<name>.ts` implementing `LLMProvider`
   — validate API key in constructor; use `withRetry()` for the API call;
   throw with a clear message on 401/429/5xx
2. Add pricing to `src/types.ts`
3. Register in `src/runner.ts` `makeProvider()`
4. Add API key guard in `cli.ts` `checkApiKeys()`
5. Update `docs/providers.md`

### Adding a CLI command
1. Add `.command()` to `src/cli.ts`
2. Update `docs/getting-started.md`, and the README.md command table if it's a top-level command

### Adding a custom grader plugin (user-land)
1. Create `graders/<name>.js` in the project root
2. Export `{ type, run }` as the default export
3. Use the grader type in YAML criteria — no other changes needed
4. See `docs/graders.md` and `examples/plugins/sentiment_grader.js` for the full interface

### Adding a results/report storage backend
1. Create `src/stores/<name>.ts` (or `src/stores/benchmark/<name>.ts` for
   benchmark reports) implementing `ResultsStore`/`BenchmarkReportStore`
   — lazy-`import()` the SDK, throw clear errors on missing credentials/buckets
2. Register the URI scheme in `makeResultsStore()`/`makeBenchmarkStore()`
3. Add the SDK as an optional peer dependency in `package.json`
4. Add unit tests mocking the SDK via `vi.mock()` (see `tests/stores/s3.test.ts`)
5. Update `docs/results-storage.md` / `docs/benchmark-storage.md`
