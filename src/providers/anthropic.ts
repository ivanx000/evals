import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ProviderCallOptions, ProviderResponse } from "../types.js";
import { ANTHROPIC_PRICING } from "../types.js";
import { withRetry } from "./retry.js";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const resolvedKey = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!resolvedKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set.\n" +
          "  Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n" +
          "  Or add it to .evalrc.json: { \"anthropic_api_key\": \"sk-ant-...\" }"
      );
    }
    this.client = new Anthropic({ apiKey: resolvedKey });
  }

  async call(options: ProviderCallOptions): Promise<ProviderResponse> {
    if (!options.model || options.model.trim() === "") {
      throw new Error(
        "Model name is required. Specify 'model' in your suite YAML or .evalrc.json."
      );
    }

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: options.prompt },
    ];

    let response: Anthropic.Message;
    try {
      response = await withRetry(() =>
        this.client.messages.create({
          model: options.model,
          max_tokens: options.max_tokens,
          temperature: options.temperature,
          system: options.system_prompt,
          messages,
        })
      );
    } catch (err) {
      const e = err as { status?: number; message: string };
      if (e.status === 401) {
        throw new Error(
          "Anthropic authentication failed (401). Your ANTHROPIC_API_KEY is invalid or expired.\n" +
            "  Check your key at: https://console.anthropic.com"
        );
      }
      if (e.status === 429) {
        throw new Error(
          "Anthropic rate limit exceeded after retries (429). Try reducing --concurrency or wait a moment."
        );
      }
      if (e.status === 500 || e.status === 503) {
        throw new Error(`Anthropic server error (${e.status}). The service may be temporarily unavailable.`);
      }
      throw new Error(`Anthropic API error: ${e.message}`);
    }

    const output =
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const pricing = ANTHROPIC_PRICING[options.model];
    const cost_usd = pricing
      ? (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
      : undefined;

    return { output, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd };
  }
}
