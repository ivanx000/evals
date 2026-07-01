import { describe, it, expect } from "vitest";
import { gradeNumericTolerance } from "../../src/graders/numeric_tolerance.js";

describe("gradeNumericTolerance", () => {
  const criteria = (value: number, tolerance_pct = 2.0) => ({
    type: "numeric_tolerance" as const,
    value,
    tolerance_pct,
  });

  // ── Number extraction formats ─────────────────────────────────────────────

  it("extracts a bare number", () => {
    const r = gradeNumericTolerance("14.3", criteria(14.3));
    expect(r.passed).toBe(true);
  });

  it("extracts a number with trailing percent sign", () => {
    const r = gradeNumericTolerance("14.3%", criteria(14.3));
    expect(r.passed).toBe(true);
  });

  it("extracts a number with a leading dollar sign", () => {
    const r = gradeNumericTolerance("$14.3", criteria(14.3));
    expect(r.passed).toBe(true);
  });

  it("extracts a number from a free-text sentence", () => {
    const r = gradeNumericTolerance("The P/E ratio is approximately 14.3", criteria(14.3));
    expect(r.passed).toBe(true);
  });

  it("extracts the last number in a multi-number sentence", () => {
    // extractLastNumber picks the last numeric match
    const r = gradeNumericTolerance("Old value was 10, new value is 20", criteria(20));
    expect(r.passed).toBe(true);
  });

  it("handles comma-formatted large numbers", () => {
    const r = gradeNumericTolerance("Revenue was $1,200,000", criteria(1_200_000));
    expect(r.passed).toBe(true);
  });

  it("strips a trailing CONFIDENCE annotation before extracting", () => {
    const r = gradeNumericTolerance("ANSWER: 14.3 CONFIDENCE: 85", criteria(14.3));
    expect(r.passed).toBe(true);
  });

  // ── Tolerance boundary ────────────────────────────────────────────────────

  it("passes when extracted value is exactly equal to reference", () => {
    const r = gradeNumericTolerance("100", criteria(100));
    expect(r.passed).toBe(true);
  });

  it("passes when extracted value is within tolerance", () => {
    // 101 vs 100 = 1% error; tolerance = 2%
    const r = gradeNumericTolerance("101", criteria(100, 2));
    expect(r.passed).toBe(true);
  });

  it("fails when extracted value exceeds tolerance", () => {
    // 103 vs 100 = 3% error; tolerance = 2%
    const r = gradeNumericTolerance("103", criteria(100, 2));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("exceeds");
  });

  it("passes exactly at the tolerance boundary", () => {
    // 102 vs 100 = 2% error; tolerance = 2% — should pass (<=)
    const r = gradeNumericTolerance("102", criteria(100, 2));
    expect(r.passed).toBe(true);
  });

  it("handles a zero reference value without divide-by-zero", () => {
    const r = gradeNumericTolerance("0", criteria(0));
    expect(r.passed).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("handles negative reference values", () => {
    // -10 vs -10.1 = 1% relative error; tolerance = 2%
    const r = gradeNumericTolerance("-10.1", criteria(-10, 2));
    expect(r.passed).toBe(true);
  });

  // ── Failure cases ─────────────────────────────────────────────────────────

  it("fails when no numeric value is found in the output", () => {
    const r = gradeNumericTolerance("The answer is unknown", criteria(14.3));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("No numeric value");
    expect(r.error).toBeUndefined();
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeNumericTolerance(null, criteria(14.3));
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  // ── Result shape ──────────────────────────────────────────────────────────

  it("sets criteria_type to numeric_tolerance", () => {
    const r = gradeNumericTolerance("14.3", criteria(14.3));
    expect(r.criteria_type).toBe("numeric_tolerance");
  });

  it("includes tolerance info in detail for passing case", () => {
    const r = gradeNumericTolerance("14.3", criteria(14.3));
    expect(r.detail).toContain("within");
    expect(r.detail).toContain("tolerance");
  });
});
