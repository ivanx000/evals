import { describe, it, expect } from "vitest";
import { gradeJsonSchema } from "../../src/graders/json_schema.js";

const personSchema = {
  type: "object",
  required: ["name", "age"],
  properties: {
    name: { type: "string" },
    age: { type: "integer", minimum: 0 },
  },
  additionalProperties: false,
};

describe("gradeJsonSchema", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes for valid JSON matching the schema", async () => {
    const r = await gradeJsonSchema(
      JSON.stringify({ name: "Alice", age: 30 }),
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(true);
    expect(r.criteria_type).toBe("json_schema");
    expect(r.detail).toBe("JSON valid, schema matched");
    expect(r.error).toBeUndefined();
  });

  it("passes for valid JSON array schema", async () => {
    const r = await gradeJsonSchema(
      "[1, 2, 3]",
      { type: "json_schema", schema: { type: "array", items: { type: "integer" } }, extract_json: false }
    );
    expect(r.passed).toBe(true);
  });

  // ── Schema violations ───────────────────────────────────────────────────────

  it("fails when a required field is missing", async () => {
    const r = await gradeJsonSchema(
      JSON.stringify({ name: "Bob" }),
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("Schema violations");
    expect(r.detail).toContain("age");
  });

  it("fails when a field has the wrong type", async () => {
    const r = await gradeJsonSchema(
      JSON.stringify({ name: "Bob", age: "thirty" }),
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("Schema violations");
  });

  it("fails when minimum constraint is violated", async () => {
    const r = await gradeJsonSchema(
      JSON.stringify({ name: "Bob", age: -1 }),
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("Schema violations");
  });

  it("fails when additionalProperties is violated", async () => {
    const r = await gradeJsonSchema(
      JSON.stringify({ name: "Bob", age: 25, extra: true }),
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("Schema violations");
  });

  // ── JSON parse errors ───────────────────────────────────────────────────────

  it("fails with detail when output is not valid JSON", async () => {
    const r = await gradeJsonSchema(
      "This is plain text, not JSON.",
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("JSON parse error");
    expect(r.error).toBeUndefined();
  });

  it("fails with detail for truncated JSON", async () => {
    const r = await gradeJsonSchema(
      '{ "name": "Alice"',
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("JSON parse error");
  });

  // ── extract_json mode ───────────────────────────────────────────────────────

  it("extracts JSON from ```json fences when extract_json is true", async () => {
    const output = "Here is the result:\n```json\n{\"name\":\"Alice\",\"age\":30}\n```\nDone.";
    const r = await gradeJsonSchema(
      output,
      { type: "json_schema", schema: personSchema, extract_json: true }
    );
    expect(r.passed).toBe(true);
  });

  it("extracts JSON from generic ``` fences when extract_json is true", async () => {
    const output = "```\n{\"name\":\"Alice\",\"age\":30}\n```";
    const r = await gradeJsonSchema(
      output,
      { type: "json_schema", schema: personSchema, extract_json: true }
    );
    expect(r.passed).toBe(true);
  });

  it("falls back to raw output when no fence present and extract_json is true", async () => {
    const r = await gradeJsonSchema(
      '{"name":"Alice","age":30}',
      { type: "json_schema", schema: personSchema, extract_json: true }
    );
    expect(r.passed).toBe(true);
  });

  it("fails when fenced content is invalid JSON with extract_json true", async () => {
    const output = "```json\nnot valid json\n```";
    const r = await gradeJsonSchema(
      output,
      { type: "json_schema", schema: personSchema, extract_json: true }
    );
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("JSON parse error");
  });

  it("ignores markdown fences when extract_json is false", async () => {
    const output = "```json\n{\"name\":\"Alice\",\"age\":30}\n```";
    const r = await gradeJsonSchema(
      output,
      { type: "json_schema", schema: personSchema, extract_json: false }
    );
    // The full string including fences is not valid JSON
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("JSON parse error");
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns pass=false and error when output is not a string", async () => {
    // @ts-expect-error testing runtime safety
    const r = await gradeJsonSchema(123, { type: "json_schema", schema: personSchema, extract_json: false });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("returns pass=false and error when output is undefined", async () => {
    // @ts-expect-error testing runtime safety
    const r = await gradeJsonSchema(undefined, { type: "json_schema", schema: personSchema, extract_json: false });
    expect(r.passed).toBe(false);
    expect(r.error).toBeDefined();
  });
});
