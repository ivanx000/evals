import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getGrader,
  isRegistered,
  getRegisteredTypes,
  registerGrader,
} from "../../src/graders/registry.js";
import type { Grader } from "../../src/graders/types.js";

describe("grader registry", () => {
  // ── Built-in registrations ────────────────────────────────────────────────

  it("has all built-in graders registered", () => {
    const expected = [
      "exact_match",
      "contains",
      "max_words",
      "regex",
      "llm_judge",
      "code_execution",
      "numeric_tolerance",
      "calibration",
    ];
    for (const type of expected) {
      expect(isRegistered(type)).toBe(true);
    }
  });

  it("getRegisteredTypes returns all registered type strings", () => {
    const types = getRegisteredTypes();
    expect(types).toContain("exact_match");
    expect(types).toContain("calibration");
    expect(types).toContain("numeric_tolerance");
  });

  it("getGrader returns a Grader for a registered type", () => {
    const grader = getGrader("exact_match");
    expect(grader).toBeDefined();
    expect(grader?.type).toBe("exact_match");
    expect(typeof grader?.grade).toBe("function");
  });

  it("getGrader returns undefined for an unknown type", () => {
    expect(getGrader("totally_unknown_type_xyz")).toBeUndefined();
  });

  it("isRegistered returns false for an unknown type", () => {
    expect(isRegistered("not_a_real_grader")).toBe(false);
  });

  // ── Programmatic registration ─────────────────────────────────────────────

  it("allows registering a new custom grader", () => {
    const customGrader: Grader = {
      type: "test_custom_grader_xyz",
      async grade(output) {
        return {
          criteria_type: "test_custom_grader_xyz",
          passed: output.includes("pass"),
        };
      },
    };

    registerGrader(customGrader);
    expect(isRegistered("test_custom_grader_xyz")).toBe(true);

    const retrieved = getGrader("test_custom_grader_xyz");
    expect(retrieved).toBe(customGrader);
  });

  it("registered grader grade() is callable and returns correct result", async () => {
    const grader = getGrader("test_custom_grader_xyz");
    if (!grader) throw new Error("grader not found");

    const pass = await grader.grade("this should pass", {});
    expect(pass.passed).toBe(true);

    const fail = await grader.grade("this should fail", {});
    expect(fail.passed).toBe(false);
  });

  // ── Built-in grader delegation ────────────────────────────────────────────

  it("exact_match grader delegates to gradeExactMatch correctly", async () => {
    const grader = getGrader("exact_match")!;
    const r = await grader.grade("Paris", { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("exact_match");
  });

  it("contains grader delegates correctly", async () => {
    const grader = getGrader("contains")!;
    const r = await grader.grade("hello world", { type: "contains", value: "world", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  it("numeric_tolerance grader delegates correctly", async () => {
    const grader = getGrader("numeric_tolerance")!;
    const r = await grader.grade("14.3", { type: "numeric_tolerance", value: 14.3, tolerance_pct: 2 });
    expect(r.passed).toBe(true);
  });

  it("calibration grader delegates correctly", async () => {
    const grader = getGrader("calibration")!;
    const r = await grader.grade(
      "ANSWER: 14.3 CONFIDENCE: 80",
      { type: "calibration", expected: "14.3", case_sensitive: false }
    );
    expect(r.passed).toBe(true);
    expect(r.metadata?.confidence).toBe(80);
  });

  // ── Unknown grader type error path (via runGraders) ───────────────────────

  it("runGraders returns informative error for unknown grader type", async () => {
    vi.resetModules();
    vi.doMock("../../src/plugins.js", () => ({
      loadPlugins: vi.fn().mockResolvedValue(new Map()),
    }));

    const { runGraders, resetPluginCache } = await import("../../src/graders/index.js");
    resetPluginCache();

    const results = await runGraders("output", [
      { type: "nonexistent_grader_abc" } as unknown as import("../../src/types.js").Criteria,
    ]);

    expect(results[0].passed).toBe(false);
    expect(results[0].error).toContain("Unknown grader type");
    expect(results[0].error).toContain("nonexistent_grader_abc");
    expect(results[0].error).toContain("registerGrader");

    vi.resetModules();
  });
});
