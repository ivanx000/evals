# evals

A pytest-style evaluation framework for LLM outputs. Define test suites in YAML, run them against any model, grade outputs with deterministic criteria or an LLM judge, and compare results across models.

## Quick Start

```bash
npm install
npm run build

export ANTHROPIC_API_KEY=sk-ant-...
./dist/cli.js run examples/summarization.yaml
```

Or install globally after building:

```bash
npm link
evals run examples/summarization.yaml
```

## Commands

### `evals run <suite.yaml>`

Run a test suite and display results in a table.

```bash
evals run examples/summarization.yaml
evals run examples/summarization.yaml --model claude-sonnet-4-6
evals run examples/summarization.yaml --watch          # re-run on file save
evals run examples/summarization.yaml --no-cache       # skip semantic cache
evals run examples/summarization.yaml --verbose        # show full outputs + judge reasoning
evals run examples/summarization.yaml --json out.json  # also write raw JSON to a path
evals run examples/summarization.yaml --dataset examples/datasets/prompts.jsonl  # override dataset
```

### `evals compare <suite.yaml> --models <model1,model2,...>`

Run the same suite against multiple models and print a side-by-side comparison.

```bash
evals compare examples/summarization.yaml \
  --models claude-haiku-4-5,claude-sonnet-4-6,claude-opus-4-8

evals compare examples/summarization.yaml \
  --models gpt-4o-mini,gpt-4o \
  --provider openai

# Mix providers with provider/model syntax
evals compare examples/summarization.yaml \
  --models anthropic/claude-haiku-4-5,gemini/gemini-2.0-flash,ollama/llama3
```

### `evals diff <baseline> <candidate>`

Compare two saved result files and report regressions and improvements. Exits with code 1 if any regressions are found — useful in CI.

```bash
evals diff results/2024-01-01_suite.json results/2024-01-02_suite.json
evals diff baseline.json candidate.json --format json
```

### `evals report`

List stored results from `./results/`.

```bash
evals report
evals report --last 5
evals report --suite summarization
```

### `evals dashboard`

Spin up a local web dashboard to visualize and compare eval results.

```bash
evals dashboard
evals dashboard --port 8080
evals dashboard --results-dir ./my-results
```

Opens a browser at `http://localhost:3000`. The dashboard shows run history, per-case breakdowns, and a side-by-side comparison view with a regression tab.

### `evals providers`

Show configured providers and their API key status.

```bash
evals providers
```

## Suite YAML Format

```yaml
name: "My Eval Suite"
description: "Optional description"
provider: anthropic          # anthropic | openai | gemini | ollama
model: claude-haiku-4-5      # override per-suite
system_prompt: "You are..."  # optional system prompt
temperature: 0.0             # optional, 0-2
max_tokens: 1024             # default 1024

# Optional: stream cases from a .jsonl dataset file
dataset: examples/datasets/prompts.jsonl
dataset_limit: 100           # cap total rows processed
dataset_sample: 20           # random sample of N rows

cases:
  - id: "unique-case-id"    # optional, auto-generated if omitted
    prompt: "Your prompt here"
    criteria:
      - type: exact_match
        value: "Expected output"
        case_sensitive: false

      - type: contains
        value: "keyword"
        case_sensitive: false

      - type: max_words
        value: 50

      - type: regex
        value: "^\\d{4}-\\d{2}-\\d{2}$"
        flags: ""

      - type: llm_judge
        rubric: "The response should be polite and answer the question directly."
        pass_threshold: 3    # 1-5, default 3
        model: claude-opus-4-8  # optional judge model override

      - type: code_execution
        language: python     # python | javascript | bash
        test_code: "assert solution(2, 3) == 5"
        expected_output: ""  # optional: assert stdout matches
        timeout_ms: 10000    # default 10000
```

### Multi-turn cases

Use `turns` instead of `prompt` to evaluate multi-step conversations. Set `content: null` on assistant turns the model should fill in — the last null turn is the one evaluated by graders.

```yaml
cases:
  - id: remember-name
    turns:
      - role: user
        content: "My name is Ivan. Please remember it."
      - role: assistant
        content: null          # model responds here
      - role: user
        content: "What is my name?"
      - role: assistant
        content: null          # this turn is evaluated
    criteria:
      - type: contains
        value: "Ivan"
```

### Dataset-backed cases

Point the suite at a `.jsonl` file. Each line is a JSON object whose keys become `{{variable}}` substitutions in `prompt` and `criteria` fields.

```yaml
dataset: examples/datasets/coding-problems.jsonl
dataset_limit: 50

cases:
  - id: "coding-{{id}}"
    prompt: |
      Solve the following Python problem. Write only the function.
      {{problem}}
    criteria:
      - type: code_execution
        language: python
        test_code: "{{test_code}}"
```

## Graders

| Type | Description | Pass condition |
|---|---|---|
| `exact_match` | String equality (trimmed) | Output equals `value` |
| `contains` | Substring check | Output contains `value` |
| `max_words` | Word count limit | Word count ≤ `value` |
| `regex` | Regular expression test | Pattern matches output |
| `llm_judge` | Second LLM scores 1-5 | Score ≥ `pass_threshold` (default 3) |
| `code_execution` | Runs extracted code + optional test assertions | Code exits 0 and assertions pass |

A case passes only when **all** criteria pass.

## Providers

| Provider | Key env var | Notes |
|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | Default provider |
| `openai` | `OPENAI_API_KEY` | GPT-4o, o1, etc. |
| `gemini` | `GEMINI_API_KEY` | Free tier available — get key at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `ollama` | — | Local models, no key required. Set `OLLAMA_HOST` to override `http://localhost:11434` |

## Config (`.evalrc.json`)

Copy `.evalrc.json.example` to `.evalrc.json` and adjust:

```json
{
  "default_provider": "anthropic",
  "default_model": "claude-haiku-4-5",
  "judge_model": "claude-opus-4-8",
  "results_dir": "./results",
  "cache_enabled": true
}
```

API keys can be set in the config file or via environment variables — env vars take precedence:

| Env var | Config key |
|---|---|
| `ANTHROPIC_API_KEY` | `anthropic_api_key` |
| `OPENAI_API_KEY` | `openai_api_key` |
| `GEMINI_API_KEY` | `gemini_api_key` |
| `OLLAMA_HOST` | *(env only)* |

## Semantic Cache

All `(model, prompt, system_prompt, temperature, max_tokens)` tuples are cached in `.eval-cache/` as SHA-256-keyed JSON files. Subsequent runs with identical inputs return the cached response instantly at zero cost. Use `--no-cache` to force a fresh call.

## Custom Grader Plugins

Drop a `.js` file into a `graders/` folder next to your eval YAML to add a custom grader type — no code changes needed.

```js
// graders/sentiment.js
export default {
  type: "sentiment",
  run({ output, criteria }) {
    const positive = ["good", "great", "excellent"].some(w => output.includes(w));
    return { passed: criteria.expected === "positive" ? positive : !positive };
  },
};
```

```yaml
criteria:
  - type: sentiment
    expected: positive
```

See `examples/plugins/sentiment_grader.js` for a full example.

## Output

- **Terminal:** color-coded table with pass/fail, latency, cost, and per-criteria detail.
- **JSON:** every run is auto-saved to `./results/<timestamp>_<suite>.json` for later inspection or CI diffing.
- **Dashboard:** `evals dashboard` opens a browser UI with run history, charts, and a regression diff view.

## Design Decisions

### Why YAML for test suites?

YAML is human-readable and easy to version-control. It supports multiline strings naturally (pipe `|` syntax), which is essential for long prompts. Zod validation at load time gives clear error messages when the schema is wrong.

### Why separate judge model?

The LLM-as-judge grader uses a second API call with a strict rubric-scoring prompt, deliberately kept separate from the model under test. This avoids self-grading bias and lets you use the strongest available judge (default: `claude-opus-4-8`) even when evaluating cheaper models.

### Why SHA-256 semantic cache (not embedding-based)?

Exact-match caching is deterministic and free. Embedding-based "semantic" caching would add cost and complexity while introducing risk of cache collisions for subtly different prompts. The cache key covers `(model, prompt, system_prompt, temperature, max_tokens)` — everything that affects the output.

### Why `pass_rate` as the top-level metric?

Binary pass/fail per case is easier to reason about than aggregated scores. The `pass_rate` gives a single headline number that maps cleanly to CI exit codes (exit 1 on any failure).

### LLM Judge scoring

The judge receives the output and a rubric, responds with `{"score": 1-5, "reasoning": "..."}` in JSON, and the case passes when `score >= pass_threshold`. Default threshold is 3 (middle of the scale). The reasoning is surfaced in `--verbose` mode and in the saved JSON.

### Why Commander over yargs?

Commander has a simpler, more chainable API for typed TypeScript projects and requires no external type packages. Both would work equally well here.
