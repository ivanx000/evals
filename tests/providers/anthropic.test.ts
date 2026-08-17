import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the Anthropic SDK so no real HTTP calls are made ────────────────────

const mockCreate = vi.fn();
const mockStream = vi.fn();
const mockBatchCreate = vi.fn();
const mockBatchRetrieve = vi.fn();
const mockBatchResults = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
      batches: {
        create: mockBatchCreate,
        retrieve: mockBatchRetrieve,
        results: mockBatchResults,
      },
    },
  })),
}));

import { AnthropicProvider } from "../../src/providers/anthropic.js";

function makeResponse(
  textBlocks: string[],
  inputTokens = 10,
  outputTokens = 5,
  extraBlocks: Array<{ type: string }> = []
) {
  return {
    content: [
      ...textBlocks.map((text) => ({ type: "text", text })),
      ...extraBlocks,
    ],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function makeStream(deltas: string[], finalMsg: unknown) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of deltas) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      }
    },
    finalMessage: async () => finalMsg,
  };
}

describe("AnthropicProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  // ── Constructor ─────────────────────────────────────────────────────────────

  it("throws a clear error when no API key is provided", () => {
    expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("reads the API key from ANTHROPIC_API_KEY env var", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(() => new AnthropicProvider()).not.toThrow();
  });

  it("accepts an API key passed directly to the constructor", () => {
    expect(() => new AnthropicProvider("direct-key")).not.toThrow();
  });

  // ── Happy path (non-streaming) ──────────────────────────────────────────────

  it("returns output and token counts from a successful response", async () => {
    mockCreate.mockResolvedValue(makeResponse(["The answer is 42"], 20, 8));
    const provider = new AnthropicProvider("test-key");
    const result = await provider.call({
      model: "claude-haiku-4-5",
      prompt: "What is 6 times 7?",
      max_tokens: 128,
    });
    expect(result.output).toBe("The answer is 42");
    expect(result.input_tokens).toBe(20);
    expect(result.output_tokens).toBe(8);
  });

  it("joins multiple text blocks and ignores non-text blocks", async () => {
    mockCreate.mockResolvedValue(
      makeResponse(["Hello ", "world"], 10, 5, [{ type: "tool_use" }])
    );
    const provider = new AnthropicProvider("test-key");
    const result = await provider.call({
      model: "claude-haiku-4-5",
      prompt: "hi",
      max_tokens: 64,
    });
    expect(result.output).toBe("Hello world");
  });

  it("calculates cost from the pricing table", async () => {
    mockCreate.mockResolvedValue(makeResponse(["Paris"], 1_000_000, 1_000_000));
    const provider = new AnthropicProvider("test-key");
    const result = await provider.call({
      model: "claude-haiku-4-5",
      prompt: "Capital of France?",
      max_tokens: 64,
    });
    // claude-haiku-4-5: $1.00/1M input, $5.00/1M output
    expect(result.cost_usd).toBeCloseTo(1.0 + 5.0, 10);
  });

  it("returns undefined cost for an unknown model", async () => {
    mockCreate.mockResolvedValue(makeResponse(["hi"], 10, 5));
    const provider = new AnthropicProvider("test-key");
    const result = await provider.call({
      model: "claude-unknown-model",
      prompt: "hi",
      max_tokens: 64,
    });
    expect(result.cost_usd).toBeUndefined();
  });

  it("passes system prompt as the system field, not as a message", async () => {
    mockCreate.mockResolvedValue(makeResponse(["ok"]));
    const provider = new AnthropicProvider("test-key");
    await provider.call({
      model: "claude-haiku-4-5",
      prompt: "hello",
      system_prompt: "You are helpful.",
      max_tokens: 64,
    });
    const params = mockCreate.mock.calls[0][0];
    expect(params.system).toBe("You are helpful.");
    expect(params.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("passes multi-turn messages correctly", async () => {
    mockCreate.mockResolvedValue(makeResponse(["reply"]));
    const provider = new AnthropicProvider("test-key");
    await provider.call({
      model: "claude-haiku-4-5",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
      ],
      max_tokens: 128,
    });
    const messages = mockCreate.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(messages[2]).toEqual({ role: "user", content: "How are you?" });
  });

  it("throws a clear error when model name is empty", async () => {
    const provider = new AnthropicProvider("test-key");
    await expect(
      provider.call({ model: "", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Model name is required/);
  });

  // ── Error handling (non-streaming, goes through withRetry) ──────────────────

  it("throws a clear error on 401 without retrying", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    const provider = new AnthropicProvider("bad-key");
    await expect(
      provider.call({ model: "claude-haiku-4-5", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/authentication failed/i);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error on 429 after retries", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Too Many Requests"), { status: 429 }));
    const provider = new AnthropicProvider("test-key");
    await expect(
      provider.call({ model: "claude-haiku-4-5", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/rate limit/i);
  }, 15_000);

  it("throws a clear error on 500 after retries", async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error("Internal Server Error"), { status: 500 }));
    const provider = new AnthropicProvider("test-key");
    await expect(
      provider.call({ model: "claude-haiku-4-5", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/server error/i);
  }, 15_000);

  it("wraps other errors with a generic Anthropic API error message", async () => {
    mockCreate.mockRejectedValue(new Error("something odd happened"));
    const provider = new AnthropicProvider("test-key");
    await expect(
      provider.call({ model: "claude-haiku-4-5", prompt: "hi", max_tokens: 64 })
    ).rejects.toThrow(/Anthropic API error: something odd happened/);
  });

  // ── Streaming (onToken) ──────────────────────────────────────────────────────

  it("streams tokens via onToken and accumulates output", async () => {
    mockStream.mockReturnValue(
      makeStream(["Hel", "lo", " world"], {
        usage: { input_tokens: 15, output_tokens: 3 },
      })
    );
    const provider = new AnthropicProvider("test-key");
    const received: string[] = [];
    const result = await provider.call({
      model: "claude-haiku-4-5",
      prompt: "hi",
      max_tokens: 64,
      onToken: (t) => received.push(t),
    });
    expect(received).toEqual(["Hel", "lo", " world"]);
    expect(result.output).toBe("Hello world");
    expect(result.input_tokens).toBe(15);
    expect(result.output_tokens).toBe(3);
  });

  it("throws a clear error on streaming failure without retrying", async () => {
    mockStream.mockImplementation(() => {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    });
    const provider = new AnthropicProvider("bad-key");
    await expect(
      provider.call({
        model: "claude-haiku-4-5",
        prompt: "hi",
        max_tokens: 64,
        onToken: () => {},
      })
    ).rejects.toThrow(/authentication failed/i);
  });

  // ── Batch API ─────────────────────────────────────────────────────────────

  it("batchSubmit returns the created batch id", async () => {
    mockBatchCreate.mockResolvedValue({ id: "batch_123" });
    const provider = new AnthropicProvider("test-key");
    const id = await provider.batchSubmit([
      { custom_id: "case-1", params: { model: "claude-haiku-4-5", max_tokens: 64, messages: [] } },
    ]);
    expect(id).toBe("batch_123");
    expect(mockBatchCreate).toHaveBeenCalledWith({
      requests: [
        { custom_id: "case-1", params: { model: "claude-haiku-4-5", max_tokens: 64, messages: [] } },
      ],
    });
  });

  it("batchPoll retrieves the batch by id", async () => {
    mockBatchRetrieve.mockResolvedValue({ id: "batch_123", processing_status: "ended" });
    const provider = new AnthropicProvider("test-key");
    const batch = await provider.batchPoll("batch_123");
    expect(batch).toEqual({ id: "batch_123", processing_status: "ended" });
    expect(mockBatchRetrieve).toHaveBeenCalledWith("batch_123");
  });

  it("batchResults returns the results iterable for the batch", async () => {
    const fakeResults = { [Symbol.asyncIterator]: async function* () {} };
    mockBatchResults.mockResolvedValue(fakeResults);
    const provider = new AnthropicProvider("test-key");
    const results = await provider.batchResults("batch_123");
    expect(results).toBe(fakeResults);
    expect(mockBatchResults).toHaveBeenCalledWith("batch_123");
  });
});
