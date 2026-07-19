import OpenAI from "openai";
import type { LLMProvider, ProviderCallOptions, ProviderResponse } from "../types.js";
import { withRetry } from "./retry.js";

const DEFAULT_HOST = "http://localhost:11434";

export class OllamaProvider implements LLMProvider {
  private client: OpenAI;
  readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_HOST ?? DEFAULT_HOST;
    this.client = new OpenAI({
      apiKey: "ollama",
      baseURL: `${this.baseUrl}/v1`,
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

    const params = {
      model: options.model,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      messages,
    };

    const handleOllamaError = (err: unknown): never => {
      const e = err as { status?: number; message: string; code?: string };
      const msg = e.message ?? "";
      if (
        e.code === "ECONNREFUSED" ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("fetch failed") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("connect ECONNREFUSED")
      ) {
        throw new Error(
          `Could not connect to Ollama at ${this.baseUrl}.\n` +
            `  Make sure Ollama is running: https://ollama.com`
        );
      }
      if (e.status === 404) {
        throw new Error(
          `Model '${options.model}' not found in Ollama. Run: ollama pull ${options.model}`
        );
      }
      throw new Error(`Ollama API error: ${e.message}`);
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
        handleOllamaError(err);
      }

      return { output, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: 0 };
    }

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await withRetry(() =>
        this.client.chat.completions.create(params)
      );
    } catch (err) {
      handleOllamaError(err);
    }

    const output = response!.choices[0]?.message?.content ?? "";
    const inputTokens = response!.usage?.prompt_tokens;
    const outputTokens = response!.usage?.completion_tokens;

    return { output, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: 0 };
  }
}
