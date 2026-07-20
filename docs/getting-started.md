# Getting Started

## Installation

```bash
git clone https://github.com/ivanx000/evals
cd evals
npm install
npm run build
```

Set your API key(s):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...       # optional, only if using OpenAI models
```

**No API key? Use Ollama for free local inference:**

```bash
brew install ollama          # or: curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3
evals run examples/ollama-basic.yaml
```

See [providers.md](./providers.md) for full Ollama setup instructions.

Optionally, install the `evals` binary globally:

```bash
npm link
evals --help
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

### `evals run <suite.yaml>`

Run all cases in a suite and display a results table.

```bash
evals run examples/summarization.yaml
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
| `--tag <tag>` | Run only cases that have this tag (repeatable; multiple tags use OR logic) |
| `--timeout <ms>` | Per-case API timeout in milliseconds (default: `30000`) |
| `--concurrency <n>` | Run N cases in parallel (default: `1`) |
| `--dry-run` | Validate the YAML and print what would run — no API calls made |
| `-c, --config <path>` | Use a specific config file |
| `--batch` | Submit via Anthropic Batch API (50% cost reduction; Anthropic provider only; results arrive asynchronously) |

**Examples:**

```bash
# Run only cases tagged "smoke" or with "smoke" in their ID
evals run suite.yaml --filter smoke

# Run only cases explicitly tagged "smoke"
evals run suite.yaml --tag smoke

# Run cases tagged "smoke" OR "regression" (OR logic across multiple --tag flags)
evals run suite.yaml --tag smoke --tag regression

# Validate a suite without making any API calls
evals run suite.yaml --dry-run

# Run up to 4 cases at a time, with a 60-second timeout each
evals run suite.yaml --concurrency 4 --timeout 60000

# Save results to a specific path
evals run suite.yaml --output ./ci-results/run.json

# Submit to Anthropic Batch API for 50% cost savings (polls until complete)
evals run suite.yaml --batch
```

### `evals batch <batchId> <suite.yaml>`

Re-attach to an in-progress or completed Anthropic batch and collect results. Use this when a `--batch` run was interrupted (process killed, network dropped) before polling finished, or when you want to pick up a batch submitted in a previous session.

```bash
evals batch msgbatch_01abc123 examples/summarization.yaml
```

**You must pass the same `--filter` and `--dataset` flags that were used at submit time.** The command re-expands and re-filters the suite in the same way, so that batch result indices map back to the correct cases.

**Options:**

| Flag | Description |
|---|---|
| `-m, --model <id>` | Model used when the batch was submitted (used for cost calculation) |
| `--filter <substring>` | Same filter used at submit time (if any) |
| `--dataset <path>` | Same dataset override used at submit time (if any) |
| `-o, --output <path>` | Override the results save path (default: `./results/<timestamp>.json`) |
| `-v, --verbose` | Show full outputs and judge reasoning |
| `-c, --config <path>` | Use a specific config file |

**Example — interrupted batch recovery:**

```bash
# Original submit (process was killed before it finished polling)
evals run suite.yaml --batch --filter smoke --model claude-haiku-4-5
# Anthropic printed: Batch submitted: msgbatch_01abc123

# Resume — pass the same --filter and --model
evals batch msgbatch_01abc123 suite.yaml --filter smoke --model claude-haiku-4-5
```

Requires `ANTHROPIC_API_KEY`. If the batch is still processing, `evals batch` polls with exponential backoff (5 s → 60 s max) until it completes.

### `evals compare <suite.yaml> --models <m1,m2,...>`

Run the same suite against multiple models and display a side-by-side comparison.

```bash
evals compare examples/summarization.yaml \
  --models claude-haiku-4-5,claude-sonnet-4-6,claude-opus-4-8
```

```bash
evals compare examples/summarization.yaml \
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

### `evals providers`

Show configured providers and their status (API key set, Ollama reachable):

```bash
evals providers
```

### `evals report`

List stored results from the `results/` directory.

```bash
evals report             # last 10 results
evals report --last 5
evals report --suite summarization
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
evals run my-suite.yaml
```

## Suite inheritance

A suite can inherit from a base suite using the `extends` field:

```yaml
# base.yaml
name: "Base Suite"
provider: anthropic
model: claude-haiku-4-5
max_tokens: 512
system_prompt: "You are a helpful assistant."

cases:
  - id: "smoke-1"
    prompt: "Say hello."
    criteria:
      - type: contains
        value: "hello"
```

```yaml
# full.yaml
name: "Full Suite"
extends: ./base.yaml      # path relative to this file
model: claude-sonnet-4-6  # override the base model

cases:
  - id: "extra-1"
    prompt: "Summarize the French Revolution in one sentence."
    criteria:
      - type: max_words
        value: 30
```

Running `evals run full.yaml` will:

1. Load `base.yaml` and then `full.yaml`
2. Merge top-level fields — child wins on any conflict
3. Prepend base cases before child cases (smoke-1, then extra-1)
4. Validate and run the merged suite

**Rules:**

- `extends` is resolved relative to the file that declares it
- Any top-level field in the child (e.g. `model`, `temperature`) overrides the base value
- Base cases always come first; child cases are appended
- Multi-level inheritance is supported (`grandchild → child → base`)
- A circular chain (`a → b → a`) throws an error immediately with the cycle shown

## Semantic cache

All `(model, prompt, system_prompt, temperature, max_tokens)` tuples are cached in `.eval-cache/`.
Repeated runs with the same inputs are free. Use `--no-cache` to bypass.

## API key setup

Set your API keys as environment variables before running:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # required for Anthropic provider and llm_judge
export OPENAI_API_KEY=sk-...          # required for OpenAI provider
```

If a required key is missing when a command is run, `evals` will print a clear error and exit with code 1 — it never reaches the API call and fails cryptically.

## CI integration

Exit code is `1` when any case fails, `0` when all pass:

```bash
evals run my-suite.yaml && echo "All green"
```

Use `--dry-run` in CI pre-flight to validate config before spending API quota:

```bash
evals run my-suite.yaml --dry-run  # validates YAML, exits 0 if valid
evals run my-suite.yaml            # the real run
```

Results JSON is always written to `./results/` for artifact storage.

### GitHub Actions

A ready-made workflow is available at [.github/workflows/eval.yml](../.github/workflows/eval.yml). It runs `evals run` on every push and pull request, caches `node_modules`, and fails the check if any case fails.

To use it, add your API key as a repository secret (`ANTHROPIC_API_KEY`) and update the `SUITE` env var in the workflow to point at your suite file.
