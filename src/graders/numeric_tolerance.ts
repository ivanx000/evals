import type { NumericToleranceCriteria, GraderResult } from "../types.js";

function extractLastNumber(text: string): number | null {
  // Strip confidence annotation added by benchmark runs
  const cleaned = text.replace(/\bCONFIDENCE:\s*\d+\s*$/im, "").trim();
  // Match integers, decimals, and negatives (with optional commas and trailing %)
  const matches = cleaned.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const raw = matches[matches.length - 1].replace(/,/g, "");
  return parseFloat(raw);
}

export function gradeNumericTolerance(
  output: string,
  criteria: NumericToleranceCriteria
): GraderResult {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "numeric_tolerance", passed: false, error: "Output is not a string" };
    }

    const extracted = extractLastNumber(output);
    if (extracted === null) {
      return {
        criteria_type: "numeric_tolerance",
        passed: false,
        detail: `No numeric value found in output`,
      };
    }

    const { value: reference, tolerance_pct = 2.0 } = criteria;

    // Handle reference = 0 with absolute tolerance fallback
    const denominator = Math.abs(reference) > 1e-10 ? Math.abs(reference) : 1;
    const relativeError = Math.abs(extracted - reference) / denominator;
    const passed = relativeError <= tolerance_pct / 100;

    return {
      criteria_type: "numeric_tolerance",
      passed,
      detail: passed
        ? `${extracted} ≈ ${reference} (within ${tolerance_pct}% tolerance)`
        : `${extracted} ≠ ${reference} — error ${(relativeError * 100).toFixed(2)}% exceeds ${tolerance_pct}% tolerance`,
    };
  } catch (err) {
    return {
      criteria_type: "numeric_tolerance",
      passed: false,
      error: `Grader error: ${(err as Error).message}`,
    };
  }
}
