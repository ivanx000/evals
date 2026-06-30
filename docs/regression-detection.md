# Regression Detection

`evals diff` compares two result files and tells you exactly what changed: which cases regressed (pass → fail), which improved (fail → pass), and which are new or removed.

## Workflow

```
1. Run evals on your current prompt/model → save as baseline
2. Make changes (new prompt, new model, etc.)
3. Run evals again → save as candidate
4. Run evals diff to see what changed
```

### Step 1 — Save a baseline

```bash
evals run suite.yaml --output results/baseline.json
```

Or use the auto-saved result in `./results/`:
```bash
evals run suite.yaml
# Results saved → ./results/2026-06-10T18-00-00_my_suite.json
```

### Step 2 — Make your changes

Edit your YAML, switch models, tweak the system prompt — whatever you're testing.

### Step 3 — Run again

```bash
evals run suite.yaml --output results/candidate.json
```

### Step 4 — Diff

```bash
evals diff results/baseline.json results/candidate.json
```

Output:

```
Regression Diff
Baseline:  <run-id>
Candidate: <run-id>

❌ Regressions (2)
┌──────────────────────────┬──────────────┬──────────┬───────────┐
│ Case                     │ Grader       │ Baseline │ Candidate │
├──────────────────────────┼──────────────┼──────────┼───────────┤
│ summarize-amazon-row1    │ contains     │ PASS     │ FAIL      │
│ capital-france           │ exact_match  │ PASS     │ FAIL      │
└──────────────────────────┴──────────────┴──────────┴───────────┘

✅ Improvements (1)
┌──────────────────────────┬──────────────┬──────────┬───────────┐
│ Case                     │ Grader       │ Baseline │ Candidate │
├──────────────────────────┼──────────────┼──────────┼───────────┤
│ translation-en-fr        │ llm_judge    │ FAIL     │ PASS      │
└──────────────────────────┴──────────────┴──────────┴───────────┘

Unchanged: 47  ❌ Regressions: 2  ✅ Improvements: 1

2 regression(s) found vs baseline.
```

## Exit codes

| Condition | Exit code |
|---|---|
| No regressions | 0 |
| One or more regressions | 1 |

Use exit code 1 in CI to block merges when evals regress:

```bash
# In your CI pipeline
evals run suite.yaml --output results/candidate.json
evals diff results/baseline.json results/candidate.json  # exits 1 if regressions
```

## JSON output

For CI pipelines and scripting, use `--format json`:

```bash
evals diff baseline.json candidate.json --format json
```

Returns:

```json
{
  "baseline_run_id": "abc123",
  "candidate_run_id": "def456",
  "regressions": [
    {
      "case_id": "capital-france",
      "criteria_type": "contains",
      "baseline_passed": true,
      "candidate_passed": false,
      "status": "regression"
    }
  ],
  "improvements": [...],
  "removed_cases": [],
  "added_cases": [],
  "unchanged_count": 47
}
```

## Matching logic

Cases are matched between runs by `case_id`. Per-grader results are compared individually — so a case with two graders can have one regression and one unchanged.

| Scenario | Reported as |
|---|---|
| Case in baseline, not in candidate | `removed_cases` |
| Case in candidate, not in baseline | `added_cases` |
| Grader: pass in baseline, fail in candidate | Regression |
| Grader: fail in baseline, pass in candidate | Improvement |
| Same result in both | Counted in `unchanged_count` |

## Dashboard

The Compare page in `evals dashboard` has a **Regressions** tab. Select two runs (baseline first, candidate second) and switch to the tab to see the same diff visualized with color coding: red rows for regressions, green for improvements.
