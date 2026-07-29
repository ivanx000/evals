# CI/CD Integration

This page is the recipe for wiring `evals` into a build pipeline: run a suite,
diff it against a baseline, and fail the build on regressions. For the `diff`
command itself (matching logic, JSON shape, dashboard view), see
[regression-detection.md](./regression-detection.md).

## The pieces

| Piece | Already does this |
|---|---|
| `evals run <suite> --output <path>` | Writes results to a fixed path instead of a timestamped one — required so a later `diff` step can find both files. |
| `evals run` exit code | `1` if any case fails, **or if 0 cases matched** (bad `--filter`/`--tag`/dataset — see below), `0` otherwise. |
| `evals diff <baseline> <candidate>` | `1` if any case regressed (pass → fail), `0` otherwise. `--format json` for machine-readable output. |

Nothing new to build — the exit codes are already CI-ready. What's missing is
the glue: where the baseline file comes from on each run.

## Recipe

### 1. Run with a fixed output path

```bash
evals run suite.yaml --output candidate.json
```

### 2. Get a baseline file onto disk

`evals diff` just needs two JSON files — how you produce `baseline.json` is a
CI-plumbing choice, not an `evals` feature. Three common approaches:

**A. Cache/artifact from the last main-branch run** (used in the example
workflow below). On every push to `main`, run the suite and cache the result;
PR builds restore that cache before diffing. No extra files checked into the
repo, and the baseline tracks whatever's actually on `main` right now. Simple,
but `actions/cache` evicts entries after 7 days of inactivity and is capped
at 10GB per repo — fine for a demo, not durable for a long-lived pipeline.

**B. A committed fixture.** Check a known-good `results/baseline.json` into
the repo and update it deliberately (e.g. in the same PR that changes a
prompt) when you want to move the goalposts. Simpler to reason about, but the
baseline can drift out of sync with `main` if people forget to update it.

**C. Remote result storage (S3/GCS).** Point `results_dir` at an
`s3://bucket/prefix` or `gs://bucket/prefix` URI (see
[results-storage.md](./results-storage.md)) so `evals run` on `main` writes
the baseline straight to a bucket instead of a GitHub Actions cache entry.
`evals diff` accepts `s3://`/`gs://` URIs directly, so the regression job can
diff against the bucket without a restore step. Durable (no eviction, no size
cap tied to the repo), and shareable across CI providers or local runs — the
right choice once A's 7-day/10GB ceiling becomes a real constraint rather
than a demo caveat.

Start with A unless you specifically want the baseline to be reviewable in
diffs (then use B) or need it to outlive `actions/cache`'s retention limits
(then use C).

### 3. Diff and fail the build

```bash
evals diff baseline.json candidate.json --format json > diff.json
```

Exit code is `1` if `diff.json`'s `regressions` array is non-empty — that
alone is enough to fail a CI step. Run the non-JSON form too if you want a
human-readable table for the job log or step summary (see the workflow
below).

### 4. Handle "no baseline yet"

The first run on a fresh `main` branch (or first PR after a cache eviction)
won't have a baseline to diff against. Treat a missing baseline file as a
skip, not a failure — don't let bootstrapping block every PR.

## Watch out for: zero cases matched

If `--filter`, `--tag`, or a dataset override ends up matching zero cases,
`evals run` reports `total: 0, failed: 0` — which used to exit `0`. That's a
silent CI hole: a typo'd `--tag` flag would make the check pass while
evaluating nothing.

`evals run` now treats **0 matched cases as a CI failure** (exit code `1`,
with an error naming `--filter`/`--tag`/dataset as the likely cause) unless
it's a `--dry-run`. No flag needed to opt into this — it was already a bug,
not a feature, for a suite to go green without running anything. `evals
batch` (batch resume) has the same guard for the same reason.

This was the one real gap CI integration needed closing. `evals run`'s
handling of API-level failures was already correct: when a provider call
throws, the case's `error` field is set, which forces `passed: false` and
rolls up into `failed`, so a suite where every case errors out already exits
`1` — no case ever silently reports as passed just because the API call blew
up.

## GitHub Actions example

[.github/workflows/eval-regression.yml](../.github/workflows/eval-regression.yml)
implements the full loop:

- **`update-baseline`** job — runs on every push to `main`, runs the suite,
  and caches the result under a key that includes the run id
  (`eval-baseline-<run_id>`).
- **`eval-regression`** job — runs on pull requests targeting `main`. It
  restores the most recent `eval-baseline-*` cache entry (via a
  `restore-keys` prefix match — this is how "give me the latest one" works
  with `actions/cache`, since cache keys are otherwise exact-match), runs the
  suite on the PR branch, then diffs the two and writes the human-readable
  table to `$GITHUB_STEP_SUMMARY` so reviewers see regressions directly on the
  PR's checks tab. Both JSON files are also uploaded as a build artifact.

To use it:

1. Add `ANTHROPIC_API_KEY` (or whichever provider's key your suite needs) as
   a repository secret.
2. Edit the `SUITE` env var at the top of the workflow to point at your suite
   file.
3. Merge to `main` once to seed the first baseline — the very next PR will
   have something to diff against.

This is a separate workflow from
[.github/workflows/eval.yml](../.github/workflows/eval.yml), which just runs
the suite and uploads results without diffing. Use `eval.yml` if you only
want a pass/fail gate on the suite itself; use `eval-regression.yml` when you
want PRs to call out exactly what changed relative to `main`.

## Benchmark regression in CI

`evals benchmark run <name>` (see [benchmarks.md](./benchmarks.md)) has
regression detection *built in* — every run automatically looks up the most
recent previous report for the same benchmark + model
(`findPreviousReport()`) and fails (exit code `1`) when accuracy drops by
more than `--regression-threshold` points. This is a different shape of
problem from the `evals diff` recipe above: `evals diff` just needs two named
JSON files, but `findPreviousReport()` needs the *accumulated history* of
past reports sitting in `reports_dir` at run time, so it can find "most
recent report, same benchmark + model." A cache keyed by run id (approach A
above) doesn't fit — there's no single "latest" entry to restore, there's a
whole directory that needs to keep growing across runs.

[.github/workflows/benchmark-regression.yml](../.github/workflows/benchmark-regression.yml)
handles this with approach C from above — remote report storage — since it's
the one option that's actually durable across accumulating runs and needs no
cache/restore choreography:

- `reports_dir` points at an `s3://` bucket (`$REPORTS_DIR` env var at the
  top of the workflow) that acts as the permanent, shared history for this
  benchmark.
- **Push to main** writes straight to that bucket — each push both checks
  for regressions against the last main-branch run *and* extends the
  canonical history.
- **PRs must not write into that same bucket.** If a PR's (possibly
  regressed, possibly never-merged) run became "most recent," it would
  poison the comparison for the next PR or the next main push. Instead, the
  PR job `aws s3 sync`s the bucket down to a local `./reports` directory
  read-only, runs the benchmark against that local copy — so it still diffs
  against real main-branch history — and never syncs anything back up.

To use it:

1. Create the S3 bucket (or GCS bucket — swap the `aws s3 sync` step for
   `gsutil -m rsync -r` and the AWS secrets for
   `GOOGLE_APPLICATION_CREDENTIALS`, see
   [benchmark-storage.md](./benchmark-storage.md)) and edit `REPORTS_DIR` at
   the top of the workflow to point at it.
2. Add `ANTHROPIC_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
   `AWS_REGION` as repository secrets.
3. Merge to `main` once to seed the first report — before that, every run
   has no history to compare against, so `regression` is just `null` (not a
   failure).

The human-readable terminal summary (`printBenchmarkSummary`, which always
includes ANSI color codes) is captured, stripped of escape codes, and
written to `$GITHUB_STEP_SUMMARY` in a code fence — the same "make regressions
visible on the PR checks tab" goal as `eval-regression.yml`'s diff table,
just sourced from the benchmark's own terminal output instead of a diff.

This workflow runs on every push to `main` and every PR — real, billed API
calls each time (`financial-reasoning` uses `numeric_tolerance`, `llm_judge`,
and `calibration`, and the latter two always require `ANTHROPIC_API_KEY`
regardless of `--provider`). Mirrors `eval-regression.yml`'s trigger exactly;
if that cost profile becomes a problem, moving to a schedule-only trigger or
gating PR runs behind a label are the two straightforward alternatives — this
just wasn't the tradeoff made here.

## Suite validation as a fast pre-flight

`--dry-run` validates the YAML and prints what would run without calling any
API or spending quota — cheap enough to run unconditionally before the real
suite, so a broken YAML file fails fast instead of burning API calls first:

```bash
evals run suite.yaml --dry-run
evals run suite.yaml --output candidate.json
```
