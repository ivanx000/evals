# Writing Evals

## Basic inline cases

The simplest eval has inline cases defined directly in YAML:

```yaml
name: My Eval Suite
provider: anthropic
model: claude-haiku-4-5

cases:
  - id: capital-france
    prompt: "What is the capital of France?"
    criteria:
      - type: contains
        value: "Paris"
```

Run it with:

```bash
evals run my-suite.yaml
```

---

## Dataset support

For larger test sets, store examples in a `.jsonl` file (one JSON object per line) and reference it from your suite YAML. This keeps your prompts in code and your data separate.

### Basic usage

```yaml
name: Summarization Suite
provider: anthropic
model: claude-haiku-4-5

dataset: ./datasets/summarization.jsonl

cases:
  - prompt: "Summarize the following text in one sentence: {{text}}"
    criteria:
      - type: contains
        value: "{{expected_keyword}}"
```

Each line in `summarization.jsonl` is a JSON object:

```json
{"text": "The Amazon rainforest covers 5.5 million km²...", "expected_keyword": "Amazon"}
{"text": "Mount Everest is the highest mountain...", "expected_keyword": "Everest"}
```

The `{{variable}}` placeholders in `prompt` and criteria values are replaced with the corresponding field from each row. The runner generates one case per row × template combination.

### Limiting rows

```yaml
dataset: ./datasets/big_dataset.jsonl
dataset_limit: 50      # run only the first 50 rows
dataset_sample: 20     # or run a random sample of 20 rows
```

`dataset_limit` reads the file sequentially and stops early (efficient for large files). `dataset_sample` uses reservoir sampling so any N rows can be selected without loading everything into memory.

### Overriding the dataset at runtime

```bash
evals run suite.yaml --dataset ./other-dataset.jsonl
```

### Using multiple templates

You can define multiple case templates. Each template is expanded for every dataset row:

```yaml
dataset: ./data.jsonl
cases:
  - prompt: "Formal: {{text}}"
    criteria:
      - type: contains
        value: "{{keyword}}"
  - prompt: "Casual: {{text}}"
    criteria:
      - type: max_words
        value: 50
```

This runs 2 × N cases for N dataset rows.

### Template variables

Any `{{variable}}` in a string field is substituted from the dataset row. Supported locations:
- `prompt`
- `criteria[].value` (for `contains`, `exact_match`, `regex`)
- `criteria[].rubric` (for `llm_judge`)

Missing variables are left as `{{variable}}` (no error, no substitution).

Numeric values are coerced to strings. Special characters (`"`, `\n`, etc.) are safely escaped.

---

## Multi-turn evals

Test how a model handles conversations with the `turns` key instead of `prompt`.

### Basic multi-turn case

```yaml
cases:
  - id: remember-name
    turns:
      - role: user
        content: "My name is Ivan."
      - role: assistant
        content: null        # model responds here
      - role: user
        content: "What is my name?"
      - role: assistant
        content: null        # this response is evaluated
    criteria:
      - type: contains
        value: "Ivan"
```

**Rules:**
- `role: assistant` with `content: null` → the model generates a response at this point
- `role: assistant` with content set → inject as a fixed turn (no API call)
- The **last** null assistant turn is the one evaluated by your criteria
- Intermediate null turns are filled in by calling the model, and their responses feed into the conversation history

### Example: testing instruction following

```yaml
- id: follow-instructions
  turns:
    - role: user
      content: "Always respond in exactly 3 words from now on."
    - role: assistant
      content: "Understood, will comply."    # fixed, injected
    - role: user
      content: "What is the capital of France?"
    - role: assistant
      content: null    # evaluated
  criteria:
    - type: max_words
      value: 5
```

### Cost and tokens

Token counts and cost are accumulated across all API calls in a multi-turn case and reported as a single `CaseResult`.

### Example file

See `examples/multi-turn-memory.yaml` for a complete working example.

---

## Filter, dry-run, and other flags

```bash
evals run suite.yaml --filter smoke         # run only cases with "smoke" in id or tag
evals run suite.yaml --dry-run              # validate YAML, print what would run
evals run suite.yaml --concurrency 5        # run 5 cases in parallel
evals run suite.yaml --timeout 10000        # 10-second per-case timeout
evals run suite.yaml --no-cache             # disable semantic cache
```
