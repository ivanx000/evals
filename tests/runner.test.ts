import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── Mock providers so no real API calls are made ─────────────────────────────

const mockAnthropicCall = vi.fn();
const mockOpenAICall = vi.fn();
const mockOllamaCall = vi.fn();

vi.mock("../src/providers/anthropic.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    call: mockAnthropicCall,
  })),
}));

vi.mock("../src/providers/openai.js", () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    call: mockOpenAICall,
  })),
}));

vi.mock("../src/providers/ollama.js", () => ({
  OllamaProvider: vi.fn().mockImplementation(() => ({
    call: mockOllamaCall,
  })),
}));

// ─── Mock cache so tests are deterministic ────────────────────────────────────

vi.mock("../src/cache.js", () => ({
  cacheGet: vi.fn().mockReturnValue(null),
  cacheSet: vi.fn(),
}));

import { runSuite, loadSuite } from "../src/runner.js";
import type { EvalSuite, EvalConfig } from "../src/types.js";

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

function makeDefaultResponse(output = "test output") {
  return {
    output,
    input_tokens: 10,
    output_tokens: 5,
    cost_usd: 0.0001,
  };
}

function writeTempYaml(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-test-"));
  const filePath = path.join(tmpDir, "suite.yaml");
  fs.writeFileSync(filePath, content);
  return filePath;
}

// ─── loadSuite tests ──────────────────────────────────────────────────────────

describe("loadSuite", () => {
  it("loads a valid suite YAML file", () => {
    const yaml = `
name: Test Suite
provider: anthropic
model: claude-haiku-4-5
cases:
  - id: test-case
    prompt: "Hello"
    criteria:
      - type: contains
        value: "hello"
`;
    const filePath = writeTempYaml(yaml);
    const suite = loadSuite(filePath);
    expect(suite.name).toBe("Test Suite");
    expect(suite.cases).toHaveLength(1);
    expect(suite.cases[0].id).toBe("test-case");
  });

  it("throws a clear error when the file does not exist", () => {
    expect(() => loadSuite("/nonexistent/path/suite.yaml")).toThrow(
      /Cannot read suite file/
    );
  });

  it("throws a clear error for invalid YAML syntax", () => {
    const filePath = writeTempYaml("name: [\ninvalid yaml here}}}");
    expect(() => loadSuite(filePath)).toThrow(/Invalid YAML/);
  });

  it("throws with field-level details for a missing required field", () => {
    const yaml = `
provider: anthropic
cases:
  - prompt: "Hello"
    criteria:
      - type: contains
        value: "hi"
`;
    const filePath = writeTempYaml(yaml);
    expect(() => loadSuite(filePath)).toThrow(/Suite validation failed/);
    // Should mention the missing field
    try {
      loadSuite(filePath);
    } catch (e) {
      expect((e as Error).message).toContain("name");
    }
  });

  it("throws with field-level details for an invalid provider value", () => {
    const yaml = `
name: Test
provider: invalid_provider
cases:
  - prompt: "Hello"
    criteria:
      - type: contains
        value: "hi"
`;
    const filePath = writeTempYaml(yaml);
    try {
      loadSuite(filePath);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("Suite validation failed");
    }
  });

  it("throws when cases array is empty", () => {
    const yaml = `
name: Test
cases: []
`;
    const filePath = writeTempYaml(yaml);
    try {
      loadSuite(filePath);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("Suite validation failed");
    }
  });
});

// ─── runSuite tests ───────────────────────────────────────────────────────────

describe("runSuite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse());
  });

  const simpleSuite: EvalSuite = {
    name: "Simple Test",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    max_tokens: 256,
    cases: [
      {
        id: "case-1",
        prompt: "Say hello",
        criteria: [{ type: "contains", value: "test", case_sensitive: false }],
        tags: [],
      },
    ],
  };

  it("returns a RunResult with correct structure", async () => {
    const result = await runSuite(simpleSuite, makeConfig());
    expect(result.suite_name).toBe("Simple Test");
    expect(result.total).toBe(1);
    expect(result.cases).toHaveLength(1);
    expect(result.run_id).toBeTruthy();
    expect(result.timestamp).toBeTruthy();
  });

  it("marks a case as passed when all criteria pass", async () => {
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("test output contains test"));
    const result = await runSuite(simpleSuite, makeConfig());
    expect(result.cases[0].passed).toBe(true);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("marks a case as failed when criteria do not pass", async () => {
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("no matching content"));
    const result = await runSuite(simpleSuite, makeConfig());
    expect(result.cases[0].passed).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("marks a case as failed and sets error when provider throws", async () => {
    mockAnthropicCall.mockRejectedValue(new Error("API error"));
    const result = await runSuite(simpleSuite, makeConfig());
    expect(result.cases[0].passed).toBe(false);
    expect(result.cases[0].error).toContain("API error");
    expect(result.failed).toBe(1);
  });

  it("tracks latency_ms in case results", async () => {
    const result = await runSuite(simpleSuite, makeConfig());
    expect(result.cases[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("aggregates cost across cases", async () => {
    const twoCase: EvalSuite = {
      ...simpleSuite,
      cases: [
        { ...simpleSuite.cases[0], id: "case-1" },
        { ...simpleSuite.cases[0], id: "case-2" },
      ],
    };
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("test output"));
    const result = await runSuite(twoCase, makeConfig());
    expect(result.total_cost_usd).toBeCloseTo(0.0002, 6);
    expect(result.total).toBe(2);
  });

  it("calls onCaseResult callback for each case", async () => {
    const cb = vi.fn();
    await runSuite(simpleSuite, makeConfig(), { onCaseResult: cb });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.any(Object), 0, 1);
  });

  // ── Filter ─────────────────────────────────────────────────────────────────

  it("filters cases by ID substring", async () => {
    const multiCase: EvalSuite = {
      ...simpleSuite,
      cases: [
        { id: "summarization-1", prompt: "A", criteria: [{ type: "max_words", value: 100 }], tags: [] },
        { id: "translation-1", prompt: "B", criteria: [{ type: "max_words", value: 100 }], tags: [] },
        { id: "summarization-2", prompt: "C", criteria: [{ type: "max_words", value: 100 }], tags: [] },
      ],
    };
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("output"));
    const result = await runSuite(multiCase, makeConfig(), { filter: "summarization" });
    expect(result.total).toBe(2);
    expect(result.cases.map((c) => c.case_id)).toEqual(["summarization-1", "summarization-2"]);
  });

  it("filters cases by tag substring", async () => {
    const taggedSuite: EvalSuite = {
      ...simpleSuite,
      cases: [
        { id: "case-a", prompt: "A", criteria: [{ type: "max_words", value: 100 }], tags: ["fast", "smoke"] },
        { id: "case-b", prompt: "B", criteria: [{ type: "max_words", value: 100 }], tags: ["slow"] },
      ],
    };
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("output"));
    const result = await runSuite(taggedSuite, makeConfig(), { filter: "smoke" });
    expect(result.total).toBe(1);
    expect(result.cases[0].case_id).toBe("case-a");
  });

  it("returns zero cases when filter matches nothing", async () => {
    const result = await runSuite(simpleSuite, makeConfig(), { filter: "nonexistent-xyz" });
    expect(result.total).toBe(0);
    expect(result.cases).toHaveLength(0);
  });

  // ── Timeout ────────────────────────────────────────────────────────────────

  it("marks a case as failed with timeout error when it exceeds the timeout", async () => {
    // Simulate a slow API call that never resolves within the timeout
    mockAnthropicCall.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(makeDefaultResponse()), 5000))
    );

    const result = await runSuite(simpleSuite, makeConfig(), { timeout: 50 });
    expect(result.cases[0].passed).toBe(false);
    expect(result.cases[0].error).toContain("Timeout");
    expect(result.cases[0].error).toContain("50ms");
  }, 3000);

  // ── Concurrency ────────────────────────────────────────────────────────────

  it("runs with concurrency=1 (default) sequentially and returns all results", async () => {
    const threeCase: EvalSuite = {
      ...simpleSuite,
      cases: [
        { id: "c1", prompt: "A", criteria: [{ type: "max_words", value: 100 }], tags: [] },
        { id: "c2", prompt: "B", criteria: [{ type: "max_words", value: 100 }], tags: [] },
        { id: "c3", prompt: "C", criteria: [{ type: "max_words", value: 100 }], tags: [] },
      ],
    };
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("output"));
    const result = await runSuite(threeCase, makeConfig(), { concurrency: 1 });
    expect(result.total).toBe(3);
    expect(result.cases.map((c) => c.case_id)).toEqual(["c1", "c2", "c3"]);
  });

  it("runs with concurrency=3 and still returns results in input order", async () => {
    const threeCase: EvalSuite = {
      ...simpleSuite,
      cases: [
        { id: "c1", prompt: "A", criteria: [{ type: "max_words", value: 100 }], tags: [] },
        { id: "c2", prompt: "B", criteria: [{ type: "max_words", value: 100 }], tags: [] },
        { id: "c3", prompt: "C", criteria: [{ type: "max_words", value: 100 }], tags: [] },
      ],
    };
    mockAnthropicCall.mockResolvedValue(makeDefaultResponse("output"));
    const result = await runSuite(threeCase, makeConfig(), { concurrency: 3 });
    expect(result.total).toBe(3);
    expect(result.cases.map((c) => c.case_id)).toEqual(["c1", "c2", "c3"]);
  });

  // ── pass_rate ──────────────────────────────────────────────────────────────

  it("computes pass_rate correctly", async () => {
    const twoCase: EvalSuite = {
      ...simpleSuite,
      cases: [
        { id: "pass", prompt: "A", criteria: [{ type: "contains", value: "yes", case_sensitive: false }], tags: [] },
        { id: "fail", prompt: "B", criteria: [{ type: "contains", value: "yes", case_sensitive: false }], tags: [] },
      ],
    };
    mockAnthropicCall
      .mockResolvedValueOnce(makeDefaultResponse("yes it works"))
      .mockResolvedValueOnce(makeDefaultResponse("no it does not"));
    const result = await runSuite(twoCase, makeConfig());
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.pass_rate).toBeCloseTo(0.5);
  });
});
