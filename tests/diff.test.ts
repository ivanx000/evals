import { describe, it, expect } from "vitest";
import { computeDiff } from "../src/diff.js";
import type { RunResult, CaseResult } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCase(
  id: string,
  graders: Array<{ type: string; passed: boolean }>
): CaseResult {
  return {
    case_id: id,
    prompt: `prompt for ${id}`,
    model: "claude-haiku-4-5",
    provider: "anthropic",
    output: "output",
    grader_results: graders.map((g) => ({
      criteria_type: g.type,
      passed: g.passed,
    })),
    passed: graders.every((g) => g.passed),
    latency_ms: 100,
    cached: false,
  };
}

function makeRun(id: string, cases: CaseResult[]): RunResult {
  const passed = cases.filter((c) => c.passed).length;
  return {
    suite_name: "Test Suite",
    run_id: id,
    timestamp: new Date().toISOString(),
    model: "claude-haiku-4-5",
    provider: "anthropic",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    pass_rate: cases.length > 0 ? passed / cases.length : 0,
    total_cost_usd: 0,
    total_latency_ms: 100 * cases.length,
    cases,
  };
}

// ─── computeDiff ──────────────────────────────────────────────────────────────

describe("computeDiff", () => {
  it("returns empty diff for identical runs", () => {
    const cases = [makeCase("c1", [{ type: "contains", passed: true }])];
    const baseline = makeRun("run-a", cases);
    const candidate = makeRun("run-b", cases);
    const diff = computeDiff(baseline, candidate);
    expect(diff.regressions).toHaveLength(0);
    expect(diff.improvements).toHaveLength(0);
    expect(diff.unchanged_count).toBe(1);
    expect(diff.removed_cases).toHaveLength(0);
    expect(diff.added_cases).toHaveLength(0);
  });

  it("detects a regression (pass → fail)", () => {
    const baseline = makeRun("run-a", [
      makeCase("c1", [{ type: "contains", passed: true }]),
    ]);
    const candidate = makeRun("run-b", [
      makeCase("c1", [{ type: "contains", passed: false }]),
    ]);
    const diff = computeDiff(baseline, candidate);
    expect(diff.regressions).toHaveLength(1);
    expect(diff.regressions[0].case_id).toBe("c1");
    expect(diff.regressions[0].criteria_type).toBe("contains");
    expect(diff.regressions[0].baseline_passed).toBe(true);
    expect(diff.regressions[0].candidate_passed).toBe(false);
    expect(diff.regressions[0].status).toBe("regression");
    expect(diff.improvements).toHaveLength(0);
  });

  it("detects an improvement (fail → pass)", () => {
    const baseline = makeRun("run-a", [
      makeCase("c1", [{ type: "regex", passed: false }]),
    ]);
    const candidate = makeRun("run-b", [
      makeCase("c1", [{ type: "regex", passed: true }]),
    ]);
    const diff = computeDiff(baseline, candidate);
    expect(diff.improvements).toHaveLength(1);
    expect(diff.improvements[0].case_id).toBe("c1");
    expect(diff.improvements[0].status).toBe("improvement");
    expect(diff.regressions).toHaveLength(0);
  });

  it("detects multiple regressions across multiple cases", () => {
    const baseline = makeRun("run-a", [
      makeCase("c1", [{ type: "contains", passed: true }]),
      makeCase("c2", [{ type: "max_words", passed: true }]),
      makeCase("c3", [{ type: "regex", passed: true }]),
    ]);
    const candidate = makeRun("run-b", [
      makeCase("c1", [{ type: "contains", passed: false }]),
      makeCase("c2", [{ type: "max_words", passed: false }]),
      makeCase("c3", [{ type: "regex", passed: true }]),  // unchanged
    ]);
    const diff = computeDiff(baseline, candidate);
    expect(diff.regressions).toHaveLength(2);
    expect(diff.unchanged_count).toBe(1);
  });

  it("handles per-grader breakdown within one case", () => {
    const baseline = makeRun("run-a", [
      makeCase("c1", [
        { type: "contains", passed: true },
        { type: "max_words", passed: true },
      ]),
    ]);
    const candidate = makeRun("run-b", [
      makeCase("c1", [
        { type: "contains", passed: false },  // regression
        { type: "max_words", passed: true },  // unchanged
      ]),
    ]);
    const diff = computeDiff(baseline, candidate);
    expect(diff.regressions).toHaveLength(1);
    expect(diff.regressions[0].criteria_type).toBe("contains");
    expect(diff.unchanged_count).toBe(1);
  });

  it("flags cases removed in candidate", () => {
    const baseline = makeRun("run-a", [
      makeCase("c1", [{ type: "contains", passed: true }]),
      makeCase("c2", [{ type: "contains", passed: true }]),
    ]);
    const candidate = makeRun("run-b", [
      makeCase("c1", [{ type: "contains", passed: true }]),
    ]);
    const diff = computeDiff(baseline, candidate);
    expect(diff.removed_cases).toContain("c2");
    expect(diff.regressions).toHaveLength(0);
  });

  it("flags cases added in candidate", () => {
    const baseline = makeRun("run-a", [
      makeCase("c1", [{ type: "contains", passed: true }]),
    ]);
    const candidate = makeRun("run-b", [
      makeCase("c1", [{ type: "contains", passed: true }]),
      makeCase("c-new", [{ type: "contains", passed: true }]),
    ]);
    const diff = computeDiff(baseline, candidate);
    expect(diff.added_cases).toContain("c-new");
  });

  it("sets correct run IDs on the diff result", () => {
    const baseline = makeRun("baseline-uuid", []);
    const candidate = makeRun("candidate-uuid", []);
    const diff = computeDiff(baseline, candidate);
    expect(diff.baseline_run_id).toBe("baseline-uuid");
    expect(diff.candidate_run_id).toBe("candidate-uuid");
  });

  it("handles empty runs without error", () => {
    const baseline = makeRun("run-a", []);
    const candidate = makeRun("run-b", []);
    const diff = computeDiff(baseline, candidate);
    expect(diff.regressions).toHaveLength(0);
    expect(diff.improvements).toHaveLength(0);
    expect(diff.unchanged_count).toBe(0);
  });

  it("counts unchanged correctly when all pass in both", () => {
    const cases = [
      makeCase("c1", [{ type: "contains", passed: true }, { type: "max_words", passed: true }]),
      makeCase("c2", [{ type: "regex", passed: false }]),
    ];
    const baseline = makeRun("run-a", cases);
    const candidate = makeRun("run-b", cases);
    const diff = computeDiff(baseline, candidate);
    // 2 graders in c1 + 1 grader in c2 = 3 unchanged
    expect(diff.unchanged_count).toBe(3);
    expect(diff.regressions).toHaveLength(0);
  });
});
