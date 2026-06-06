# Graders Reference

Each grader is a criterion type in the `criteria` array of an eval case.
A case passes only when **all** of its criteria pass.

## exact_match

Checks that the model output equals `value` exactly (after trimming whitespace).

```yaml
- type: exact_match
  value: "Paris"
  case_sensitive: false   # optional, default false
```

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | string | required | Expected string |
| `case_sensitive` | boolean | `false` | Whether comparison is case-sensitive |

## contains

Checks that the model output includes `value` as a substring.

```yaml
- type: contains
  value: "photosynthesis"
  case_sensitive: false
```

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | string | required | Substring to look for |
| `case_sensitive` | boolean | `false` | Whether search is case-sensitive |

## max_words

Checks that the word count of the output does not exceed `value`.

```yaml
- type: max_words
  value: 50
```

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | integer | required | Maximum word count (inclusive) |

## regex

Checks that the output matches a regular expression.

```yaml
- type: regex
  value: "^\\d{4}-\\d{2}-\\d{2}$"
  flags: ""              # optional JS regex flags: g, i, m, s, u
```

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | string | required | Regular expression pattern |
| `flags` | string | `""` | JavaScript regex flags |

## llm_judge

Uses a second LLM call (the judge) to score the output 1–5 based on a rubric.
The case passes when `score >= pass_threshold`.

```yaml
- type: llm_judge
  rubric: "The response should be polite, accurate, and under 3 sentences."
  pass_threshold: 3      # optional, default 3 (scale 1-5)
  model: claude-opus-4-8 # optional, overrides judge_model in .evalrc.json
```

| Field | Type | Default | Description |
|---|---|---|---|
| `rubric` | string | required | Grading criteria described in natural language |
| `pass_threshold` | integer (1–5) | `3` | Minimum score to pass |
| `model` | string | judge_model config | Claude model used as judge |

The judge always uses the Anthropic provider, regardless of the suite's `provider` setting.

### Judge scoring guide

| Score | Meaning |
|---|---|
| 1 | Completely fails the rubric |
| 2 | Mostly fails with minor redeeming qualities |
| 3 | Partially meets the rubric |
| 4 | Mostly meets the rubric with minor issues |
| 5 | Fully meets the rubric |

### Adding a new grader

1. Create `src/graders/<name>.ts` exporting a `grade<Name>(output, criteria): GraderResult` function
2. Add the Zod schema to `src/types.ts` and include it in the `CriteriaSchema` discriminated union
3. Register the grader in `src/graders/index.ts` `runGraders()` switch statement
4. Update this file with the new grader's documentation
