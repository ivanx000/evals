import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { substituteTemplate, loadDatasetRows, expandDataset } from "../src/dataset.js";
import type { EvalCase } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeTempJsonl(lines: object[]): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-dataset-test-"));
  const filePath = path.join(tmpDir, "data.jsonl");
  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return filePath;
}

function makeTemplate(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: undefined,
    prompt: "Summarize: {{text}}",
    criteria: [{ type: "contains", value: "{{expected_keyword}}", case_sensitive: false }],
    tags: [],
    ...overrides,
  };
}

// ─── substituteTemplate ───────────────────────────────────────────────────────

describe("substituteTemplate", () => {
  it("substitutes {{variable}} in prompt", () => {
    const tpl = makeTemplate({ prompt: "Hello, {{name}}!" });
    const result = substituteTemplate(tpl, { name: "Ivan" });
    expect(result.prompt).toBe("Hello, Ivan!");
  });

  it("substitutes {{variable}} in criteria value", () => {
    const tpl = makeTemplate({
      criteria: [{ type: "contains", value: "{{keyword}}", case_sensitive: false }],
    });
    const result = substituteTemplate(tpl, { keyword: "Paris" });
    expect((result.criteria[0] as { value: string }).value).toBe("Paris");
  });

  it("substitutes multiple occurrences of the same variable", () => {
    const tpl = makeTemplate({ prompt: "{{city}} is a city. Visit {{city}}." });
    const result = substituteTemplate(tpl, { city: "London" });
    expect(result.prompt).toBe("London is a city. Visit London.");
  });

  it("substitutes multiple different variables", () => {
    const tpl = makeTemplate({ prompt: "{{greeting}}, {{name}}!" });
    const result = substituteTemplate(tpl, { greeting: "Hello", name: "Alice" });
    expect(result.prompt).toBe("Hello, Alice!");
  });

  it("leaves {{variable}} intact when key is missing from row", () => {
    const tpl = makeTemplate({ prompt: "Hello, {{missing}}!" });
    const result = substituteTemplate(tpl, {});
    expect(result.prompt).toBe("Hello, {{missing}}!");
  });

  it("handles values that contain JSON special characters", () => {
    const tpl = makeTemplate({ prompt: 'Text: {{text}}' });
    const result = substituteTemplate(tpl, { text: 'He said "hello"' });
    expect(result.prompt).toBe('Text: He said "hello"');
  });

  it("handles newlines in substituted values", () => {
    const tpl = makeTemplate({ prompt: "Content: {{body}}" });
    const result = substituteTemplate(tpl, { body: "line1\nline2" });
    expect(result.prompt).toBe("Content: line1\nline2");
  });

  it("converts numeric values to strings", () => {
    const tpl = makeTemplate({ prompt: "Count: {{n}}" });
    const result = substituteTemplate(tpl, { n: 42 });
    expect(result.prompt).toBe("Count: 42");
  });

  it("does not mutate the original template", () => {
    const tpl = makeTemplate({ prompt: "Hello, {{name}}!" });
    const original = JSON.stringify(tpl);
    substituteTemplate(tpl, { name: "Ivan" });
    expect(JSON.stringify(tpl)).toBe(original);
  });
});

// ─── loadDatasetRows ──────────────────────────────────────────────────────────

describe("loadDatasetRows", () => {
  it("loads all rows from a .jsonl file", async () => {
    const file = writeTempJsonl([{ a: 1 }, { a: 2 }, { a: 3 }]);
    const rows = await loadDatasetRows(file);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ a: 1 });
  });

  it("skips blank lines", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-dataset-blank-"));
    const filePath = path.join(dir, "data.jsonl");
    fs.writeFileSync(filePath, '{"a":1}\n\n{"a":2}\n\n');
    const rows = await loadDatasetRows(filePath);
    expect(rows).toHaveLength(2);
  });

  it("applies dataset_limit", async () => {
    const file = writeTempJsonl([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }]);
    const rows = await loadDatasetRows(file, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.a)).toEqual([1, 2, 3]);
  });

  it("applies dataset_sample (returns N rows, random subset)", async () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ i }));
    const file = writeTempJsonl(data);
    const rows = await loadDatasetRows(file, undefined, 10);
    expect(rows).toHaveLength(10);
  });

  it("returns all rows when sample >= total rows", async () => {
    const file = writeTempJsonl([{ a: 1 }, { a: 2 }]);
    const rows = await loadDatasetRows(file, undefined, 100);
    expect(rows).toHaveLength(2);
  });

  it("throws a clear error for a non-existent file", async () => {
    await expect(loadDatasetRows("/nonexistent/data.jsonl")).rejects.toThrow(
      /Cannot read dataset file/
    );
  });

  it("throws a clear error for invalid JSON on a line", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-dataset-bad-"));
    const filePath = path.join(dir, "data.jsonl");
    fs.writeFileSync(filePath, '{"valid": true}\nnot-json\n');
    await expect(loadDatasetRows(filePath)).rejects.toThrow(/Invalid JSON on line 2/);
  });

  it("throws a clear error when a line is a JSON array instead of object", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-dataset-arr-"));
    const filePath = path.join(dir, "data.jsonl");
    fs.writeFileSync(filePath, "[1,2,3]\n");
    await expect(loadDatasetRows(filePath)).rejects.toThrow(/not a JSON object/);
  });
});

// ─── expandDataset ────────────────────────────────────────────────────────────

describe("expandDataset", () => {
  it("expands a single template across all rows", async () => {
    const file = writeTempJsonl([
      { text: "The sky is blue.", keyword: "sky" },
      { text: "The sea is deep.", keyword: "sea" },
    ]);
    const template = makeTemplate({ prompt: "Summarize: {{text}}" });
    const cases = await expandDataset([template], file);
    expect(cases).toHaveLength(2);
    expect(cases[0].prompt).toBe("Summarize: The sky is blue.");
    expect(cases[1].prompt).toBe("Summarize: The sea is deep.");
  });

  it("auto-assigns IDs based on row index", async () => {
    const file = writeTempJsonl([{ text: "row1" }, { text: "row2" }]);
    const template = makeTemplate({ prompt: "{{text}}" });
    const cases = await expandDataset([template], file);
    expect(cases[0].id).toContain("row1");
    expect(cases[1].id).toContain("row2");
  });

  it("preserves ID from template and appends row index", async () => {
    const file = writeTempJsonl([{ text: "row1" }, { text: "row2" }]);
    const template = makeTemplate({ id: "my-template", prompt: "{{text}}" });
    const cases = await expandDataset([template], file);
    expect(cases[0].id).toBe("my-template-row1");
    expect(cases[1].id).toBe("my-template-row2");
  });

  it("respects limit passed to expandDataset", async () => {
    const file = writeTempJsonl(Array.from({ length: 10 }, (_, i) => ({ i })));
    const template = makeTemplate({ prompt: "{{i}}" });
    const cases = await expandDataset([template], file, 3);
    expect(cases).toHaveLength(3);
  });

  it("handles multiple templates per row", async () => {
    const file = writeTempJsonl([{ x: "A" }, { x: "B" }]);
    const tpl1 = makeTemplate({ prompt: "First: {{x}}" });
    const tpl2 = makeTemplate({ prompt: "Second: {{x}}" });
    const cases = await expandDataset([tpl1, tpl2], file);
    // 2 rows × 2 templates = 4 cases
    expect(cases).toHaveLength(4);
    expect(cases[0].prompt).toBe("First: A");
    expect(cases[1].prompt).toBe("Second: A");
    expect(cases[2].prompt).toBe("First: B");
    expect(cases[3].prompt).toBe("Second: B");
  });
});
