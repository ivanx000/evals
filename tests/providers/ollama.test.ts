import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the OpenAI SDK so no real HTTP calls are made ───────────────────────

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

import { OllamaProvider } from "../../src/providers/ollama.js";

function makeOpenAIResponse(content: string, promptTokens = 10, completionTokens = 5) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OLLAMA_HOST;
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns output and token counts from a successful response", async () => {
    mockCreate.mockResolvedValue(makeOpenAIResponse("4", 8, 3));
    const provider = new OllamaProvider();
    const result = await provider.call({
      model: "llama3",
      prompt: "What is 2 + 2?",
      max_tokens: 64,
    });
    expect(result.output).toBe("4");
    expect(result.input_tokens).toBe(8);
    expect(result.output_tokens).toBe(3);
  });

  it("always reports cost_usd as 0", async () => {
    mockCreate.mockResolvedValue(makeOpenAIResponse("Paris"));
    const provider = new OllamaProvider();
    const result = await provider.call({
      model: "llama3",
      prompt: "Capital of France?",
      max_tokens: 64,
    });
    expect(result.cost_usd).toBe(0);
  });

  it("passes system prompt as a system message", async () => {
    mockCreate.mockResolvedValue(makeOpenAIResponse("ok"));
    const provider = new OllamaProvider();
    await provider.call({
      model: "llama3",
      prompt: "hello",
      system_prompt: "You are helpful.",
      max_tokens: 64,
    });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(messages[1]).toEqual({ role: "user", content: "hello" });
  });

  it("uses OLLAMA_HOST env var for base URL", () => {
    process.env.OLLAMA_HOST = "http://192.168.1.10:11434";
    const provider = new OllamaProvider();
    expect(provider.baseUrl).toBe("http://192.168.1.10:11434");
  });

  it("passes multi-turn messages correctly", async () => {
    mockCreate.mockResolvedValue(makeOpenAIResponse("assistant reply"));
    const provider = new OllamaProvider();
    await provider.call({
      model: "llama3",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
      ],
      max_tokens: 128,
    });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("user");
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("throws a clear error when Ollama is not running (ECONNREFUSED)", async () => {
    const connError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), {
      code: "ECONNREFUSED",
    });
    mockCreate.mockRejectedValue(connError);
    const provider = new OllamaProvider();
    await expect(
      provider.call({ model: "llama3", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Could not connect to Ollama/);
  });

  it("throws a clear error when Ollama is not running (fetch failed)", async () => {
    mockCreate.mockRejectedValue(new Error("fetch failed"));
    const provider = new OllamaProvider();
    await expect(
      provider.call({ model: "llama3", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Could not connect to Ollama/);
  });

  it("throws a clear error with pull hint when model is not found (404)", async () => {
    const notFoundError = Object.assign(new Error("Not Found"), { status: 404 });
    mockCreate.mockRejectedValue(notFoundError);
    const provider = new OllamaProvider();
    await expect(
      provider.call({ model: "mistral", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/ollama pull mistral/);
  });

  it("throws a clear error when model name is empty", async () => {
    const provider = new OllamaProvider();
    await expect(
      provider.call({ model: "", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Model name is required/);
  });
});
