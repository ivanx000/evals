import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import type { CodeExecutionCriteria, GraderResult } from "../types.js";

const LANGUAGE_CONFIG: Record<string, { cmd: string; ext: string }> = {
  python:     { cmd: "python3", ext: ".py" },
  javascript: { cmd: "node",    ext: ".js" },
  bash:       { cmd: "bash",    ext: ".sh" },
};

function extractCode(output: string, language: string): string {
  // Prefer a fenced block that names the language
  const langFence = new RegExp("```" + language + "\\s*\\n([\\s\\S]*?)```", "i");
  const langMatch = output.match(langFence);
  if (langMatch) return langMatch[1];

  // Fall back to any generic fenced block
  const genericMatch = output.match(/```(?:\w*\n)?([\s\S]*?)```/);
  if (genericMatch) return genericMatch[1];

  // Fall back to raw output
  return output;
}

export async function gradeCodeExecution(
  output: string,
  criteria: CodeExecutionCriteria
): Promise<GraderResult> {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "code_execution", passed: false, error: "Output is not a string" };
    }

    const langConfig = LANGUAGE_CONFIG[criteria.language];
    const timeoutMs = criteria.timeout_ms ?? 10_000;

    const extractedCode = extractCode(output, criteria.language);
    const fullCode = criteria.test_code
      ? `${extractedCode}\n${criteria.test_code}`
      : extractedCode;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmeval-"));
    const tmpFile = path.join(tmpDir, `solution${langConfig.ext}`);

    try {
      fs.writeFileSync(tmpFile, fullCode, "utf-8");

      const result = spawnSync(langConfig.cmd, [tmpFile], {
        timeout: timeoutMs,
        encoding: "utf-8",
      });

      // Command not found
      if (result.error) {
        const errCode = (result.error as NodeJS.ErrnoException).code;
        if (errCode === "ENOENT") {
          return {
            criteria_type: "code_execution",
            passed: false,
            error: `'${langConfig.cmd}' not found. Make sure ${criteria.language} is installed.`,
          };
        }
        if (errCode === "ETIMEDOUT") {
          return {
            criteria_type: "code_execution",
            passed: false,
            detail: `Code execution timed out after ${timeoutMs}ms`,
          };
        }
        throw result.error;
      }

      // Killed by timeout signal
      if (result.signal === "SIGTERM") {
        return {
          criteria_type: "code_execution",
          passed: false,
          detail: `Code execution timed out after ${timeoutMs}ms`,
        };
      }

      // Non-zero exit — runtime error or failed assertion
      if (result.status !== 0) {
        const stderr = (result.stderr ?? "").trim();
        const lastLine = stderr.split("\n").slice(-3).join("\n");
        return {
          criteria_type: "code_execution",
          passed: false,
          detail: lastLine || `Exited with code ${result.status}`,
        };
      }

      // Compare stdout if expected_output is specified
      if (criteria.expected_output !== undefined) {
        const stdout = (result.stdout ?? "").trim();
        const expected = criteria.expected_output.trim();
        const passed = stdout === expected;
        return {
          criteria_type: "code_execution",
          passed,
          detail: passed
            ? `Output matched: "${expected}"`
            : `Expected "${expected}", got "${stdout.slice(0, 120)}"`,
        };
      }

      return {
        criteria_type: "code_execution",
        passed: true,
        detail: "Code ran successfully with exit code 0",
      };
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    }
  } catch (err) {
    return { criteria_type: "code_execution", passed: false, error: (err as Error).message };
  }
}
