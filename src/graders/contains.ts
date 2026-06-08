import type { ContainsCriteria, GraderResult } from "../types.js";

export function gradeContains(output: string, criteria: ContainsCriteria): GraderResult {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "contains", passed: false, error: "Output is not a string" };
    }
    const haystack = criteria.case_sensitive ? output : output.toLowerCase();
    const needle = criteria.case_sensitive ? criteria.value : criteria.value.toLowerCase();
    const passed = haystack.includes(needle);
    return {
      criteria_type: "contains",
      passed,
      detail: passed
        ? `Output contains "${criteria.value}"`
        : `Output does not contain "${criteria.value}"`,
    };
  } catch (err) {
    return { criteria_type: "contains", passed: false, error: (err as Error).message };
  }
}
