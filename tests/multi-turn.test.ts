import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalSuite, EvalConfig } from "../src/types.js";

// ─── Mock providers ───────────────────────────────────────────────────────────

const mockAnthropicCall = vi.fn();

vi.mock("../src/providers/anthropic.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    call: mockAnthropicCall,
  })),
}));

vi.mock("../src/providers/openai.js", () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    call: vi.fn(),
  })),
}));

vi.mock("../src/cache.js", () => ({
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
}));

// ─── Mock plugins (no graders/ dir in tests) ─────────────────────────────────

vi.mock("../src/plugins.js", () => ({
  loadPlugins: vi.fn().mockResolvedValue(new Map()),
}));

import { runSuite } from "../src/runner.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    anthropic_api_key: "test-key",
    openai_api_key: "test-openai-key",
    judge_model: "claude-opus-4-8",
    results_dir: "./results",
    cache_enabled: false,
    ...overrides,
  };
}

function makeResponse(output = "test output") {
  return { output, input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 };
}

// ─── Multi-turn test suite ────────────────────────────────────────────────────

describe("Multi-turn evals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSuite: EvalSuite = {
    name: "Multi-turn test",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    max_tokens: 256,
    cases: [],
  };

  it("runs a simple two-turn conversation and evaluates the last assistant turn", async () => {
    mockAnthropicCall.mockResolvedValue(makeResponse("Ivan is my name"));

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "memory-test",
          turns: [
            { role: "user", content: "My name is Ivan." },
            { role: "assistant", content: null },
          ],
          criteria: [{ type: "contains", value: "Ivan", case_sensitive: false }],
          tags: [],
        },
      ],
    };

    const result = await runSuite(suite, makeConfig());
    expect(result.total).toBe(1);
    expect(result.cases[0].output).toBe("Ivan is my name");
    expect(result.cases[0].passed).toBe(true);
    expect(mockAnthropicCall).toHaveBeenCalledTimes(1);
  });

  it("calls provider once for each null assistant turn", async () => {
    // 2 null turns: first gets an intermediate response, second is evaluated
    mockAnthropicCall
      .mockResolvedValueOnce(makeResponse("Hello Ivan!"))    // intermediate
      .mockResolvedValueOnce(makeResponse("Your name is Ivan")); // final

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "three-turn",
          turns: [
            { role: "user", content: "My name is Ivan." },
            { role: "assistant", content: null },   // intermediate
            { role: "user", content: "What is my name?" },
            { role: "assistant", content: null },   // evaluated
          ],
          criteria: [{ type: "contains", value: "Ivan", case_sensitive: false }],
          tags: [],
        },
      ],
    };

    const result = await runSuite(suite, makeConfig());
    expect(mockAnthropicCall).toHaveBeenCalledTimes(2);
    expect(result.cases[0].output).toBe("Your name is Ivan");
    expect(result.cases[0].passed).toBe(true);
  });

  it("passes the correct conversation history to the final API call", async () => {
    mockAnthropicCall
      .mockResolvedValueOnce(makeResponse("Nice to meet you, Alice!"))
      .mockResolvedValueOnce(makeResponse("Your name is Alice"));

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "history-check",
          turns: [
            { role: "user", content: "My name is Alice." },
            { role: "assistant", content: null },     // intermediate → "Nice to meet you, Alice!"
            { role: "user", content: "What is my name?" },
            { role: "assistant", content: null },     // final call
          ],
          criteria: [{ type: "contains", value: "Alice", case_sensitive: false }],
          tags: [],
        },
      ],
    };

    await runSuite(suite, makeConfig());

    // The final call should have conversation history as messages
    const finalCallArgs = mockAnthropicCall.mock.calls[1][0];
    expect(finalCallArgs.messages).toEqual([
      { role: "user", content: "My name is Alice." },
      { role: "assistant", content: "Nice to meet you, Alice!" },
      { role: "user", content: "What is my name?" },
    ]);
  });

  it("injects fixed assistant turns (non-null content) into history without calling the model", async () => {
    mockAnthropicCall.mockResolvedValue(makeResponse("Paris"));

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "fixed-turn",
          turns: [
            { role: "user", content: "What is 2+2?" },
            { role: "assistant", content: "4." },    // fixed, NOT a model call
            { role: "user", content: "What is the capital of France?" },
            { role: "assistant", content: null },    // evaluated
          ],
          criteria: [{ type: "contains", value: "Paris", case_sensitive: false }],
          tags: [],
        },
      ],
    };

    await runSuite(suite, makeConfig());
    // Only one API call (the final evaluated turn)
    expect(mockAnthropicCall).toHaveBeenCalledTimes(1);

    const callArgs = mockAnthropicCall.mock.calls[0][0];
    expect(callArgs.messages).toEqual([
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "4." },
      { role: "user", content: "What is the capital of France?" },
    ]);
  });

  it("marks case as failed when the last turn response does not pass criteria", async () => {
    mockAnthropicCall.mockResolvedValue(makeResponse("I don't know your name."));

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "fail-test",
          turns: [
            { role: "user", content: "My name is Ivan." },
            { role: "assistant", content: null },
          ],
          criteria: [{ type: "contains", value: "Ivan", case_sensitive: false }],
          tags: [],
        },
      ],
    };

    const result = await runSuite(suite, makeConfig());
    expect(result.cases[0].passed).toBe(false);
    expect(result.failed).toBe(1);
  });

  it("uses [multi-turn: N turns] as the prompt label in CaseResult", async () => {
    mockAnthropicCall.mockResolvedValue(makeResponse("output"));

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "label-test",
          turns: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: null },
          ],
          criteria: [{ type: "max_words", value: 100 }],
          tags: [],
        },
      ],
    };

    const result = await runSuite(suite, makeConfig());
    expect(result.cases[0].prompt).toContain("multi-turn");
    expect(result.cases[0].prompt).toContain("2 turns");
  });

  it("marks case as error when provider throws during multi-turn", async () => {
    mockAnthropicCall.mockRejectedValue(new Error("API error"));

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "error-test",
          turns: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: null },
          ],
          criteria: [{ type: "max_words", value: 100 }],
          tags: [],
        },
      ],
    };

    const result = await runSuite(suite, makeConfig());
    expect(result.cases[0].passed).toBe(false);
    expect(result.cases[0].error).toContain("API error");
  });

  it("accumulates token counts across intermediate turns", async () => {
    mockAnthropicCall
      .mockResolvedValueOnce({ output: "intermediate", input_tokens: 10, output_tokens: 5, cost_usd: 0.001 })
      .mockResolvedValueOnce({ output: "final", input_tokens: 20, output_tokens: 8, cost_usd: 0.002 });

    const suite: EvalSuite = {
      ...baseSuite,
      cases: [
        {
          id: "token-accum",
          turns: [
            { role: "user", content: "Turn 1" },
            { role: "assistant", content: null },  // intermediate
            { role: "user", content: "Turn 3" },
            { role: "assistant", content: null },  // final
          ],
          criteria: [{ type: "max_words", value: 100 }],
          tags: [],
        },
      ],
    };

    const result = await runSuite(suite, makeConfig());
    expect(result.cases[0].input_tokens).toBe(30);   // 10 + 20
    expect(result.cases[0].output_tokens).toBe(13);  // 5 + 8
    expect(result.cases[0].cost_usd).toBeCloseTo(0.003, 6);
  });
});
