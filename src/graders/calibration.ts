import type { CalibrationCriteria, GraderResult } from "../types.js";

// Extracts the ANSWER value — stops before CONFIDENCE: or end of string
function extractAnswer(text: string): string | null {
  const match = text.match(/\bANSWER:\s*(.+?)(?:\s+CONFIDENCE:|$)/im);
  return match ? match[1].trim() : null;
}

// Extracts the CONFIDENCE value (0-100), clamped to valid range
function extractConfidence(text: string): number | null {
  const match = text.match(/\bCONFIDENCE:\s*(\d+(?:\.\d+)?)/im);
  if (!match) return null;
  return Math.min(100, Math.max(0, parseFloat(match[1])));
}

export function gradeCalibration(
  output: string,
  criteria: CalibrationCriteria
): GraderResult {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "calibration", passed: false, error: "Output is not a string" };
    }

    const answer = extractAnswer(output);
    if (answer === null) {
      return {
        criteria_type: "calibration",
        passed: false,
        detail: `No ANSWER: field found in output. Expected format: "ANSWER: <answer> CONFIDENCE: <0-100>"`,
      };
    }

    const confidence = extractConfidence(output);
    const expected = criteria.expected;

    const a = criteria.case_sensitive ? answer : answer.toLowerCase();
    const b = criteria.case_sensitive ? expected : expected.toLowerCase();
    const passed = a.trim() === b.trim();

    const confSuffix = confidence !== null ? ` (confidence: ${confidence}%)` : "";

    return {
      criteria_type: "calibration",
      passed,
      detail: passed
        ? `Answer "${answer}" matches expected "${expected}"${confSuffix}`
        : `Answer "${answer}" does not match expected "${expected}"${confSuffix}`,
      metadata: {
        answer,
        expected,
        correct: passed,
        confidence,
      },
    };
  } catch (err) {
    return {
      criteria_type: "calibration",
      passed: false,
      error: `Grader error: ${(err as Error).message}`,
    };
  }
}
