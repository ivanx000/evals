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
