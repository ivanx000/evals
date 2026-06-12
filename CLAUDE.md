# LLM Evaluation CLI — Project Guidelines

## Project Overview

This is a TypeScript/Node.js CLI tool (`eval`) for evaluating LLM outputs against YAML-defined test suites. Think pytest, but for LLM responses.

Key directories:
- `src/` — TypeScript source
- `src/graders/` — individual grader implementations (one file per grader type)
- `src/providers/` — LLM provider wrappers (Anthropic, OpenAI, Ollama)
- `src/dashboard/` — Express server + REST API for the web dashboard
- `dashboard-ui/` — standalone Vite + React + TypeScript app (served by Express in prod)
- `docs/` — reference documentation kept in sync with the code
- `examples/` — example suite YAML files, datasets, and plugins
- `examples/datasets/` — `.jsonl` dataset files for dataset-backed evals
- `examples/plugins/` — example custom grader plugins (`.js`)
- `results/` — auto-saved JSON run results (gitignored)
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
| `src/cli.ts` | Update `docs/getting-started.md` if commands/flags changed |
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

# Dashboard
npm run dashboard:dev          # concurrently: Express API (3000) + Vite UI (5173)
cd dashboard-ui && npm run build  # build UI to dashboard-ui/dist/
eval dashboard                 # serve built UI + API, opens browser at localhost:3000
```

## Dashboard architecture

`eval dashboard` starts an Express server at `src/dashboard/server.ts` and opens the browser.

The React app lives in `dashboard-ui/` (Vite + React + TypeScript + Tailwind + Recharts).

REST API endpoints served by Express:
- `GET /api/runs` — list all runs as summaries
- `GET /api/runs/:id` — full run result JSON
- `GET /api/compare?runIds=id1,id2` — merged case comparison
- `GET /api/diff?baseline=id1&candidate=id2` — regression diff between two runs

In development, Vite proxies `/api/*` to Express (`vite.config.ts`).
In production, Express serves `dashboard-ui/dist/` as static files.

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

- **Regression detection.** `src/diff.ts` + `eval diff <baseline> <candidate>` command.
  Matches cases by `case_id`, compares per-grader results, detects regressions (pass→fail) and
  improvements (fail→pass). `--format json` for CI pipelines. Exit code 1 on any regression.
  The Compare page in the dashboard has a Regressions tab using `GET /api/diff`.

- **Custom grader plugins.** `src/plugins.ts` scans `graders/` in CWD at startup, dynamically imports
  `.js`/`.mjs` files, validates the `{ type, run }` shape, checks for built-in conflicts.
  Plugins are cached per process via `pluginCache` in `src/graders/index.ts`. Call
  `resetPluginCache()` in tests that need a fresh plugin state. Plugin errors are isolated —
  they return `{ passed: false, error: "..." }` and never crash the runner.

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

- **`provider/model` format** is supported in `eval compare --models`.
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

### Adding a grader
1. Create `src/graders/<name>.ts` — wrap all logic in try/catch, return
   `{ criteria_type, passed, error }` on failure, never throw
2. Add Zod schema + type to `src/types.ts` and include in `CriteriaSchema`
3. Register in `src/graders/index.ts` `runGraders()` switch
4. Add unit tests in `tests/graders/<name>.test.ts`
5. Update `docs/graders.md`

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
2. Update `docs/getting-started.md`

### Adding a custom grader plugin (user-land)
1. Create `graders/<name>.js` in the project root
2. Export `{ type, run }` as the default export
3. Use the grader type in YAML criteria — no other changes needed
4. See `docs/graders.md` and `examples/plugins/sentiment_grader.js` for the full interface
