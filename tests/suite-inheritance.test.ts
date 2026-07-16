import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadSuite } from "../src/runner.js";

// Writes a YAML string to a file inside a temp directory and returns the path.
function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content.trimStart());
  return filePath;
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eval-inherit-test-"));
}

const BASE_CASE = `
  - id: base-case
    prompt: "Hello"
    criteria:
      - type: contains
        value: "hello"
`;

const CHILD_CASE = `
  - id: child-case
    prompt: "World"
    criteria:
      - type: contains
        value: "world"
`;

describe("suite inheritance — loadSuite", () => {
  it("child inherits top-level fields from base", () => {
    const dir = tmpDir();
    writeFile(dir, "base.yaml", `
name: Base Suite
provider: openai
model: gpt-4o
max_tokens: 512
cases:${BASE_CASE}
`);
    const childPath = writeFile(dir, "child.yaml", `
name: Child Suite
extends: ./base.yaml
cases:${CHILD_CASE}
`);
    const suite = loadSuite(childPath);
    expect(suite.name).toBe("Child Suite");
    expect(suite.provider).toBe("openai");
    expect(suite.model).toBe("gpt-4o");
    expect(suite.max_tokens).toBe(512);
  });

  it("base cases come first, child cases are appended", () => {
    const dir = tmpDir();
    writeFile(dir, "base.yaml", `
name: Base
cases:${BASE_CASE}
`);
    const childPath = writeFile(dir, "child.yaml", `
name: Child
extends: ./base.yaml
cases:${CHILD_CASE}
`);
    const suite = loadSuite(childPath);
    expect(suite.cases).toHaveLength(2);
    expect(suite.cases[0].id).toBe("base-case");
    expect(suite.cases[1].id).toBe("child-case");
  });

  it("child field overrides the same field in base", () => {
    const dir = tmpDir();
    writeFile(dir, "base.yaml", `
name: Base
model: gpt-4o
max_tokens: 512
cases:${BASE_CASE}
`);
    const childPath = writeFile(dir, "child.yaml", `
name: Child
extends: ./base.yaml
model: claude-haiku-4-5
max_tokens: 256
cases:${CHILD_CASE}
`);
    const suite = loadSuite(childPath);
    expect(suite.model).toBe("claude-haiku-4-5");
    expect(suite.max_tokens).toBe(256);
  });

  it("child with no cases inherits all cases from base", () => {
    const dir = tmpDir();
    writeFile(dir, "base.yaml", `
name: Base
cases:${BASE_CASE}
`);
    const childPath = writeFile(dir, "child.yaml", `
name: Child
extends: ./base.yaml
`);
    const suite = loadSuite(childPath);
    expect(suite.cases).toHaveLength(1);
    expect(suite.cases[0].id).toBe("base-case");
  });

  it("extends field is not present on the returned EvalSuite", () => {
    const dir = tmpDir();
    writeFile(dir, "base.yaml", `
name: Base
cases:${BASE_CASE}
`);
    const childPath = writeFile(dir, "child.yaml", `
name: Child
extends: ./base.yaml
cases:${CHILD_CASE}
`);
    const suite = loadSuite(childPath);
    expect(suite.extends).toBeUndefined();
  });

  it("resolves extends path relative to the child file's directory", () => {
    const dir = tmpDir();
    const subDir = path.join(dir, "suites");
    fs.mkdirSync(subDir);
    writeFile(dir, "base.yaml", `
name: Base
cases:${BASE_CASE}
`);
    const childPath = writeFile(subDir, "child.yaml", `
name: Child
extends: ../base.yaml
cases:${CHILD_CASE}
`);
    const suite = loadSuite(childPath);
    expect(suite.cases).toHaveLength(2);
    expect(suite.cases[0].id).toBe("base-case");
  });

  it("supports multi-level inheritance (grandchild extends child extends base)", () => {
    const dir = tmpDir();
    writeFile(dir, "base.yaml", `
name: Base
model: gpt-4o
cases:${BASE_CASE}
`);
    writeFile(dir, "middle.yaml", `
name: Middle
extends: ./base.yaml
temperature: 0.5
cases:
  - id: middle-case
    prompt: "Middle"
    criteria:
      - type: contains
        value: "middle"
`);
    const grandchildPath = writeFile(dir, "grandchild.yaml", `
name: Grandchild
extends: ./middle.yaml
cases:${CHILD_CASE}
`);
    const suite = loadSuite(grandchildPath);
    expect(suite.name).toBe("Grandchild");
    expect(suite.model).toBe("gpt-4o");
    expect(suite.temperature).toBe(0.5);
    expect(suite.cases).toHaveLength(3);
    expect(suite.cases.map((c) => c.id)).toEqual(["base-case", "middle-case", "child-case"]);
  });

  it("throws a clear error when the base file does not exist", () => {
    const dir = tmpDir();
    const childPath = writeFile(dir, "child.yaml", `
name: Child
extends: ./nonexistent.yaml
cases:${CHILD_CASE}
`);
    expect(() => loadSuite(childPath)).toThrow(/Cannot read suite file/);
  });

  it("throws on direct circular inheritance (a extends b extends a)", () => {
    const dir = tmpDir();
    writeFile(dir, "a.yaml", `
name: A
extends: ./b.yaml
cases:${BASE_CASE}
`);
    writeFile(dir, "b.yaml", `
name: B
extends: ./a.yaml
cases:${CHILD_CASE}
`);
    expect(() => loadSuite(path.join(dir, "a.yaml"))).toThrow(/[Cc]ircular/);
  });

  it("throws on self-referential inheritance (a extends a)", () => {
    const dir = tmpDir();
    const aPath = writeFile(dir, "a.yaml", `
name: A
extends: ./a.yaml
cases:${BASE_CASE}
`);
    expect(() => loadSuite(aPath)).toThrow(/[Cc]ircular/);
  });
});
