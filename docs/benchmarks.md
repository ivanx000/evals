# Domain Benchmarks

A "benchmark" is a fixed, versioned set of domain tasks (e.g. financial reasoning,
coding) used to score a model with a single accuracy number, category/difficulty
breakdowns, an optional calibration score, and automatic regression detection
against the previous run — as opposed to `evals run`, which is for ad hoc,
evolving eval suites.

## Directory layout

```
benchmarks/
  <benchmark-name>/
    tasks.yaml       # the benchmark definition
```

`evals benchmark run <name>` looks for `benchmarks/<name>/tasks.yaml` relative
to the current directory. The repo ships one example:
[benchmarks/financial-reasoning/tasks.yaml](../benchmarks/financial-reasoning/tasks.yaml)
— a CFA Level 1–style set covering ratio analysis, earnings interpretation,
risk assessment, and market concepts.

## `tasks.yaml` format

```yaml
name: "Financial Reasoning"
version: "1.0.0"
description: >
  Optional free-text description.
system_prompt: >-
  Optional system prompt sent with every task in this benchmark. Falls back
  to a generic "answer accurately and concisely" prompt if omitted.

tasks:
  - id: pe_ratio_basic
    question: >
      Company XYZ has a stock price of $75.00 and earned $5.00 per share.
      Calculate the P/E ratio. Provide only the final numerical answer.
    reference_answer: "15.0"
    grader: numeric_tolerance
    tolerance_pct: 2.0
    difficulty: easy
    category: ratio_analysis

  - id: eps_dilution
    question: "..."
    reference_answer: "EPS decreases from $0.50 to approximately $0.42..."
    grader: llm_judge
    rubric: >
      Score 5 if the response identifies the new EPS and explains the
      dilution mechanism. Score 3 if the direction is right but
      quantification is missing. Score 1 if the direction is wrong.
    difficulty: medium
    category: earnings_interpretation

  - id: pe_ratio_calibrated
    question: "... Respond ONLY as: ANSWER: <value> CONFIDENCE: <0-100>"
    reference_answer: "15.0"
    expected: "15.0"
    grader: calibration
    difficulty: easy
    category: ratio_analysis
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Benchmark display name — also slugified for the reports subdirectory (see [benchmark-storage.md](./benchmark-storage.md)) |
| `version` | string | yes | Free-form version string, shown in reports |
| `description` | string | no | Free-text description |
| `system_prompt` | string | no | System prompt sent with every task in this benchmark. Falls back to a generic domain-neutral prompt (`"Answer the following question accurately and concisely."`, `DEFAULT_SYSTEM_PROMPT` in `src/benchmark.ts`) if omitted — set this explicitly for any benchmark that wants a persona or domain framing, e.g. the shipped `financial-reasoning` benchmark sets a CFA-analyst prompt |
| `tasks` | array | yes, min 1 | Task definitions (below) |

### Task fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique task ID, used for regression matching across runs |
| `question` | string | yes | The prompt sent to the model |
| `reference_answer` | string | yes | Ground-truth answer, shown in reports (not necessarily what's graded — see `grader`) |
| `grader` | `numeric_tolerance` \| `calibration` \| `llm_judge` | yes | How the task is scored |
| `tolerance_pct` | number | `numeric_tolerance` only | Relative error tolerance, percent (default `2.0`) |
| `rubric` | string | `llm_judge` only | Required — validation fails at load time if `grader: llm_judge` has no `rubric` |
| `expected` | string | `calibration` only | Expected answer string the extracted `ANSWER:` must match (falls back to `reference_answer` if omitted) |
| `difficulty` | `easy` \| `medium` \| `hard` | yes | Used for the by-difficulty breakdown |
| `category` | string (free-form, non-blank) | yes | Used for the by-category breakdown — any non-empty string, e.g. `ratio_analysis` or a category from an unrelated domain |

`grader` maps directly onto the built-in graders documented in
[graders.md](./graders.md) (`numeric_tolerance`, `calibration`, `llm_judge`) —
`runBenchmark()` (`src/benchmark.ts`) converts each task into a regular
`EvalCase` with one criterion, appending the
`ANSWER: <answer>\nCONFIDENCE: <0-100>` instruction format automatically for
`calibration` tasks.

`category` is a free-form, non-blank string validated by `BenchmarkTaskSchema`
in `src/benchmark-types.ts` — any value works, it just becomes the grouping
key for the by-category breakdown. The shipped example uses financial-domain
categories (`ratio_analysis`, `earnings_interpretation`, `risk_assessment`,
`market_concepts`), but a benchmark in a different domain can use whatever
categories make sense for it.

## Running a benchmark

```bash
evals benchmark run financial-reasoning
evals benchmark run financial-reasoning --model claude-opus-4-8 --provider anthropic
evals benchmark run financial-reasoning --concurrency 4 --timeout 90000
evals benchmark run financial-reasoning --regression-threshold 10
evals benchmark run financial-reasoning --report-dir s3://my-team-evals/reports
```

| Flag | Default | Description |
|---|---|---|
| `--provider <provider>` | `default_provider` in config, else `anthropic` | `anthropic` \| `openai` \| `ollama` \| `gemini` |
| `-m, --model <model>` | `default_model` in config, else `claude-opus-4-8` | Model to benchmark |
| `--report-dir <dir>` | `reports_dir` in config, else `./reports` | Local path or `s3://`/`gs://` URI — see [benchmark-storage.md](./benchmark-storage.md) |
| `--regression-threshold <pct>` | `5` | Accuracy drop (percentage points) that flags `threshold_exceeded` |
| `--concurrency <n>` | `1` | Tasks run in parallel |
| `--timeout <ms>` | `60000` | Per-task timeout |
| `--no-cache` | — | Disable the semantic cache |
| `-c, --config <path>` | auto-discovered | Path to `.evalrc.json` |

`llm_judge` scoring needs `ANTHROPIC_API_KEY` regardless of `--provider`,
same as the `llm_judge` grader in regular suites. The CLI checks the
benchmark's `tasks.yaml` before running and only requires the key when at
least one task actually uses `grader: llm_judge` — a benchmark made entirely
of `numeric_tolerance`/`calibration` tasks runs fine against `--provider
ollama` with no Anthropic key configured at all.

Exit code is `1` when `report.regression?.threshold_exceeded` is true (i.e.
accuracy dropped by more than `--regression-threshold` versus the previous
run for the same benchmark + model), `0` otherwise.

### Output

Terminal output shows overall accuracy, by-category and by-difficulty
breakdowns, a calibration Brier score (if any `calibration` tasks ran),
regression vs. the previous run (if one exists), and a per-task pass/fail
list.

Two report files are saved per run, under a slugified benchmark-name
subdirectory of `reports_dir`:

```
reports/
  financial-reasoning/
    2026-07-28T00-00-00-000Z-claude-opus-4-8.json   # machine-readable, read by regression detection + dashboard
    2026-07-28T00-00-00-000Z-claude-opus-4-8.md      # human-readable summary
```

See [benchmark-storage.md](./benchmark-storage.md) for the storage backend
(local/S3/GCS) that writes these.

## Listing reports

```bash
evals benchmark list
evals benchmark list --benchmark financial-reasoning
evals benchmark list --report-dir s3://my-team-evals/reports
```

Prints every saved report (timestamp, benchmark name, model, accuracy, Brier
score, run ID), newest first. `evals dashboard` exposes the same data over
`GET /api/benchmarks` / `GET /api/benchmarks/:id` — see
[dashboard.md](./dashboard.md).

## Calibration (Brier score)

`calibration` tasks ask the model to state a confidence (0–100) alongside its
answer. `computeCalibration()` (`src/benchmark.ts`) computes the
[Brier score](https://en.wikipedia.org/wiki/Brier_score) — mean squared error
between stated confidence (as a probability) and actual correctness — over
all `calibration` tasks in the run:

| Brier score | Interpretation |
|---|---|
| < 0.15 | `well-calibrated` |
| mean confidence − pass rate > 0.10 | `overconfident` |
| mean confidence − pass rate < −0.10 | `underconfident` |
| fewer than 3 calibration tasks | `insufficient-data` (score reported as `0`, not meaningful) |

A benchmark with zero `calibration` tasks reports `calibration: null`.

## Regression detection

Distinct from `evals diff` (which compares two arbitrary saved eval-run JSON
files by `case_id` — see [regression-detection.md](./regression-detection.md)):
benchmark regression is automatic and built into `evals benchmark run`. Each
run looks up the most recent previous report *for the same benchmark and the
same model* (`findPreviousReport` in `src/benchmark.ts`, scoped to that
benchmark's `reports_dir` subdirectory) and compares:

- **Per-task pass/fail** — `regressed_tasks` (pass → fail) and
  `improved_tasks` (fail → pass), matched by task `id`
- **Accuracy delta** — flags `threshold_exceeded` when accuracy drops by more
  than `--regression-threshold` percentage points
- **Latency and cost deltas** — reported, not gated

No previous report for that benchmark + model combination → `regression` is
`null` in the report (first run, or first run on a new model).

See [ci.md](./ci.md#benchmark-regression-in-ci) for wiring this into GitHub
Actions — the accumulating-history requirement here needs a different CI
setup than `evals diff`'s two-named-files comparison.

## Extending

Adding a new benchmark, in an existing domain or a new one, is just a new
`benchmarks/<name>/tasks.yaml` file — no code changes. `category` is
free-form (any non-blank string), so a new domain can define its own
category set without touching `BenchmarkTaskSchema`. `difficulty`
(`easy`/`medium`/`hard`) and `grader`
(`numeric_tolerance`/`calibration`/`llm_judge`) are shared across all domains
and don't need changes either. A new domain should also set its own
top-level `system_prompt` — it isn't inferred from `category`, and the
fallback if you omit it is a generic, domain-neutral prompt, not any
particular domain's framing:

```yaml
name: "Legal Reasoning"
version: "1.0.0"
system_prompt: >-
  You are a legal analyst with expertise in case law and statutory
  interpretation. Answer questions accurately and concisely.

tasks:
  - id: contract_breach_basic
    question: "..."
    reference_answer: "..."
    grader: llm_judge
    rubric: "..."
    difficulty: medium
    category: contract_law
```
