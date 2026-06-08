import { describe, it, expect } from "vitest";
import { gradeMaxWords } from "../../src/graders/max_words.js";

describe("gradeMaxWords", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes when word count is under the limit", () => {
    const r = gradeMaxWords("Hello world", { type: "max_words", value: 10 });
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("max_words");
    expect(r.error).toBeUndefined();
  });

  it("passes when word count exactly equals the limit", () => {
    const r = gradeMaxWords("one two three four five", { type: "max_words", value: 5 });
    expect(r.passed).toBe(true);
    expect(r.detail).toContain("5 words");
  });

  it("fails when word count exceeds the limit", () => {
    const r = gradeMaxWords("one two three four five six", { type: "max_words", value: 5 });
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("6 words");
    expect(r.detail).toContain("limit: 5");
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("treats empty string as 0 words and passes any limit", () => {
    const r = gradeMaxWords("", { type: "max_words", value: 1 });
    expect(r.passed).toBe(true);
    expect(r.detail).toContain("0 words");
  });

  it("treats whitespace-only string as 0 words", () => {
    const r = gradeMaxWords("   \t\n   ", { type: "max_words", value: 1 });
    expect(r.passed).toBe(true);
    expect(r.detail).toContain("0 words");
  });

  it("splits on multiple consecutive whitespace characters", () => {
    const r = gradeMaxWords("hello   world", { type: "max_words", value: 2 });
    expect(r.passed).toBe(true);
    expect(r.detail).toContain("2 words");
  });

  it("splits on newlines and tabs as word separators", () => {
    const r = gradeMaxWords("hello\nworld\tthere", { type: "max_words", value: 3 });
    expect(r.passed).toBe(true);
    expect(r.detail).toContain("3 words");
  });

  it("counts a single word correctly", () => {
    const r = gradeMaxWords("Paris", { type: "max_words", value: 1 });
    expect(r.passed).toBe(true);
  });

  it("includes word count and limit in detail", () => {
    const r = gradeMaxWords("one two three", { type: "max_words", value: 10 });
    expect(r.detail).toContain("3 words");
    expect(r.detail).toContain("limit: 10");
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeMaxWords(42, { type: "max_words", value: 10 });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("returns pass=false and error when output is null", () => {
    // @ts-expect-error testing runtime safety
    const r = gradeMaxWords(null, { type: "max_words", value: 10 });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });
});
