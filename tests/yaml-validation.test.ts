import { describe, it, expect } from "vitest";
import { EvalSuiteSchema, EvalConfigSchema } from "../src/types.js";

// These tests validate the Zod schemas directly, simulating what loadSuite does
// when it calls EvalSuiteSchema.safeParse() on the parsed YAML object.

describe("EvalSuiteSchema", () => {
  const validSuite = {
    name: "Test Suite",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    max_tokens: 512,
    cases: [
      {
        id: "case-1",
        prompt: "Hello",
        criteria: [{ type: "contains", value: "hi", case_sensitive: false }],
        tags: ["smoke"],
      },
    ],
  };

  // ── Valid suites ──────────────────────────────────────────────────────────

  it("accepts a fully valid suite", () => {
    const result = EvalSuiteSchema.safeParse(validSuite);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal suite (only required fields)", () => {
    const minimal = {
      name: "Minimal",
      cases: [
        { prompt: "test", criteria: [{ type: "max_words", value: 10 }] },
      ],
    };
    const result = EvalSuiteSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("uses 'anthropic' as default provider when not specified", () => {
    const result = EvalSuiteSchema.safeParse({
      name: "Test",
      cases: [{ prompt: "test", criteria: [{ type: "max_words", value: 10 }] }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.provider).toBe("anthropic");
  });

  it("uses 1024 as default max_tokens when not specified", () => {
    const result = EvalSuiteSchema.safeParse({
      name: "Test",
      cases: [{ prompt: "test", criteria: [{ type: "max_words", value: 10 }] }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.max_tokens).toBe(1024);
  });

  // ── Required fields ───────────────────────────────────────────────────────

  it("fails when 'name' is missing", () => {
    const { name: _, ...noName } = validSuite;
    const result = EvalSuiteSchema.safeParse(noName);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("name");
    }
  });

  it("fails when 'cases' is missing", () => {
    const { cases: _, ...noCases } = validSuite;
    const result = EvalSuiteSchema.safeParse(noCases);
    expect(result.success).toBe(false);
  });

  it("fails when 'cases' is an empty array", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, cases: [] });
    expect(result.success).toBe(false);
  });

  // ── Provider validation ───────────────────────────────────────────────────

  it("accepts 'anthropic' provider", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, provider: "anthropic" });
    expect(result.success).toBe(true);
  });

  it("accepts 'openai' provider", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, provider: "openai" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown provider", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, provider: "cohere" });
    expect(result.success).toBe(false);
  });

  // ── Temperature and max_tokens bounds ─────────────────────────────────────

  it("rejects temperature below 0", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, temperature: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects temperature above 2", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, temperature: 2.1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive max_tokens", () => {
    const result = EvalSuiteSchema.safeParse({ ...validSuite, max_tokens: 0 });
    expect(result.success).toBe(false);
  });

  // ── Criteria validation ───────────────────────────────────────────────────

  it("fails when a case has no criteria", () => {
    const result = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [{ prompt: "test", criteria: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown criteria type", () => {
    const result = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [{ prompt: "test", criteria: [{ type: "unknown_grader", value: "x" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid criteria types together", () => {
    const result = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [
        {
          prompt: "test",
          criteria: [
            { type: "exact_match", value: "x", case_sensitive: false },
            { type: "contains", value: "x", case_sensitive: false },
            { type: "max_words", value: 10 },
            { type: "regex", value: "\\w+", flags: "i" },
            { type: "llm_judge", rubric: "be good", pass_threshold: 3 },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects max_words with a non-integer value", () => {
    const result = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [{ prompt: "test", criteria: [{ type: "max_words", value: 1.5 }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects max_words with a negative value", () => {
    const result = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [{ prompt: "test", criteria: [{ type: "max_words", value: -5 }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects llm_judge pass_threshold outside 1-5 range", () => {
    const outLow = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [{ prompt: "t", criteria: [{ type: "llm_judge", rubric: "r", pass_threshold: 0 }] }],
    });
    const outHigh = EvalSuiteSchema.safeParse({
      ...validSuite,
      cases: [{ prompt: "t", criteria: [{ type: "llm_judge", rubric: "r", pass_threshold: 6 }] }],
    });
    expect(outLow.success).toBe(false);
    expect(outHigh.success).toBe(false);
  });
});

// ─── EvalConfigSchema ─────────────────────────────────────────────────────────

describe("EvalConfigSchema", () => {
  it("accepts an empty config object (all fields optional)", () => {
    const result = EvalConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("uses correct defaults", () => {
    const result = EvalConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.judge_model).toBe("claude-opus-4-8");
      expect(result.data.results_dir).toBe("./results");
      expect(result.data.cache_enabled).toBe(true);
    }
  });

  it("rejects unknown provider value", () => {
    const result = EvalConfigSchema.safeParse({ default_provider: "grok" });
    expect(result.success).toBe(false);
  });

  it("accepts valid config", () => {
    const result = EvalConfigSchema.safeParse({
      default_provider: "openai",
      default_model: "gpt-4o-mini",
      judge_model: "claude-sonnet-4-6",
      results_dir: "./my-results",
      cache_enabled: false,
      anthropic_api_key: "sk-ant-test",
      openai_api_key: "sk-test",
    });
    expect(result.success).toBe(true);
  });
});
