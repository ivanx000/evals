# LLM Evaluation Framework CLI

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
eval run examples/summarization.yaml
```

## Commands

### `eval run <suite.yaml>`

Run a test suite and display results in a table.

```bash
eval run examples/summarization.yaml
eval run examples/summarization.yaml --model claude-sonnet-4-6
eval run examples/summarization.yaml --watch          # re-run on file save
eval run examples/summarization.yaml --no-cache       # skip semantic cache
eval run examples/summarization.yaml --verbose        # show full outputs + judge reasoning
eval run examples/summarization.yaml --json out.json  # also write raw JSON to a path
```

### `eval compare <suite.yaml> --models <model1,model2,...>`

Run the same suite against multiple models and print a side-by-side comparison.

```bash
eval compare examples/summarization.yaml \
  --models claude-haiku-4-5,claude-sonnet-4-6,claude-opus-4-8

eval compare examples/summarization.yaml \
  --models gpt-4o-mini,gpt-4o \
  --provider openai
```

### `eval report`

List stored results from `./results/`.

```bash
eval report
eval report --last 5
eval report --suite summarization
```

## Suite YAML Format

```yaml
name: "My Eval Suite"
description: "Optional description"
provider: anthropic          # anthropic | openai
model: claude-haiku-4-5      # override per-suite
system_prompt: "You are..."  # optional system prompt
temperature: 0.0             # optional, 0-2
max_tokens: 1024             # default 1024

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
```

## Graders

| Type | Description | Pass condition |
|---|---|---|
| `exact_match` | String equality (trimmed) | Output equals `value` |
| `contains` | Substring check | Output contains `value` |
| `max_words` | Word count limit | Word count ≤ `value` |
| `regex` | Regular expression test | Pattern matches output |
| `llm_judge` | Second LLM scores 1-5 | Score ≥ `pass_threshold` (default 3) |

A case passes only when **all** criteria pass.

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

Env vars `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are also read automatically.

## Semantic Cache

All `(model, prompt, system_prompt, temperature, max_tokens)` tuples are cached in `.eval-cache/` as SHA-256-keyed JSON files. Subsequent runs with identical inputs return the cached response instantly at zero cost. Use `--no-cache` to force a fresh call.

## Output

- **Terminal:** color-coded table with pass/fail, latency, cost, and per-criteria detail.
- **JSON:** every run is auto-saved to `./results/<timestamp>_<suite>.json` for later inspection or CI diffing.

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
