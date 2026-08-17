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

import { OpenAIProvider } from "../../src/providers/openai.js";

function makeResponse(content: string, promptTokens = 10, completionTokens = 5) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

function makeStreamChunks(tokens: string[], promptTokens = 10, completionTokens = 5) {
  const chunks = tokens.map((t) => ({ choices: [{ delta: { content: t } }] }));
  chunks.push({
    choices: [{ delta: {} }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  } as (typeof chunks)[number] & { usage: unknown });
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
}

describe("OpenAIProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  // ── Constructor ─────────────────────────────────────────────────────────────

  it("throws a clear error when no API key is provided", () => {
    expect(() => new OpenAIProvider()).toThrow(/OPENAI_API_KEY/);
  });

  it("reads the API key from OPENAI_API_KEY env var", () => {
    process.env.OPENAI_API_KEY = "test-key";
    expect(() => new OpenAIProvider()).not.toThrow();
  });

  it("accepts an API key passed directly to the constructor", () => {
    expect(() => new OpenAIProvider("direct-key")).not.toThrow();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns output and token counts from a successful response", async () => {
    mockCreate.mockResolvedValue(makeResponse("The answer is 42", 20, 8));
    const provider = new OpenAIProvider("test-key");
    const result = await provider.call({
      model: "gpt-4o",
      prompt: "What is 6 times 7?",
      max_tokens: 128,
    });
    expect(result.output).toBe("The answer is 42");
    expect(result.input_tokens).toBe(20);
    expect(result.output_tokens).toBe(8);
  });

  it("calculates cost from the pricing table", async () => {
    mockCreate.mockResolvedValue(makeResponse("Paris", 1_000_000, 1_000_000));
    const provider = new OpenAIProvider("test-key");
    const result = await provider.call({
      model: "gpt-4o-mini",
      prompt: "Capital of France?",
      max_tokens: 64,
    });
    // gpt-4o-mini: $0.15/1M input, $0.60/1M output
    expect(result.cost_usd).toBeCloseTo(0.15 + 0.6, 10);
  });

  it("returns undefined cost for an unknown model", async () => {
    mockCreate.mockResolvedValue(makeResponse("hi", 10, 5));
    const provider = new OpenAIProvider("test-key");
    const result = await provider.call({
      model: "gpt-unknown-model",
      prompt: "hi",
      max_tokens: 64,
    });
    expect(result.cost_usd).toBeUndefined();
  });

  it("does not include a system message when system_prompt is omitted", async () => {
    mockCreate.mockResolvedValue(makeResponse("ok"));
    const provider = new OpenAIProvider("test-key");
    await provider.call({ model: "gpt-4o", prompt: "hello", max_tokens: 64 });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: "user", content: "hello" });
  });

  it("passes system prompt as a leading system message", async () => {
    mockCreate.mockResolvedValue(makeResponse("ok"));
    const provider = new OpenAIProvider("test-key");
    await provider.call({
      model: "gpt-4o",
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
    const provider = new OpenAIProvider("test-key");
    await provider.call({
      model: "gpt-4o",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
        { role: "user", content: "How are you?" },
      ],
      max_tokens: 128,
    });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(messages[2]).toEqual({ role: "user", content: "How are you?" });
  });

  // ── Streaming ────────────────────────────────────────────────────────────────

  it("streams tokens via onToken and accumulates output", async () => {
    mockCreate.mockResolvedValue(makeStreamChunks(["Hel", "lo", " world"], 15, 3));
    const provider = new OpenAIProvider("test-key");
    const received: string[] = [];
    const result = await provider.call({
      model: "gpt-4o",
      prompt: "hi",
      max_tokens: 64,
      onToken: (t) => received.push(t),
    });
    expect(received).toEqual(["Hel", "lo", " world"]);
    expect(result.output).toBe("Hello world");
    expect(result.input_tokens).toBe(15);
    expect(result.output_tokens).toBe(3);
  });

  it("requests streaming with usage included", async () => {
    mockCreate.mockResolvedValue(makeStreamChunks(["hi"]));
    const provider = new OpenAIProvider("test-key");
    await provider.call({
      model: "gpt-4o",
      prompt: "hi",
      max_tokens: 64,
      onToken: () => {},
    });
    const params = mockCreate.mock.calls[0][0];
    expect(params.stream).toBe(true);
    expect(params.stream_options).toEqual({ include_usage: true });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("throws a clear error on 401", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const provider = new OpenAIProvider("bad-key");
    await expect(
      provider.call({ model: "gpt-4o", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/authentication failed/i);
  });

  it("throws a clear error on 429", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Too Many Requests"), { status: 429 }));
    const provider = new OpenAIProvider("test-key");
    await expect(
      provider.call({ model: "gpt-4o", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/rate limit/i);
  }, 15_000);

  it("throws a clear error on 500", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Internal Server Error"), { status: 500 }));
    const provider = new OpenAIProvider("test-key");
    await expect(
      provider.call({ model: "gpt-4o", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/server error/i);
  }, 15_000);

  it("throws a clear error on 503", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Service Unavailable"), { status: 503 }));
    const provider = new OpenAIProvider("test-key");
    await expect(
      provider.call({ model: "gpt-4o", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/server error/i);
  }, 15_000);

  it("wraps other errors with a generic OpenAI API error message", async () => {
    mockCreate.mockRejectedValue(new Error("something odd happened"));
    const provider = new OpenAIProvider("test-key");
    await expect(
      provider.call({ model: "gpt-4o", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/OpenAI API error: something odd happened/);
  });

  it("throws a clear error when model name is empty", async () => {
    const provider = new OpenAIProvider("test-key");
    await expect(
      provider.call({ model: "", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Model name is required/);
  });
});
