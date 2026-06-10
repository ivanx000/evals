# Graders Reference

Each grader is a criterion type in the `criteria` array of an eval case.
A case passes only when **all** of its criteria pass.

## Result shape

Every grader returns a `GraderResult` with this consistent shape:

```ts
{
  criteria_type: string;   // e.g. "exact_match", "llm_judge"
  passed: boolean;         // true if the criterion was met
  score?: number;          // 1-5 for llm_judge only
  reasoning?: string;      // judge reasoning for llm_judge
  detail?: string;         // human-readable message for deterministic graders
  error?: string;          // set instead of detail/reasoning when the grader itself failed
}
```

When `error` is set, `passed` is always `false`. A grader error means the grader could not
evaluate the output (e.g., invalid regex, missing API key) — it does not mean the output
failed the criterion. The runner will still include the case result with the error message.

Graders never throw — all errors are caught and returned in the `error` field.

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

### Adding a built-in grader (core contributors)

1. Create `src/graders/<name>.ts` exporting a `grade<Name>(output, criteria): GraderResult` function
2. Add the Zod schema to `src/types.ts` and include it in the `CriteriaSchema` discriminated union
3. Register the grader in `src/graders/index.ts` `runGraders()` switch statement
4. Update this file with the new grader's documentation

---

## Writing a Custom Grader Plugin

Drop a `.js` file into a `graders/` folder next to your suite YAML and the framework picks it up automatically — no changes to the core codebase needed.

### Plugin interface

```js
// graders/my_grader.js
export default {
  type: "my_grader",    // unique type name (must not conflict with built-ins)

  run: async (output, config) => {
    // output: string — the model's response
    // config: object — the raw criteria object from YAML (e.g. { type: "my_grader", threshold: 0.8 })
    return {
      criteria_type: "my_grader",
      passed: true,           // or false
      detail: "optional human-readable explanation",
    };
  },
};
```

The `run` function receives `output` (the model response as a string) and `config` (the raw criteria object from YAML including any custom fields you define). It must return a `GraderResult`-compatible object.

### Step-by-step example: sentiment grader

**1. Create `graders/sentiment_grader.js`:**

```js
const POSITIVE = ["good", "great", "excellent", "love", "happy", "amazing"];
const NEGATIVE = ["bad", "terrible", "awful", "hate", "worst", "broken"];

function detectSentiment(text) {
  const words = text.toLowerCase().match(/\b\w+\b/g) ?? [];
  let pos = 0, neg = 0;
  for (const w of words) {
    if (POSITIVE.includes(w)) pos++;
    if (NEGATIVE.includes(w)) neg++;
  }
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

export default {
  type: "sentiment",
  run: async (output, config) => {
    const detected = detectSentiment(output);
    return {
      criteria_type: "sentiment",
      passed: detected === config.expected,
      detail: `Detected: ${detected} (expected: ${config.expected})`,
    };
  },
};
```

**2. Use it in your suite YAML:**

```yaml
name: Sentiment Test
cases:
  - prompt: "Write a positive review of this product."
    criteria:
      - type: sentiment
        expected: positive
```

**3. Run as normal:**

```bash
eval run suite.yaml
```

A working example is included at `examples/plugins/sentiment_grader.js`.

### Discovery rules

- The framework scans `graders/` in the current working directory at startup
- Only `.js` and `.mjs` files are loaded; `.ts` files require a pre-compilation step
- Each file must export a default object with at least `{ type, run }`
- Plugin type names must not conflict with built-in grader names (`exact_match`, `contains`, `max_words`, `regex`, `llm_judge`)
- Duplicate type names: the first plugin loaded wins (alphabetical file order); a warning is printed for subsequent duplicates

### Error handling

| Scenario | Behavior |
|---|---|
| Plugin file fails to load | Warning printed, plugin skipped — eval continues |
| Plugin exports invalid shape | Warning printed, plugin skipped |
| Plugin `type` conflicts with built-in | Error thrown at startup — fix the type name |
| Plugin `run()` throws at evaluation time | `GraderResult` with `passed: false` and the error message |

Plugins never crash the runner — errors are isolated to the grader result for that case.
