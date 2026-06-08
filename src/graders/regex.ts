import type { RegexCriteria, GraderResult } from "../types.js";

export function gradeRegex(output: string, criteria: RegexCriteria): GraderResult {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "regex", passed: false, error: "Output is not a string" };
    }
    const re = new RegExp(criteria.value, criteria.flags);
    const passed = re.test(output);
    return {
      criteria_type: "regex",
      passed,
      detail: passed
        ? `Output matches /${criteria.value}/${criteria.flags}`
        : `Output does not match /${criteria.value}/${criteria.flags}`,
    };
  } catch (err) {
    return {
      criteria_type: "regex",
      passed: false,
      error: `Invalid regex /${criteria.value}/${criteria.flags}: ${(err as Error).message}`,
    };
  }
}
