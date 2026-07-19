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

## code_execution

Extracts code from the model's output, runs it in a subprocess, and checks whether it passes.
This is the grader to use for coding benchmarks — it tests whether generated code actually works,
not just whether it looks plausible.

```yaml
- type: code_execution
  language: python        # python | javascript | bash
  test_code: |            # optional: appended after extracted code; failed assertions = fail
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
  timeout_ms: 15000       # optional, default 10000
```

| Field | Type | Default | Description |
|---|---|---|---|
| `language` | `python` \| `javascript` \| `bash` | required | Language to execute |
| `test_code` | string | — | Code appended after model output (e.g. assert statements) |
| `expected_output` | string | — | Expected stdout from running the code |
| `timeout_ms` | integer | `10000` | Execution timeout in milliseconds |

### Three modes

**1. Run without error** (no `test_code` or `expected_output`) — passes if exit code is 0:
```yaml
- type: code_execution
  language: python
```

**2. Assertion-based** (most useful for function benchmarks) — appends test cases and checks exit 0:
```yaml
- type: code_execution
  language: python
  test_code: |
    assert reverse_string("hello") == "olleh"
    assert reverse_string("") == ""
```

**3. Expected output** — runs the code and compares stdout:
```yaml
- type: code_execution
  language: javascript
  expected_output: "Hello, world!"
```

### Code extraction

The grader extracts code from markdown fences automatically:
- Prefers a fenced block named with the language (` ```python `)
- Falls back to any generic fenced block (` ``` `)
- Falls back to the raw output if no fence is found

### Requirements

| Language | Requires |
|---|---|
| `python` | `python3` in PATH |
| `javascript` | `node` in PATH |
| `bash` | `bash` in PATH (already available on macOS/Linux) |

### Security note

`code_execution` runs LLM-generated code on your local machine. Only use it with
models and prompts you trust, in a context where arbitrary code execution is acceptable.

## numeric_tolerance

Extracts the last numeric value from the model's output and checks whether it is within
a configurable percentage of a reference value. Use this for financial reasoning, math
benchmarks, or any task where free-text answers contain a numeric result.

```yaml
- type: numeric_tolerance
  value: 14.3          # reference value
  tolerance_pct: 2     # optional, default 2.0 (percent)
```

| Field | Type | Default | Description |
|---|---|---|---|
| `value` | number | required | Reference value to compare against |
| `tolerance_pct` | number | `2.0` | Maximum allowed relative error as a percentage |

### Number extraction

The grader extracts the **last** numeric value it finds in the output, handling:
- Bare numbers: `14.3`
- Trailing percent: `14.3%` → `14.3`
- Leading currency: `$14.3` → `14.3`
- Comma-formatted: `1,200,000` → `1200000`
- Free-text context: `"approximately 14.3"` → `14.3`
- Structured format: `"ANSWER: 14.3 CONFIDENCE: 85"` → `14.3` (CONFIDENCE suffix is stripped)

The pass/fail check uses **relative error**: `|extracted − reference| / |reference|`. For a
reference of zero, an absolute tolerance of 1 is used instead.

### Example YAML

```yaml
- id: pe_ratio
  prompt: "A stock is $42.90 with EPS of $3.00. What is the P/E ratio?"
  criteria:
    - type: numeric_tolerance
      value: 14.3
      tolerance_pct: 1
```

---

## calibration

Parses a structured `ANSWER: … CONFIDENCE: …` block from the model output, checks
whether the extracted answer matches an expected string, and stores the confidence
value in `GraderResult.metadata` for later Brier score analysis.

Use this grader when you want to measure not just accuracy but also whether the model
is appropriately confident (calibrated).

```yaml
- type: calibration
  expected: "14.3"          # string the extracted answer must equal
  case_sensitive: false      # optional, default false
```

| Field | Type | Default | Description |
|---|---|---|---|
| `expected` | string | required | Expected answer string |
| `case_sensitive` | boolean | `false` | Whether the string comparison is case-sensitive |

### Required output format

The model **must** include both fields in its response:

```
ANSWER: <answer> CONFIDENCE: <0-100>
```

The keywords `ANSWER:` and `CONFIDENCE:` are matched case-insensitively and can appear
anywhere in the output. `CONFIDENCE` must be a number in the range 0–100 (clamped if
outside that range).

### GraderResult.metadata

The calibration grader always attaches a `metadata` object to its result:

```ts
{
  answer: string;        // extracted ANSWER value
  expected: string;      // expected value from criteria
  correct: boolean;      // whether answer === expected
  confidence: number | null;  // extracted CONFIDENCE, or null if absent
}
```

Use this to compute a Brier score after a run:

```ts
const calibrationResults = runResult.cases.flatMap(c =>
  c.grader_results.filter(r => r.criteria_type === "calibration")
);
const brierScore =
  calibrationResults.reduce((sum, r) => {
    const p = (r.metadata?.confidence as number ?? 50) / 100;
    const o = r.metadata?.correct ? 1 : 0;
    return sum + (p - o) ** 2;
  }, 0) / calibrationResults.length;
```

### Example YAML

```yaml
- id: pe_ratio_calibrated
  prompt: |
    A stock is $42.90 with EPS of $3.00. Calculate the P/E ratio.
    Respond ONLY as: ANSWER: <value> CONFIDENCE: <0-100>
  criteria:
    - type: calibration
      expected: "14.3"
```

### Combining numeric_tolerance and calibration

Both graders can be applied to the same case. `numeric_tolerance` checks the numeric
accuracy (with a tolerance band); `calibration` checks the structured ANSWER field and
records confidence:

```yaml
criteria:
  - type: numeric_tolerance
    value: 14.3
    tolerance_pct: 2
  - type: calibration
    expected: "14.3"
```

---

## json_schema

Validates whether the model's output is valid JSON that matches a [JSON Schema](https://json-schema.org/).
Use this for structured output evals, tool-call responses, or any task where the model must return a specific shape.

```yaml
- type: json_schema
  schema:
    type: object
    required: [name, age]
    properties:
      name: { type: string }
      age: { type: integer, minimum: 0 }
    additionalProperties: false
  extract_json: true   # optional, default false
```

| Field | Type | Default | Description |
|---|---|---|---|
| `schema` | object | required | A valid JSON Schema (Draft-07, via AJV) |
| `extract_json` | boolean | `false` | Strip markdown code fences before parsing |

### Grader result detail

| Outcome | `passed` | `detail` |
|---|---|---|
| Valid JSON matching schema | `true` | `"JSON valid, schema matched"` |
| Invalid JSON | `false` | `"JSON parse error: <message>"` |
| Valid JSON, schema violation | `false` | `"Schema violations: <ajv messages>"` |

### extract_json behaviour

When `extract_json: true`, the grader strips markdown fences before attempting `JSON.parse`:

1. Prefers a ` ```json ` fenced block
2. Falls back to any generic ` ``` ` fenced block
3. Falls back to the raw output

This mirrors the extraction logic in `code_execution` and is useful when the model wraps its JSON in a markdown response.

### Example YAML

```yaml
- id: user_profile_shape
  prompt: |
    Return a JSON object with name (string) and age (integer >= 0).
    Wrap your response in a ```json code fence.
  criteria:
    - type: json_schema
      extract_json: true
      schema:
        type: object
        required: [name, age]
        properties:
          name: { type: string }
          age: { type: integer, minimum: 0 }
        additionalProperties: false
```

---

### Adding a built-in grader (core contributors)

1. Create `src/graders/<name>.ts` exporting a `grade<Name>(output, criteria): GraderResult` function
2. Add the Zod schema to `src/types.ts` and include it in the `CriteriaSchema` discriminated union
3. Register the grader in `src/graders/registry.ts` with `registerGrader({ type, async grade() {...} })`
4. Add the type string to the `BUILTIN_TYPES` set in `src/plugins.ts`
5. Export the grader function from `src/graders/index.ts`
6. Update this file with the new grader's documentation

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
evals run suite.yaml
```

A working example is included at `examples/plugins/sentiment_grader.js`.

### Discovery rules

- The framework scans `graders/` in the current working directory at startup
- Only `.js` and `.mjs` files are loaded; `.ts` files require a pre-compilation step
- Each file must export a default object with at least `{ type, run }`
- Plugin type names must not conflict with built-in grader names (`exact_match`, `contains`, `max_words`, `regex`, `llm_judge`, `code_execution`, `numeric_tolerance`, `calibration`)
- Duplicate type names: the first plugin loaded wins (alphabetical file order); a warning is printed for subsequent duplicates

### Error handling

| Scenario | Behavior |
|---|---|
| Plugin file fails to load | Warning printed, plugin skipped — eval continues |
| Plugin exports invalid shape | Warning printed, plugin skipped |
| Plugin `type` conflicts with built-in | Error thrown at startup — fix the type name |
| Plugin `run()` throws at evaluation time | `GraderResult` with `passed: false` and the error message |

Plugins never crash the runner — errors are isolated to the grader result for that case.
