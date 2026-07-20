import { describe, it, expect } from "vitest";
import { gradeJsonPath } from "../../src/graders/json_path.js";

const base = { type: "json_path" as const, extract_json: false };

describe("gradeJsonPath — equals", () => {
  it("passes for string equality", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ result: { label: "positive" } }),
      { ...base, path: "$.result.label", equals: "positive" }
    );
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("json_path");
    expect(r.detail).toContain("$.result.label");
    expect(r.error).toBeUndefined();
  });

  it("fails for string mismatch", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ result: { label: "negative" } }),
      { ...base, path: "$.result.label", equals: "positive" }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("negative");
    expect(r.detail).toContain("positive");
  });

  it("passes for numeric equality", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ count: 42 }),
      { ...base, path: "$.count", equals: 42 }
    );
    expect(r.passed).toBe(true);
  });

  it("passes for boolean equality", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ ok: true }),
      { ...base, path: "$.ok", equals: true }
    );
    expect(r.passed).toBe(true);
  });

  it("passes for null equality", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ val: null }),
      { ...base, path: "$.val", equals: null }
    );
    expect(r.passed).toBe(true);
  });

  it("does not coerce types — string '1' !== number 1", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ n: "1" }),
      { ...base, path: "$.n", equals: 1 }
    );
    expect(r.passed).toBe(false);
  });
});

describe("gradeJsonPath — gt / gte / lt / lte", () => {
  it("passes gt when value is greater", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ scores: [0.9] }),
      { ...base, path: "$.scores[0]", gt: 0.8 }
    );
    expect(r.passed).toBe(true);
    expect(r.detail).toContain(">");
  });

  it("fails gt when value equals threshold", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ scores: [0.8] }),
      { ...base, path: "$.scores[0]", gt: 0.8 }
    );
    expect(r.passed).toBe(false);
  });

  it("passes gte when value equals threshold", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ x: 5 }),
      { ...base, path: "$.x", gte: 5 }
    );
    expect(r.passed).toBe(true);
  });

  it("passes lt when value is less", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ x: 3 }),
      { ...base, path: "$.x", lt: 10 }
    );
    expect(r.passed).toBe(true);
  });

  it("passes lte when value equals threshold", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ x: 10 }),
      { ...base, path: "$.x", lte: 10 }
    );
    expect(r.passed).toBe(true);
  });

  it("fails numeric comparison when value is not a number", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ x: "high" }),
      { ...base, path: "$.x", gt: 5 }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("not a number");
    expect(r.error).toBeUndefined();
  });
});

describe("gradeJsonPath — contains", () => {
  it("passes array membership check", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ items: ["apple", "banana"] }),
      { ...base, path: "$.items", contains: "apple" }
    );
    expect(r.passed).toBe(true);
    expect(r.detail).toContain("contains");
  });

  it("fails when item not in array", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ items: ["banana", "cherry"] }),
      { ...base, path: "$.items", contains: "apple" }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("apple");
  });

  it("passes string substring check", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ msg: "hello world" }),
      { ...base, path: "$.msg", contains: "world" }
    );
    expect(r.passed).toBe(true);
  });

  it("fails string substring when not present", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ msg: "hello world" }),
      { ...base, path: "$.msg", contains: "foo" }
    );
    expect(r.passed).toBe(false);
  });

  it("fails contains on non-string non-array value", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ x: 42 }),
      { ...base, path: "$.x", contains: "4" }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("not a string or array");
  });
});

describe("gradeJsonPath — path resolution", () => {
  it("resolves nested path", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ a: { b: { c: "deep" } } }),
      { ...base, path: "$.a.b.c", equals: "deep" }
    );
    expect(r.passed).toBe(true);
  });

  it("resolves array index", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ arr: [10, 20, 30] }),
      { ...base, path: "$.arr[1]", equals: 20 }
    );
    expect(r.passed).toBe(true);
  });

  it("fails with detail when path not found", async () => {
    const r = await gradeJsonPath(
      JSON.stringify({ x: 1 }),
      { ...base, path: "$.missing", equals: "value" }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("not found");
    expect(r.error).toBeUndefined();
  });
});

describe("gradeJsonPath — extract_json", () => {
  it("strips ```json fences before parsing", async () => {
    const output = "```json\n{\"name\":\"Alice\"}\n```";
    const r = await gradeJsonPath(
      output,
      { ...base, path: "$.name", equals: "Alice", extract_json: true }
    );
    expect(r.passed).toBe(true);
  });

  it("strips generic fences before parsing", async () => {
    const output = "```\n{\"name\":\"Alice\"}\n```";
    const r = await gradeJsonPath(
      output,
      { ...base, path: "$.name", equals: "Alice", extract_json: true }
    );
    expect(r.passed).toBe(true);
  });

  it("works without fences when extract_json is true", async () => {
    const r = await gradeJsonPath(
      '{"name":"Alice"}',
      { ...base, path: "$.name", equals: "Alice", extract_json: true }
    );
    expect(r.passed).toBe(true);
  });

  it("fails with JSON parse error when fenced content is invalid", async () => {
    const output = "```json\nnot valid json\n```";
    const r = await gradeJsonPath(
      output,
      { ...base, path: "$.name", equals: "Alice", extract_json: true }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("JSON parse error");
  });
});

describe("gradeJsonPath — error handling", () => {
  it("returns error when output is not a string", async () => {
    // @ts-expect-error testing runtime safety
    const r = await gradeJsonPath(123, { ...base, path: "$.x", equals: 1 });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("returns parse error detail for invalid JSON", async () => {
    const r = await gradeJsonPath(
      "not json at all",
      { ...base, path: "$.x", equals: 1 }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("JSON parse error");
    expect(r.error).toBeUndefined();
  });
});
