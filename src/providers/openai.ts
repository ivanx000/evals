import OpenAI from "openai";
import type { LLMProvider, ProviderCallOptions, ProviderResponse } from "../types.js";
import { OPENAI_PRICING } from "../types.js";
import { withRetry } from "./retry.js";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    const resolvedKey = apiKey ?? process.env.OPENAI_API_KEY;
    if (!resolvedKey) {
      throw new Error(
        "OPENAI_API_KEY is not set.\n" +
          "  Set it with: export OPENAI_API_KEY=sk-...\n" +
          "  Or add it to .evalrc.json: { \"openai_api_key\": \"sk-...\" }"
      );
    }
    this.client = new OpenAI({ apiKey: resolvedKey });
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

    const params = {
      model: options.model,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      messages,
    };

    if (options.onToken) {
      let output = "";
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;

      try {
        const stream = await withRetry(() =>
          this.client.chat.completions.create({
            ...params,
            stream: true as const,
            stream_options: { include_usage: true },
          })
        );
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content;
          if (token) {
            options.onToken(token);
            output += token;
          }
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
        }
      } catch (err) {
        const e = err as { status?: number; message: string };
        if (e.status === 401) {
          throw new Error(
            "OpenAI authentication failed (401). Your OPENAI_API_KEY is invalid or expired.\n" +
              "  Check your key at: https://platform.openai.com/api-keys"
          );
        }
        if (e.status === 429) {
          throw new Error(
            "OpenAI rate limit exceeded after retries (429). Try reducing --concurrency or wait a moment."
          );
        }
        if (e.status === 500 || e.status === 503) {
          throw new Error(`OpenAI server error (${e.status}). The service may be temporarily unavailable.`);
        }
        throw new Error(`OpenAI API error: ${e.message}`);
      }

      let cost_usd: number | undefined;
      const pricing = OPENAI_PRICING[options.model];
      if (pricing && inputTokens !== undefined && outputTokens !== undefined) {
        cost_usd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
      }

      return { output, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd };
    }

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await withRetry(() =>
        this.client.chat.completions.create(params)
      );
    } catch (err) {
      const e = err as { status?: number; message: string };
      if (e.status === 401) {
        throw new Error(
          "OpenAI authentication failed (401). Your OPENAI_API_KEY is invalid or expired.\n" +
            "  Check your key at: https://platform.openai.com/api-keys"
        );
      }
      if (e.status === 429) {
        throw new Error(
          "OpenAI rate limit exceeded after retries (429). Try reducing --concurrency or wait a moment."
        );
      }
      if (e.status === 500 || e.status === 503) {
        throw new Error(`OpenAI server error (${e.status}). The service may be temporarily unavailable.`);
      }
      throw new Error(`OpenAI API error: ${e.message}`);
    }

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
