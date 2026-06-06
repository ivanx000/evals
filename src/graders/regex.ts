import type { RegexCriteria, GraderResult } from "../types.js";

export function gradeRegex(output: string, criteria: RegexCriteria): GraderResult {
  let passed = false;
  let detail: string;
  try {
    const re = new RegExp(criteria.value, criteria.flags);
    passed = re.test(output);
    detail = passed
      ? `Output matches /${criteria.value}/${criteria.flags}`
      : `Output does not match /${criteria.value}/${criteria.flags}`;
  } catch (err) {
    detail = `Invalid regex: ${(err as Error).message}`;
  }
  return { criteria_type: "regex", passed, detail };
}
