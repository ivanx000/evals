# Roadmap

## Phase 1 — Core CLI ✅
- YAML-defined eval suites
- `evals run` command with model override, filter, timeout, concurrency
- Built-in graders: `exact_match`, `contains`, `max_words`, `regex`, `llm_judge`
- Anthropic and OpenAI providers
- Semantic cache (`.eval-cache/`)
- Auto-save results to `./results/`
- `evals report` command
- `evals compare` multi-model comparison

## Phase 2 — Dashboard ✅
- `evals dashboard` spins up an Express + React app
- Overview page: pass rate chart, cost/latency charts, runs table
- Run detail page: per-case breakdown
- Compare page: side-by-side model output comparison
- REST API: `/api/runs`, `/api/runs/:id`, `/api/compare`

## Phase 3 — Deeper Eval Capabilities ✅
- **Dataset support** — `.jsonl` streaming with `{{variable}}` template substitution; `dataset_limit` and `dataset_sample`; `--dataset` CLI override
- **Multi-turn evals** — `turns: [{role, content}]` case type; intermediate null turns filled by provider; last null turn evaluated
- **Regression detection** — `evals diff <baseline> <candidate>`; per-grader comparison; exit code 1 on regression; `--format json`; Regressions tab in dashboard
- **Custom grader plugins** — auto-discovery from `graders/` folder; `.js`/`.mjs` files; conflict detection; graceful failure isolation

## Phase 4 — Production Hardening ✅ (partial)
- **Batch API support** — `evals run --batch` submits all cases to Anthropic Batches API (50% cost reduction, async); polls with exponential backoff until complete
- **Batch resume** — `evals batch <batchId> <suite>` re-attaches to an in-progress or completed batch; recovers from interrupted runs without re-submitting
- **GitHub Actions integration** — `.github/workflows/eval.yml` runs `evals run` on every push/PR; fails the check on any case failure; caches `node_modules`

## Phase 4 additions ✅
- **YAML suite inheritance** — `extends: ./base.yaml` in a child suite inherits top-level fields (child overrides) and prepends base cases before child cases; circular chains throw immediately
- **Streaming output support** — `--stream` prints token-by-token output to stderr as each case runs (single-turn and multi-turn)
- **Remote result storage (S3, GCS)** — `results_dir` accepts `s3://bucket/prefix` and `gs://bucket/prefix` URIs alongside local paths; `ResultsStore` interface (`src/stores/`) with `LocalResultsStore`/`S3ResultsStore`/`GCSResultsStore`, mirroring the provider-per-backend pattern; `evals diff` accepts remote URIs directly; cloud SDKs are optional peer deps, lazy-loaded only when used. See [results-storage.md](./results-storage.md)
- **New graders** — `numeric_tolerance` (relative-error tolerance on an extracted number, for math/financial reasoning), `calibration` (structured `ANSWER:`/`CONFIDENCE:` parsing + Brier-score metadata), `json_schema` (AJV-validated structured output), `json_path` (JSONPath extraction + condition check) — see [graders.md](./graders.md)

## Phase 5 — Domain Benchmarks ✅
- **Benchmark harness** — `evals benchmark run <name>` runs a fixed, versioned
  task set from `benchmarks/<name>/tasks.yaml` (`src/benchmark.ts`,
  `src/benchmark-types.ts`), converts each task to a regular `EvalCase`, and
  reports overall accuracy plus by-category/by-difficulty breakdowns.
  `evals benchmark list` lists saved reports. See [benchmarks.md](./benchmarks.md)
- **Calibration scoring (Brier score)** — `computeCalibration()` aggregates
  `calibration`-graded tasks' stated confidence vs. actual correctness into a
  Brier score with a well-calibrated/overconfident/underconfident/insufficient-data interpretation
- **Automatic regression detection** — each benchmark run compares itself
  against the most recent previous report for the same benchmark + model
  (`findPreviousReport`), reporting per-task regressions/improvements and an
  accuracy delta; exits `1` when the drop exceeds `--regression-threshold`.
  Distinct from (and unrelated to) `evals diff`'s eval-run comparison
- **Remote benchmark report storage (S3, GCS)** — `reports_dir` accepts
  `s3://`/`gs://` URIs the same way `results_dir` does; `BenchmarkReportStore`
  (`src/stores/benchmark/`) mirrors `ResultsStore` with two additions: a
  benchmark-name-scoped `list()` (regression detection only ever needs one
  benchmark's history) and `saveMarkdown()` for the human-readable report
  twin. `evals dashboard --reports-dir` and `GET /api/benchmarks` read from
  the same store. See [benchmark-storage.md](./benchmark-storage.md)
- **CI regression gate** — [.github/workflows/benchmark-regression.yml](../.github/workflows/benchmark-regression.yml)
  runs `evals benchmark run financial-reasoning` on every push to `main` and
  every PR, writing/reading report history against a shared S3 bucket
  (`reports_dir`) so `findPreviousReport()` has real accumulated history to
  diff against; PRs sync that history down read-only instead of writing into
  the shared prefix, so an unmerged run can't poison the next comparison.
  Fails the check when `regression.threshold_exceeded`. See the "Benchmark
  regression in CI" section of [ci.md](./ci.md)

## Future Ideas
- Fine-grained retry budgets per case
- YAML templating
- Free-form (non-enum) benchmark categories, for benchmarks outside the financial domain
