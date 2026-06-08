import type { MaxWordsCriteria, GraderResult } from "../types.js";

export function gradeMaxWords(output: string, criteria: MaxWordsCriteria): GraderResult {
  try {
    if (typeof output !== "string") {
      return { criteria_type: "max_words", passed: false, error: "Output is not a string" };
    }
    const wordCount = output.trim() === "" ? 0 : output.trim().split(/\s+/).filter(Boolean).length;
    const passed = wordCount <= criteria.value;
    return {
      criteria_type: "max_words",
      passed,
      detail: `${wordCount} words (limit: ${criteria.value})`,
    };
  } catch (err) {
    return { criteria_type: "max_words", passed: false, error: (err as Error).message };
  }
}
