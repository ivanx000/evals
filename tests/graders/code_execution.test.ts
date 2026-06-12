import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock child_process so no real code is executed ──────────────────────────

const mockSpawnSync = vi.fn();

vi.mock("child_process", () => ({
  spawnSync: mockSpawnSync,
}));

// ─── Mock fs to avoid touching the real filesystem ───────────────────────────

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdtempSync: vi.fn().mockReturnValue("/tmp/llmeval-test"),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import { gradeCodeExecution } from "../../src/graders/code_execution.js";
import type { CodeExecutionCriteria } from "../../src/types.js";

function makeCriteria(overrides: Partial<CodeExecutionCriteria> = {}): CodeExecutionCriteria {
  return {
    type: "code_execution",
    language: "python",
    timeout_ms: 10_000,
    ...overrides,
  };
}

function makeSpawnResult(overrides: {
  status?: number | null;
  stdout?: string;
  stderr?: string;
  signal?: string | null;
  error?: Error;
}) {
  return {
    status: overrides.status ?? 0,
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
    signal: overrides.signal ?? null,
    error: overrides.error,
  };
}

describe("gradeCodeExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("passes when code exits with code 0 (no test_code or expected_output)", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    const result = await gradeCodeExecution("print('hello')", makeCriteria());
    expect(result.passed).toBe(true);
    expect(result.criteria_type).toBe("code_execution");
  });

  it("passes when test_code assertions all succeed (exit 0)", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    const result = await gradeCodeExecution(
      "def add(a, b):\n    return a + b",
      makeCriteria({ test_code: "assert add(2, 3) == 5" })
    );
    expect(result.passed).toBe(true);
  });

  it("passes when stdout matches expected_output exactly", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0, stdout: "5\n" }));
    const result = await gradeCodeExecution(
      "print(2 + 3)",
      makeCriteria({ expected_output: "5" })
    );
    expect(result.passed).toBe(true);
    expect(result.detail).toMatch(/matched/);
  });

  it("extracts code from a markdown python fence", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    const output = "Here is the solution:\n```python\nprint('hello')\n```";
    await gradeCodeExecution(output, makeCriteria({ language: "python" }));
    const written = (vi.mocked(await import("fs")).writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(written).toContain("print('hello')");
    expect(written).not.toContain("```");
  });

  it("extracts code from a generic markdown fence", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    const output = "```\nconsole.log('hi')\n```";
    await gradeCodeExecution(output, makeCriteria({ language: "javascript" }));
    const written = (vi.mocked(await import("fs")).writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(written).toContain("console.log('hi')");
  });

  it("appends test_code after extracted code", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    await gradeCodeExecution(
      "def add(a, b):\n    return a + b",
      makeCriteria({ test_code: "assert add(1, 1) == 2" })
    );
    const written = (vi.mocked(await import("fs")).writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(written).toContain("def add");
    expect(written).toContain("assert add(1, 1) == 2");
  });

  // ── Failure cases ───────────────────────────────────────────────────────────

  it("fails when code exits with non-zero status", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({
      status: 1,
      stderr: "AssertionError",
    }));
    const result = await gradeCodeExecution("x = 1", makeCriteria());
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("AssertionError");
  });

  it("fails when stdout does not match expected_output", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0, stdout: "wrong\n" }));
    const result = await gradeCodeExecution(
      "print('wrong')",
      makeCriteria({ expected_output: "5" })
    );
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/Expected "5"/);
  });

  it("fails with timeout message when process is killed by SIGTERM", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: null, signal: "SIGTERM" }));
    const result = await gradeCodeExecution("while True: pass", makeCriteria({ timeout_ms: 5000 }));
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/timed out/);
    expect(result.detail).toContain("5000");
  });

  it("fails with timeout message when ETIMEDOUT error is returned", async () => {
    const timeoutErr = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
    mockSpawnSync.mockReturnValue(makeSpawnResult({ error: timeoutErr }));
    const result = await gradeCodeExecution("while True: pass", makeCriteria());
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/timed out/);
  });

  it("fails with actionable error when interpreter is not installed (ENOENT)", async () => {
    const notFoundErr = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockSpawnSync.mockReturnValue(makeSpawnResult({ error: notFoundErr }));
    const result = await gradeCodeExecution("print('hi')", makeCriteria({ language: "python" }));
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/python3.*not found/i);
  });

  it("returns pass=false and error when output is not a string", async () => {
    const result = await gradeCodeExecution(
      null as unknown as string,
      makeCriteria()
    );
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/not a string/);
  });

  // ── Cost / always free ───────────────────────────────────────────────────────

  it("uses python3 command for python language", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    await gradeCodeExecution("x = 1", makeCriteria({ language: "python" }));
    expect(mockSpawnSync.mock.calls[0][0]).toBe("python3");
  });

  it("uses node command for javascript language", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    await gradeCodeExecution("const x = 1", makeCriteria({ language: "javascript" }));
    expect(mockSpawnSync.mock.calls[0][0]).toBe("node");
  });

  it("uses bash command for bash language", async () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));
    await gradeCodeExecution("echo hello", makeCriteria({ language: "bash" }));
    expect(mockSpawnSync.mock.calls[0][0]).toBe("bash");
  });
});
