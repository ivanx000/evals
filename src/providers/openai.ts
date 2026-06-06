import OpenAI from "openai";
import type { LLMProvider, ProviderCallOptions, ProviderResponse } from "../types.js";
import { OPENAI_PRICING } from "../types.js";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async call(options: ProviderCallOptions): Promise<ProviderResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options.system_prompt) {
      messages.push({ role: "system", content: options.system_prompt });
    }
    messages.push({ role: "user", content: options.prompt });

    const response = await this.client.chat.completions.create({
      model: options.model,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      messages,
    });

    const output = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;

    let cost_usd: number | undefined;
    const pricing = OPENAI_PRICING[options.model];
    if (pricing && inputTokens !== undefined && outputTokens !== undefined) {
      cost_usd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    }

    return { output, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd };
  }
}
