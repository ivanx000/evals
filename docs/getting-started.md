# Getting Started

## Installation

```bash
git clone https://github.com/ivanx000/LLM-Evaluation-CLI
cd LLM-Evaluation-CLI
npm install
npm run build
```

Set your API key(s):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...       # optional, only if using OpenAI models
```

Optionally, install the `eval` binary globally:

```bash
npm link
eval --help
```

Or use it directly without installing:

```bash
node dist/cli.js --help
```

## Config file

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

Config is auto-discovered in the working directory. Override with `--config <path>`.

## Commands

### `eval run <suite.yaml>`

Run all cases in a suite and display a results table.

```bash
eval run examples/summarization.yaml
```

**Options:**

| Flag | Description |
|---|---|
| `-m, --model <id>` | Override the model in the suite YAML |
| `-w, --watch` | Re-run automatically when the YAML file is saved |
| `--no-cache` | Skip the semantic cache and always call the API |
| `-v, --verbose` | Show full model outputs and LLM judge reasoning |
| `-o, --output <path>` | Override the results save path (default: `./results/<timestamp>.json`) |
| `--json <path>` | Also write the raw JSON result to a second path |
| `--filter <substring>` | Run only cases whose `id` or tag contains the substring |
| `--timeout <ms>` | Per-case API timeout in milliseconds (default: `30000`) |
| `--concurrency <n>` | Run N cases in parallel (default: `1`) |
| `--dry-run` | Validate the YAML and print what would run — no API calls made |
| `-c, --config <path>` | Use a specific config file |

**Examples:**

```bash
# Run only cases tagged "smoke" or with "smoke" in their ID
eval run suite.yaml --filter smoke

# Validate a suite without making any API calls
eval run suite.yaml --dry-run

# Run up to 4 cases at a time, with a 60-second timeout each
eval run suite.yaml --concurrency 4 --timeout 60000

# Save results to a specific path
eval run suite.yaml --output ./ci-results/run.json
```

### `eval compare <suite.yaml> --models <m1,m2,...>`

Run the same suite against multiple models and display a side-by-side comparison.

```bash
eval compare examples/summarization.yaml \
  --models claude-haiku-4-5,claude-sonnet-4-6,claude-opus-4-8
```

```bash
eval compare examples/summarization.yaml \
  --models gpt-4o-mini,gpt-4o \
  --provider openai
```

**Options:**

| Flag | Description |
|---|---|
| `--models <ids>` | **Required.** Comma-separated model IDs |
| `--provider <name>` | Provider to use for all models (`anthropic` \| `openai`) |
| `--no-cache` | Disable semantic cache |
| `-v, --verbose` | Show full outputs |
| `--timeout <ms>` | Per-case timeout in milliseconds (default: `30000`) |
| `--concurrency <n>` | Run N cases in parallel per model (default: `1`) |

### `eval report`

List stored results from the `results/` directory.

```bash
eval report             # last 10 results
eval report --last 5
eval report --suite summarization
```

**Options:**

| Flag | Description |
|---|---|
| `-n, --last <n>` | Show last N results (default: 10) |
| `--suite <name>` | Filter by suite name (partial match) |

## Writing your first suite

Create a YAML file:

```yaml
name: "My First Suite"
provider: anthropic
model: claude-haiku-4-5
max_tokens: 256

cases:
  - id: "capital-france"
    prompt: "What is the capital of France? Reply with just the city name."
    criteria:
      - type: exact_match
        value: "Paris"
      - type: max_words
        value: 5
```

Run it:

```bash
eval run my-suite.yaml
```

## Semantic cache

All `(model, prompt, system_prompt, temperature, max_tokens)` tuples are cached in `.eval-cache/`.
Repeated runs with the same inputs are free. Use `--no-cache` to bypass.

## API key setup

Set your API keys as environment variables before running:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # required for Anthropic provider and llm_judge
export OPENAI_API_KEY=sk-...          # required for OpenAI provider
```

If a required key is missing when a command is run, `eval` will print a clear error and exit with code 1 — it never reaches the API call and fails cryptically.

## CI integration

Exit code is `1` when any case fails, `0` when all pass:

```bash
eval run my-suite.yaml && echo "All green"
```

Use `--dry-run` in CI pre-flight to validate config before spending API quota:

```bash
eval run my-suite.yaml --dry-run  # validates YAML, exits 0 if valid
eval run my-suite.yaml            # the real run
```

Results JSON is always written to `./results/` for artifact storage.
