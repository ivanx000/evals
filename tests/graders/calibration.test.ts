import { describe, it, expect } from "vitest";
import { gradeCalibration } from "../../src/graders/calibration.js";

describe("gradeCalibration", () => {
  const criteria = (expected: string, case_sensitive = false) => ({
    type: "calibration" as const,
    expected,
    case_sensitive,
  });

  // ── Happy path — correct answer with confidence ───────────────────────────

  it("passes when ANSWER matches expected", () => {
    const r = gradeCalibration("ANSWER: 14.3 CONFIDENCE: 85", criteria("14.3"));
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("calibration");
    expect(r.error).toBeUndefined();
  });

  it("records confidence in metadata", () => {
    const r = gradeCalibration("ANSWER: 14.3 CONFIDENCE: 85", criteria("14.3"));
    expect(r.metadata?.confidence).toBe(85);
  });

  it("records correct:true in metadata when answer matches", () => {
    const r = gradeCalibration("ANSWER: 14.3 CONFIDENCE: 85", criteria("14.3"));
    expect(r.metadata?.correct).toBe(true);
  });

  it("records correct:false in metadata when answer does not match", () => {
    const r = gradeCalibration("ANSWER: 20.0 CONFIDENCE: 60", criteria("14.3"));
    expect(r.metadata?.correct).toBe(false);
  });

  // ── Case sensitivity ──────────────────────────────────────────────────────

  it("compares case-insensitively by default", () => {
    const r = gradeCalibration("ANSWER: Paris CONFIDENCE: 90", criteria("paris"));
    expect(r.passed).toBe(true);
  });

  it("fails when case_sensitive=true and casing differs", () => {
    const r = gradeCalibration("ANSWER: Paris CONFIDENCE: 90", criteria("paris", true));
    expect(r.passed).toBe(false);
  });

  it("passes when case_sensitive=true and casing matches", () => {
    const r = gradeCalibration("ANSWER: paris CONFIDENCE: 90", criteria("paris", true));
    expect(r.passed).toBe(true);
  });

  // ── Parsing variants ──────────────────────────────────────────────────────

  it("parses ANSWER/CONFIDENCE regardless of surrounding text", () => {
    const output = "After careful analysis, ANSWER: 42 CONFIDENCE: 75 based on the data.";
    const r = gradeCalibration(output, criteria("42"));
    expect(r.passed).toBe(true);
    expect(r.metadata?.confidence).toBe(75);
  });

  it("parses ANSWER even when CONFIDENCE is absent", () => {
    const r = gradeCalibration("ANSWER: 14.3", criteria("14.3"));
    expect(r.passed).toBe(true);
    expect(r.metadata?.confidence).toBeNull();
  });

  it("clamps confidence above 100 to 100", () => {
    const r = gradeCalibration("ANSWER: x CONFIDENCE: 150", criteria("x"));
    expect(r.metadata?.confidence).toBe(100);
  });

  it("clamps confidence below 0 to 0", () => {
    const r = gradeCalibration("ANSWER: x CONFIDENCE: -10", criteria("x"));
    expect(r.metadata?.confidence).toBe(0);
  });

  it("parses ANSWER and CONFIDENCE case-insensitively in the output format", () => {
    const r = gradeCalibration("answer: 14.3 confidence: 80", criteria("14.3"));
    expect(r.passed).toBe(true);
    expect(r.metadata?.confidence).toBe(80);
  });

  // ── Failure cases ─────────────────────────────────────────────────────────

  it("fails when ANSWER does not match expected", () => {
    const r = gradeCalibration("ANSWER: 99 CONFIDENCE: 50", criteria("14.3"));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("does not match");
  });

  it("fails when no ANSWER: field is found", () => {
    const r = gradeCalibration("The ratio is approximately 14.3", criteria("14.3"));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("No ANSWER:");
    expect(r.error).toBeUndefined();
  });

  // ── Metadata stored even on failure ──────────────────────────────────────

  it("stores answer and expected in metadata even on failure", () => {
    const r = gradeCalibration("ANSWER: 99 CONFIDENCE: 50", criteria("14.3"));
    expect(r.metadata?.answer).toBe("99");
    expect(r.metadata?.expected).toBe("14.3");
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeCalibration(null, criteria("14.3"));
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  // ── Detail message ────────────────────────────────────────────────────────

  it("includes confidence in the detail message when present", () => {
    const r = gradeCalibration("ANSWER: 14.3 CONFIDENCE: 85", criteria("14.3"));
    expect(r.detail).toContain("confidence: 85%");
  });

  it("omits confidence from detail when absent", () => {
    const r = gradeCalibration("ANSWER: 14.3", criteria("14.3"));
    expect(r.detail).not.toContain("confidence:");
  });
});
