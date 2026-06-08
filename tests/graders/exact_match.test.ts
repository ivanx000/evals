import { describe, it, expect } from "vitest";
import { gradeExactMatch } from "../../src/graders/exact_match.js";

describe("gradeExactMatch", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes when output exactly matches value (case-insensitive by default)", () => {
    const r = gradeExactMatch("Paris", { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("exact_match");
    expect(r.error).toBeUndefined();
  });

  it("passes case-insensitive match by default", () => {
    const r = gradeExactMatch("paris", { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  it("trims whitespace before comparing", () => {
    const r = gradeExactMatch("  Paris  ", { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  // ── Case sensitivity ────────────────────────────────────────────────────────

  it("fails when case_sensitive=true and casing differs", () => {
    const r = gradeExactMatch("paris", { type: "exact_match", value: "Paris", case_sensitive: true });
    expect(r.passed).toBe(false);
  });

  it("passes when case_sensitive=true and casing matches", () => {
    const r = gradeExactMatch("Paris", { type: "exact_match", value: "Paris", case_sensitive: true });
    expect(r.passed).toBe(true);
  });

  // ── Failure cases ───────────────────────────────────────────────────────────

  it("fails when output does not match", () => {
    const r = gradeExactMatch("London", { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("Expected");
    expect(r.detail).toContain("Paris");
  });

  it("truncates long output in detail message", () => {
    const longOutput = "A".repeat(100);
    const r = gradeExactMatch(longOutput, { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("…");
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("passes when both output and value are empty strings", () => {
    const r = gradeExactMatch("", { type: "exact_match", value: "", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  it("fails when output is empty but value is not", () => {
    const r = gradeExactMatch("", { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
  });

  it("passes with whitespace-only output vs empty value", () => {
    const r = gradeExactMatch("   ", { type: "exact_match", value: "", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeExactMatch(42, { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("returns pass=false and error when output is null", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeExactMatch(null, { type: "exact_match", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });
});
