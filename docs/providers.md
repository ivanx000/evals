# Providers Reference

Providers are the LLM backends used to generate outputs for evaluation.
Set the provider in the suite YAML or via `.evalrc.json`.

## anthropic

Uses `@anthropic-ai/sdk`. Requires `ANTHROPIC_API_KEY` env var.

```yaml
provider: anthropic
model: claude-haiku-4-5
```

### Supported models and pricing

| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| Claude Opus 4.8 | `claude-opus-4-8` | $5.00 | $25.00 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3.00 | $15.00 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 |

Cost estimates are computed from `usage.input_tokens` / `usage.output_tokens` returned by the API.
Pricing table lives in `src/types.ts` → `ANTHROPIC_PRICING`.

### Configuration

| Config key | Env var | Description |
|---|---|---|
| `anthropic_api_key` | `ANTHROPIC_API_KEY` | API key |
| `default_model` | — | Default model if suite doesn't specify one |
| `judge_model` | — | Model used by `llm_judge` grader (default: `claude-opus-4-8`) |

## openai

Uses the `openai` npm package. Requires `OPENAI_API_KEY` env var.

```yaml
provider: openai
model: gpt-4o-mini
```

### Supported models and pricing

| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| GPT-4o | `gpt-4o` | $5.00 | $15.00 |
| GPT-4o mini | `gpt-4o-mini` | $0.15 | $0.60 |
| GPT-4 Turbo | `gpt-4-turbo` | $10.00 | $30.00 |
| GPT-3.5 Turbo | `gpt-3.5-turbo` | $0.50 | $1.50 |

Pricing table lives in `src/types.ts` → `OPENAI_PRICING`.

### Configuration

| Config key | Env var | Description |
|---|---|---|
| `openai_api_key` | `OPENAI_API_KEY` | API key |

### Note on llm_judge

The `llm_judge` grader always uses the Anthropic provider (Claude), even when the suite's
`provider` is `openai`. This is intentional — it avoids self-grading bias and keeps the
judge model consistent across all evaluations.

## gemini

Uses Google's Gemini API via the OpenAI-compatible endpoint. Has a **free tier** with generous rate limits.

Get a free API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — no billing required.

```yaml
provider: gemini
model: gemini-2.0-flash
```

### Supported models and pricing

| Model | ID | Input $/1M | Output $/1M | Notes |
|---|---|---|---|---|
| Gemini 2.5 Pro | `gemini-2.5-pro` | $1.25 | $10.00 | Most capable |
| Gemini 2.0 Flash | `gemini-2.0-flash` | $0.10 | $0.40 | Best speed/cost ratio |
| Gemini 1.5 Pro | `gemini-1.5-pro` | $1.25 | $5.00 | Long context (2M tokens) |
| Gemini 1.5 Flash | `gemini-1.5-flash` | $0.075 | $0.30 | Cheapest paid option |

Free tier available for all models via [Google AI Studio](https://aistudio.google.com) — rate limited but no cost.

Pricing table lives in `src/types.ts` → `GEMINI_PRICING`.

### Configuration

| Config key | Env var | Description |
|---|---|---|
| `gemini_api_key` | `GEMINI_API_KEY` | API key from Google AI Studio |

### Using Gemini in evals compare

```bash
evals compare suite.yaml \
  --models gemini/gemini-2.0-flash,anthropic/claude-haiku-4-5,ollama/llama3
```

## ollama

Runs models locally on your machine — **no API key or cost**. Uses Ollama's OpenAI-compatible REST API.

Install Ollama first: https://ollama.com

```bash
# macOS
brew install ollama

# Linux / WSL
curl -fsSL https://ollama.com/install.sh | sh
```

Pull a model before running evals:

```bash
ollama pull llama3
ollama pull mistral
ollama pull phi3:mini
```

```yaml
provider: ollama
model: llama3
```

### Supported models

Any model available in the Ollama library works. Common choices:

| Model | Pull command | Notes |
|---|---|---|
| Llama 3 8B | `ollama pull llama3` | Good general-purpose baseline |
| Mistral 7B | `ollama pull mistral` | Fast, strong reasoning |
| Phi-3 Mini | `ollama pull phi3:mini` | Very small, runs on low-RAM machines |
| Code Llama | `ollama pull codellama` | Optimized for code tasks |
| Llama 3 70B | `ollama pull llama3:70b` | High quality, needs 40 GB+ RAM |

Check available models: https://ollama.com/library

### Configuration

| Env var | Default | Description |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Base URL of the Ollama server |

No API key is required. Cost is always reported as `$0.00`.

### Using Ollama in evals compare

Use the `provider/model` format to mix providers in a single comparison:

```bash
evals compare suite.yaml \
  --models ollama/llama3,anthropic/claude-haiku-4-5,openai/gpt-4o-mini
```

Bare model names (no `/`) use the `--provider` flag default:

```bash
evals compare suite.yaml --models llama3,mistral --provider ollama
```

### Error messages

| Error | Cause | Fix |
|---|---|---|
| `Could not connect to Ollama at http://localhost:11434` | Ollama server not running | Run `ollama serve` or start the Ollama app |
| `Model 'X' not found in Ollama` | Model not pulled | Run `ollama pull X` |

### Check status

```bash
evals providers
```

This pings Ollama and shows how many models are available.

## Adding a new provider

1. Create `src/providers/<name>.ts` implementing the `LLMProvider` interface:
   ```ts
   interface LLMProvider {
     call(options: ProviderCallOptions): Promise<ProviderResponse>;
   }
   ```
2. Add the provider's pricing table to `src/types.ts`
3. Register it in `src/runner.ts` → `makeProvider()` switch
4. Update `EvalSuiteSchema` in `src/types.ts` to accept the new provider name
5. Update this file with the new provider's documentation
