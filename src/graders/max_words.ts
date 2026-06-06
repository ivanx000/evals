import type { MaxWordsCriteria, GraderResult } from "../types.js";

export function gradeMaxWords(output: string, criteria: MaxWordsCriteria): GraderResult {
  const wordCount = output.trim().split(/\s+/).filter(Boolean).length;
  const passed = wordCount <= criteria.value;
  return {
    criteria_type: "max_words",
    passed,
    detail: `${wordCount} words (limit: ${criteria.value})`,
  };
}
