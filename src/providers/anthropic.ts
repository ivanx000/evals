import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ProviderCallOptions, ProviderResponse } from "../types.js";
import { ANTHROPIC_PRICING } from "../types.js";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  async call(options: ProviderCallOptions): Promise<ProviderResponse> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: options.prompt },
    ];

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      system: options.system_prompt,
      messages,
    });

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
