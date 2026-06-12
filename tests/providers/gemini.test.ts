import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the OpenAI SDK ──────────────────────────────────────────────────────

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

import { GeminiProvider } from "../../src/providers/gemini.js";

function makeResponse(content: string, promptTokens = 10, completionTokens = 5) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

describe("GeminiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  // ── Constructor ─────────────────────────────────────────────────────────────

  it("throws a clear error when no API key is provided", () => {
    expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY/);
  });

  it("reads the API key from GEMINI_API_KEY env var", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(() => new GeminiProvider()).not.toThrow();
  });

  it("accepts an API key passed directly to the constructor", () => {
    expect(() => new GeminiProvider("direct-key")).not.toThrow();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns output and token counts from a successful response", async () => {
    mockCreate.mockResolvedValue(makeResponse("The answer is 42", 20, 8));
    const provider = new GeminiProvider("test-key");
    const result = await provider.call({
      model: "gemini-2.0-flash",
      prompt: "What is 6 times 7?",
      max_tokens: 128,
    });
    expect(result.output).toBe("The answer is 42");
    expect(result.input_tokens).toBe(20);
    expect(result.output_tokens).toBe(8);
  });

  it("calculates cost from the pricing table", async () => {
    mockCreate.mockResolvedValue(makeResponse("Paris", 100, 10));
    const provider = new GeminiProvider("test-key");
    const result = await provider.call({
      model: "gemini-2.0-flash",
      prompt: "Capital of France?",
      max_tokens: 64,
    });
    // gemini-2.0-flash: $0.10/1M input, $0.40/1M output
    const expected = (100 * 0.10 + 10 * 0.40) / 1_000_000;
    expect(result.cost_usd).toBeCloseTo(expected, 10);
  });

  it("returns undefined cost for an unknown model", async () => {
    mockCreate.mockResolvedValue(makeResponse("hi", 10, 5));
    const provider = new GeminiProvider("test-key");
    const result = await provider.call({
      model: "gemini-unknown-model",
      prompt: "hi",
      max_tokens: 64,
    });
    expect(result.cost_usd).toBeUndefined();
  });

  it("passes system prompt as a system message", async () => {
    mockCreate.mockResolvedValue(makeResponse("ok"));
    const provider = new GeminiProvider("test-key");
    await provider.call({
      model: "gemini-2.0-flash",
      prompt: "hello",
      system_prompt: "You are a helpful assistant.",
      max_tokens: 64,
    });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages[0]).toEqual({ role: "system", content: "You are a helpful assistant." });
    expect(messages[1]).toEqual({ role: "user", content: "hello" });
  });

  it("passes multi-turn messages correctly", async () => {
    mockCreate.mockResolvedValue(makeResponse("reply"));
    const provider = new GeminiProvider("test-key");
    await provider.call({
      model: "gemini-2.0-flash",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "How are you?" },
      ],
      max_tokens: 128,
    });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("throws a clear error on 401", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const provider = new GeminiProvider("bad-key");
    await expect(
      provider.call({ model: "gemini-2.0-flash", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/authentication failed/i);
  });

  it("throws a clear error on 403", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const provider = new GeminiProvider("bad-key");
    await expect(
      provider.call({ model: "gemini-2.0-flash", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/authentication failed/i);
  });

  it("throws a clear error on 429", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Too Many Requests"), { status: 429 }));
    const provider = new GeminiProvider("test-key");
    await expect(
      provider.call({ model: "gemini-2.0-flash", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/rate limit/i);
  }, 15_000);

  it("throws a clear error when model name is empty", async () => {
    const provider = new GeminiProvider("test-key");
    await expect(
      provider.call({ model: "", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Model name is required/);
  });
});
