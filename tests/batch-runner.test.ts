import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock AnthropicProvider with batch methods ────────────────────────────────

const mockBatchSubmit = vi.fn();
const mockBatchPoll = vi.fn();
const mockBatchResults = vi.fn();

vi.mock("../src/providers/anthropic.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    call: vi.fn(),
    batchSubmit: mockBatchSubmit,
    batchPoll: mockBatchPoll,
    batchResults: mockBatchResults,
  })),
}));

// ─── Mock graders so no LLM calls are made ────────────────────────────────────

vi.mock("../src/graders/index.js", () => ({
  runGraders: vi.fn(),
}));

// ─── Mock dataset expansion (not used in these tests) ────────────────────────

vi.mock("../src/dataset.js", () => ({
  expandDataset: vi.fn().mockImplementation((cases) => cases),
}));

import { runSuiteBatch } from "../src/batch-runner.js";
import type { EvalSuite, EvalConfig } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    anthropic_api_key: "test-key",
    judge_model: "claude-opus-4-8",
    results_dir: "./results",
    cache_enabled: false,
    ...overrides,
  };
}

function makeSuite(overrides: Partial<EvalSuite> = {}): EvalSuite {
  return {
    name: "Batch Test Suite",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    max_tokens: 100,
    cases: [
      {
        id: "case-1",
        prompt: "What is 2+2?",
        criteria: [{ type: "contains", value: "4" }],
        tags: [],
      },
      {
        id: "case-2",
        prompt: "What is the capital of France?",
        criteria: [{ type: "contains", value: "Paris" }],
        tags: [],
      },
    ],
    ...overrides,
  };
}

function makeSucceededResult(customId: string, text: string) {
  return {
    custom_id: customId,
    result: {
      type: "succeeded" as const,
      message: {
        content: [{ type: "text", text }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  };
}

function makeErroredResult(customId: string, message: string) {
  return {
    custom_id: customId,
    result: {
      type: "errored" as const,
      error: {
        type: "error" as const,
        error: { type: "invalid_request_error", message },
      },
    },
  };
}

async function* asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runSuiteBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchSubmit.mockResolvedValue("batch-abc123");
    mockBatchPoll.mockResolvedValue({ processing_status: "ended" });
    mockRunGraders.mockResolvedValue([{ criteria_type: "contains", passed: true }]);
  });

  it("completes a successful round-trip for two cases", async () => {
    const suite = makeSuite();
    const config = makeConfig();

    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([
        makeSucceededResult("0", "The answer is 4"),
        makeSucceededResult("1", "Paris is the capital of France"),
      ])
    );

    const result = await runSuiteBatch(suite, config);

    expect(mockBatchSubmit).toHaveBeenCalledOnce();
    const [requests] = mockBatchSubmit.mock.calls[0];
    expect(requests).toHaveLength(2);
    expect(requests[0].custom_id).toBe("0");
    expect(requests[1].custom_id).toBe("1");

    expect(result.batch_id).toBe("batch-abc123");
    expect(result.total).toBe(2);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.cases[0].output).toBe("The answer is 4");
    expect(result.cases[1].output).toBe("Paris is the capital of France");
  });

  it("polls once with in_progress before ended", async () => {
    const suite = makeSuite();
    const config = makeConfig();

    mockBatchPoll
      .mockResolvedValueOnce({ processing_status: "in_progress" })
      .mockResolvedValueOnce({ processing_status: "ended" });

    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([
        makeSucceededResult("0", "4"),
        makeSucceededResult("1", "Paris"),
      ])
    );

    await runSuiteBatch(suite, config);

    expect(mockBatchPoll).toHaveBeenCalledTimes(2);
    expect(mockBatchPoll).toHaveBeenCalledWith("batch-abc123");
  });

  it("preserves case ordering when batch results arrive out of order", async () => {
    const suite = makeSuite();
    const config = makeConfig();

    // Results arrive in reverse order (case-2 before case-1)
    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([
        makeSucceededResult("1", "Paris"),
        makeSucceededResult("0", "The answer is 4"),
      ])
    );

    const result = await runSuiteBatch(suite, config);

    expect(result.cases).toHaveLength(2);
    expect(result.cases[0].case_id).toBe("case-1");
    expect(result.cases[0].output).toBe("The answer is 4");
    expect(result.cases[1].case_id).toBe("case-2");
    expect(result.cases[1].output).toBe("Paris");
  });

  it("marks errored individual requests as failed with error message", async () => {
    const suite = makeSuite();
    const config = makeConfig();

    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([
        makeSucceededResult("0", "4"),
        makeErroredResult("1", "Invalid request: model not found"),
      ])
    );

    const result = await runSuiteBatch(suite, config);

    expect(result.total).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.cases[1].passed).toBe(false);
    expect(result.cases[1].error).toBe("Invalid request: model not found");
    expect(result.cases[1].output).toBe("");
    expect(result.cases[1].grader_results).toHaveLength(0);
  });

  it("includes batch_id and batch_cost_usd in the result", async () => {
    const suite = makeSuite({ model: "claude-haiku-4-5" });
    const config = makeConfig();

    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([
        makeSucceededResult("0", "4"),
        makeSucceededResult("1", "Paris"),
      ])
    );

    const result = await runSuiteBatch(suite, config);

    expect(result.batch_id).toBe("batch-abc123");
    expect(typeof result.batch_cost_usd).toBe("number");
    // Batch cost should be positive (model has known pricing)
    expect(result.batch_cost_usd).toBeGreaterThan(0);
  });

  it("throws a clear error when provider is not anthropic", async () => {
    const suite = makeSuite({ provider: "openai" });
    const config = makeConfig();

    await expect(runSuiteBatch(suite, config)).rejects.toThrow(
      /--batch is only supported for the Anthropic provider/
    );

    expect(mockBatchSubmit).not.toHaveBeenCalled();
  });

  it("returns error result for multi-turn case with intermediate null turns", async () => {
    const suite = makeSuite({
      cases: [
        {
          id: "multi-turn-case",
          turns: [
            { role: "user", content: "Tell me a joke" },
            { role: "assistant", content: null }, // intermediate null — requires mid-run API call
            { role: "user", content: "Explain why that's funny" },
            { role: "assistant", content: null }, // final turn to grade
          ],
          criteria: [{ type: "contains", value: "because" }],
          tags: [],
        },
      ],
    });
    const config = makeConfig();

    // batchSubmit should be called with zero requests (the case was filtered out)
    mockBatchResults.mockResolvedValue(asyncIterableFrom([]));

    const result = await runSuiteBatch(suite, config);

    expect(result.cases[0].passed).toBe(false);
    expect(result.cases[0].error).toMatch(/--batch does not support multi-turn/);
    // No batch requests should have been submitted for this case
    const [submitted] = mockBatchSubmit.mock.calls[0];
    expect(submitted).toHaveLength(0);
  });

  it("applies the filter option to select matching cases", async () => {
    const suite = makeSuite();
    const config = makeConfig();

    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([makeSucceededResult("0", "4")])
    );

    const result = await runSuiteBatch(suite, config, { filter: "case-1" });

    expect(result.total).toBe(1);
    expect(result.cases[0].case_id).toBe("case-1");
    const [submitted] = mockBatchSubmit.mock.calls[0];
    expect(submitted).toHaveLength(1);
  });

  it("computes batch cost at 50% of standard pricing", async () => {
    // claude-haiku-4-5: input $1.00/M, output $5.00/M
    // 10 input + 5 output = (10*1 + 5*5)/1_000_000 = 35/1_000_000 standard
    // batch = 17.5/1_000_000
    const suite = makeSuite({ model: "claude-haiku-4-5" });
    const config = makeConfig();

    mockBatchResults.mockResolvedValue(
      asyncIterableFrom([makeSucceededResult("0", "4"), makeSucceededResult("1", "Paris")])
    );

    const result = await runSuiteBatch(suite, config);

    const expectedCostPerCase = ((10 * 1.0 + 5 * 5.0) / 1_000_000) * 0.5;
    expect(result.batch_cost_usd).toBeCloseTo(expectedCostPerCase * 2, 10);
  });
});
