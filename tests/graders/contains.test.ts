import { describe, it, expect } from "vitest";
import { gradeContains } from "../../src/graders/contains.js";

describe("gradeContains", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes when output contains the value", () => {
    const r = gradeContains("The capital of France is Paris.", {
      type: "contains",
      value: "Paris",
      case_sensitive: false,
    });
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("contains");
    expect(r.error).toBeUndefined();
  });

  it("is case-insensitive by default", () => {
    const r = gradeContains("The capital is paris.", {
      type: "contains",
      value: "Paris",
      case_sensitive: false,
    });
    expect(r.passed).toBe(true);
  });

  // ── Case sensitivity ────────────────────────────────────────────────────────

  it("fails case-sensitive search when casing differs", () => {
    const r = gradeContains("The capital is paris.", {
      type: "contains",
      value: "Paris",
      case_sensitive: true,
    });
    expect(r.passed).toBe(false);
  });

  it("passes case-sensitive search when casing matches", () => {
    const r = gradeContains("The capital is Paris.", {
      type: "contains",
      value: "Paris",
      case_sensitive: true,
    });
    expect(r.passed).toBe(true);
  });

  // ── Failure cases ───────────────────────────────────────────────────────────

  it("fails when value is not in output", () => {
    const r = gradeContains("London is the capital of England.", {
      type: "contains",
      value: "Paris",
      case_sensitive: false,
    });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("does not contain");
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("passes when searching for empty string (always found)", () => {
    const r = gradeContains("anything", { type: "contains", value: "", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  it("passes when both output and value are empty", () => {
    const r = gradeContains("", { type: "contains", value: "", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  it("fails when output is empty and value is non-empty", () => {
    const r = gradeContains("", { type: "contains", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
  });

  it("handles substring at the very start", () => {
    const r = gradeContains("Paris is a city", { type: "contains", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  it("handles substring at the very end", () => {
    const r = gradeContains("The city is Paris", { type: "contains", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(true);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeContains(123, { type: "contains", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("returns pass=false and error when output is undefined", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeContains(undefined, { type: "contains", value: "Paris", case_sensitive: false });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });
});
