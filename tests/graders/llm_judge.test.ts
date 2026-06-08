import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be declared before vi.mock so the factory can reference it
const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { gradeLLMJudge } from "../../src/graders/llm_judge.js";

describe("gradeLLMJudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeResponse(score: number, reasoning = "Test reasoning") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ score, reasoning }),
        },
      ],
    };
  }

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes when score meets the default threshold (3)", async () => {
    mockCreate.mockResolvedValue(makeResponse(3));
    const r = await gradeLLMJudge(
      "Good output",
      { type: "llm_judge", rubric: "Be helpful", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(3);
    expect(r.criteria_type).toBe("llm_judge");
    expect(r.error).toBeUndefined();
  });

  it("passes when score exceeds threshold", async () => {
    mockCreate.mockResolvedValue(makeResponse(5));
    const r = await gradeLLMJudge(
      "Excellent output",
      { type: "llm_judge", rubric: "Be excellent", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
  });

  it("fails when score is below threshold", async () => {
    mockCreate.mockResolvedValue(makeResponse(2));
    const r = await gradeLLMJudge(
      "Poor output",
      { type: "llm_judge", rubric: "Be helpful", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBe(2);
  });

  it("respects a custom pass_threshold", async () => {
    mockCreate.mockResolvedValue(makeResponse(4));
    const r = await gradeLLMJudge(
      "Great output",
      { type: "llm_judge", rubric: "Be great", pass_threshold: 5 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBe(4);
  });

  it("includes reasoning from judge response", async () => {
    mockCreate.mockResolvedValue(makeResponse(4, "Very well written response"));
    const r = await gradeLLMJudge(
      "output",
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.reasoning).toBe("Very well written response");
  });

  // ── Score clamping ──────────────────────────────────────────────────────────

  it("clamps score above 5 to 5", async () => {
    mockCreate.mockResolvedValue(makeResponse(10));
    const r = await gradeLLMJudge(
      "output",
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.score).toBe(5);
    expect(r.passed).toBe(true);
  });

  it("clamps score below 1 to 1", async () => {
    mockCreate.mockResolvedValue(makeResponse(0));
    const r = await gradeLLMJudge(
      "output",
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.score).toBe(1);
    expect(r.passed).toBe(false);
  });

  // ── Missing API key ─────────────────────────────────────────────────────────

  it("returns pass=false with error when ANTHROPIC_API_KEY is missing", async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const r = await gradeLLMJudge(
      "output",
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 }
      // no apiKey passed, no env var
    );

    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.error).toContain("ANTHROPIC_API_KEY");

    process.env.ANTHROPIC_API_KEY = savedKey;
  });

  // ── API errors ──────────────────────────────────────────────────────────────

  it("returns pass=false with error on API failure", async () => {
    mockCreate.mockRejectedValue(new Error("Connection refused"));
    const r = await gradeLLMJudge(
      "output",
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.error).toContain("Judge error");
    expect(r.error).toContain("Connection refused");
  });

  it("returns pass=false with error when judge returns invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not valid json" }],
    });
    const r = await gradeLLMJudge(
      "output",
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  // ── Non-string output ───────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", async () => {
    // @ts-expect-error testing runtime safety
    const r = await gradeLLMJudge(
      null,
      { type: "llm_judge", rubric: "rubric", pass_threshold: 3 },
      "claude-opus-4-8",
      "fake-api-key"
    );
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });
});
