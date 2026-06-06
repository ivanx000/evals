import type { ExactMatchCriteria, GraderResult } from "../types.js";

export function gradeExactMatch(output: string, criteria: ExactMatchCriteria): GraderResult {
  const a = criteria.case_sensitive ? output : output.toLowerCase();
  const b = criteria.case_sensitive ? criteria.value : criteria.value.toLowerCase();
  const passed = a.trim() === b.trim();
  return {
    criteria_type: "exact_match",
    passed,
    detail: passed
      ? "Output matches expected value exactly"
      : `Expected "${criteria.value}", got "${output.trim().slice(0, 80)}${output.trim().length > 80 ? "…" : ""}"`,
  };
}
