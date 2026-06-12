import OpenAI from "openai";
import type { LLMProvider, ProviderCallOptions, ProviderResponse } from "../types.js";
import { GEMINI_PRICING } from "../types.js";
import { withRetry } from "./retry.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export class GeminiProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    const resolvedKey = apiKey ?? process.env.GEMINI_API_KEY;
    if (!resolvedKey) {
      throw new Error(
        "GEMINI_API_KEY is not set.\n" +
          "  Get a free key at: https://aistudio.google.com/app/apikey\n" +
          "  Set it with: export GEMINI_API_KEY=AIza...\n" +
          "  Or add to .evalrc.json: { \"gemini_api_key\": \"AIza...\" }"
      );
    }
    this.client = new OpenAI({
      apiKey: resolvedKey,
      baseURL: GEMINI_BASE_URL,
    });
  }

  async call(options: ProviderCallOptions): Promise<ProviderResponse> {
    if (!options.model || options.model.trim() === "") {
      throw new Error(
        "Model name is required. Specify 'model' in your suite YAML or .evalrc.json."
      );
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options.system_prompt) {
      messages.push({ role: "system", content: options.system_prompt });
    }
    if (options.messages) {
      for (const m of options.messages) {
        messages.push({ role: m.role, content: m.content });
      }
    } else {
      messages.push({ role: "user", content: options.prompt ?? "" });
    }

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await withRetry(() =>
        this.client.chat.completions.create({
          model: options.model,
          max_tokens: options.max_tokens,
          temperature: options.temperature,
          messages,
        })
      );
    } catch (err) {
      const e = err as { status?: number; message: string };
      if (e.status === 401 || e.status === 403) {
        throw new Error(
          "Gemini authentication failed. Your GEMINI_API_KEY is invalid or expired.\n" +
            "  Get a new key at: https://aistudio.google.com/app/apikey"
        );
      }
      if (e.status === 429) {
        throw new Error(
          "Gemini rate limit exceeded after retries (429). Try reducing --concurrency or wait a moment."
        );
      }
      if (e.status === 500 || e.status === 503) {
        throw new Error(`Gemini server error (${e.status}). The service may be temporarily unavailable.`);
      }
      throw new Error(`Gemini API error: ${e.message}`);
    }

    const output = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens;
    const outputTokens = response.usage?.completion_tokens;

    let cost_usd: number | undefined;
    const pricing = GEMINI_PRICING[options.model];
    if (pricing && inputTokens !== undefined && outputTokens !== undefined) {
      cost_usd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    }

    return { output, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd };
  }
}
