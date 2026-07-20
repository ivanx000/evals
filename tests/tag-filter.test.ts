import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock providers ───────────────────────────────────────────────────────────

const mockAnthropicCall = vi.fn();

vi.mock("../src/providers/anthropic.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    call: mockAnthropicCall,
  })),
}));

vi.mock("../src/providers/openai.js", () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({ call: vi.fn() })),
}));

vi.mock("../src/providers/ollama.js", () => ({
  OllamaProvider: vi.fn().mockImplementation(() => ({ call: vi.fn() })),
}));

vi.mock("../src/providers/gemini.js", () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({ call: vi.fn() })),
}));

vi.mock("../src/cache.js", () => ({
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
}));

import { runSuite } from "../src/runner.js";
import type { EvalSuite, EvalConfig } from "../src/types.js";

function makeConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    anthropic_api_key: "test-key",
    judge_model: "claude-opus-4-8",
    results_dir: "./results",
    cache_enabled: false,
    ...overrides,
  };
}

const taggedSuite: EvalSuite = {
  name: "Tag Filter Suite",
  provider: "anthropic",
  model: "claude-haiku-4-5",
  max_tokens: 256,
  cases: [
    {
      id: "smoke-1",
      prompt: "A",
      criteria: [{ type: "max_words", value: 100 }],
      tags: ["smoke", "fast"],
    },
    {
      id: "smoke-2",
      prompt: "B",
      criteria: [{ type: "max_words", value: 100 }],
      tags: ["smoke"],
    },
    {
      id: "regression-1",
      prompt: "C",
      criteria: [{ type: "max_words", value: 100 }],
      tags: ["regression"],
    },
    {
      id: "untagged",
      prompt: "D",
      criteria: [{ type: "max_words", value: 100 }],
      tags: [],
    },
  ],
};

describe("--tag filter (tagFilter option)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnthropicCall.mockResolvedValue({
      output: "short answer",
      input_tokens: 10,
      output_tokens: 5,
      cost_usd: 0.0001,
    });
  });

  it("runs all cases when tagFilter is not set", async () => {
    const result = await runSuite(taggedSuite, makeConfig());
    expect(result.total).toBe(4);
    expect(result.skipped).toBeUndefined();
  });

  it("runs all cases when tagFilter is an empty array", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { tagFilter: [] });
    expect(result.total).toBe(4);
    expect(result.skipped).toBeUndefined();
  });

  it("filters to only cases matching a single tag", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { tagFilter: ["smoke"] });
    expect(result.total).toBe(2);
    expect(result.cases.map((c) => c.case_id)).toEqual(["smoke-1", "smoke-2"]);
  });

  it("reports skipped count equal to non-matching cases", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { tagFilter: ["smoke"] });
    expect(result.skipped).toBe(2); // regression-1 and untagged
  });

  it("applies OR logic across multiple tags", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { tagFilter: ["smoke", "regression"] });
    expect(result.total).toBe(3);
    expect(result.cases.map((c) => c.case_id)).toEqual(["smoke-1", "smoke-2", "regression-1"]);
    expect(result.skipped).toBe(1); // untagged
  });

  it("returns zero cases when no cases have the requested tag", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { tagFilter: ["nonexistent"] });
    expect(result.total).toBe(0);
    expect(result.skipped).toBe(4);
  });

  it("excludes untagged cases even when filtering", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { tagFilter: ["fast"] });
    expect(result.total).toBe(1);
    expect(result.cases[0].case_id).toBe("smoke-1");
    expect(result.skipped).toBe(3);
  });

  it("composes correctly with --filter (substring filter applied first)", async () => {
    // --filter "smoke" matches smoke-1, smoke-2; then --tag ["smoke"] keeps both
    const result = await runSuite(taggedSuite, makeConfig(), {
      filter: "smoke",
      tagFilter: ["smoke"],
    });
    expect(result.total).toBe(2);
    expect(result.skipped).toBe(0); // both substring-matched cases have the tag
  });

  it("does not set skipped in result when no tag filter is active", async () => {
    const result = await runSuite(taggedSuite, makeConfig(), { filter: "smoke" });
    expect(result.skipped).toBeUndefined();
  });
});
