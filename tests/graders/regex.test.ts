import { describe, it, expect } from "vitest";
import { gradeRegex } from "../../src/graders/regex.js";

describe("gradeRegex", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes when output matches the regex", () => {
    const r = gradeRegex("2024-01-15", { type: "regex", value: "^\\d{4}-\\d{2}-\\d{2}$", flags: "" });
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("regex");
    expect(r.error).toBeUndefined();
  });

  it("fails when output does not match", () => {
    const r = gradeRegex("not a date", { type: "regex", value: "^\\d{4}-\\d{2}-\\d{2}$", flags: "" });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("does not match");
  });

  // ── Flags ───────────────────────────────────────────────────────────────────

  it("respects case-insensitive flag", () => {
    const r = gradeRegex("HELLO WORLD", { type: "regex", value: "hello", flags: "i" });
    expect(r.passed).toBe(true);
  });

  it("is case-sensitive without the i flag", () => {
    const r = gradeRegex("HELLO WORLD", { type: "regex", value: "hello", flags: "" });
    expect(r.passed).toBe(false);
  });

  it("respects multiline flag for ^ and $", () => {
    const r = gradeRegex("line1\nline2", { type: "regex", value: "^line2$", flags: "m" });
    expect(r.passed).toBe(true);
  });

  it("matches anywhere in string without anchors", () => {
    const r = gradeRegex("some text with number 42 here", { type: "regex", value: "\\d+", flags: "" });
    expect(r.passed).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("passes empty string against a pattern that matches empty", () => {
    const r = gradeRegex("", { type: "regex", value: "^$", flags: "" });
    expect(r.passed).toBe(true);
  });

  it("fails empty string against non-empty pattern", () => {
    const r = gradeRegex("", { type: "regex", value: "\\w+", flags: "" });
    expect(r.passed).toBe(false);
  });

  it("includes the regex pattern in detail message", () => {
    const r = gradeRegex("hello", { type: "regex", value: "world", flags: "" });
    expect(r.detail).toContain("world");
  });

  // ── Invalid regex ───────────────────────────────────────────────────────────

  it("returns pass=false with error message for invalid regex", () => {
    const r = gradeRegex("anything", { type: "regex", value: "[invalid", flags: "" });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
    expect(r.error).toContain("Invalid regex");
  });

  it("returns pass=false with error for invalid flags", () => {
    const r = gradeRegex("test", { type: "regex", value: "test", flags: "z" });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeRegex(42, { type: "regex", value: "\\d+", flags: "" });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });
});
