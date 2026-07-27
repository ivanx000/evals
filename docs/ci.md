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
CI-plumbing choice, not an `evals` feature. Two common approaches:

**A. Cache/artifact from the last main-branch run** (used in the example
workflow below). On every push to `main`, run the suite and cache the result;
PR builds restore that cache before diffing. No extra files checked into the
repo, and the baseline tracks whatever's actually on `main` right now.

**B. A committed fixture.** Check a known-good `results/baseline.json` into
the repo and update it deliberately (e.g. in the same PR that changes a
prompt) when you want to move the goalposts. Simpler to reason about, but the
baseline can drift out of sync with `main` if people forget to update it.

Start with A unless you specifically want the baseline to be reviewable in
diffs — then use B.

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

## Suite validation as a fast pre-flight

`--dry-run` validates the YAML and prints what would run without calling any
API or spending quota — cheap enough to run unconditionally before the real
suite, so a broken YAML file fails fast instead of burning API calls first:

```bash
evals run suite.yaml --dry-run
evals run suite.yaml --output candidate.json
```
