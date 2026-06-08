import type { Criteria, GraderResult } from "../types.js";
import { gradeExactMatch } from "./exact_match.js";
import { gradeContains } from "./contains.js";
import { gradeMaxWords } from "./max_words.js";
import { gradeRegex } from "./regex.js";
import { gradeLLMJudge } from "./llm_judge.js";

export async function runGraders(
  output: string,
  criteriaList: Criteria[],
  judgeModel?: string,
  judgeApiKey?: string
): Promise<GraderResult[]> {
  const results: GraderResult[] = [];

  for (const criteria of criteriaList) {
    try {
      switch (criteria.type) {
        case "exact_match":
          results.push(gradeExactMatch(output, criteria));
          break;
        case "contains":
          results.push(gradeContains(output, criteria));
          break;
        case "max_words":
          results.push(gradeMaxWords(output, criteria));
          break;
        case "regex":
          results.push(gradeRegex(output, criteria));
          break;
        case "llm_judge":
          results.push(await gradeLLMJudge(output, criteria, judgeModel, judgeApiKey));
          break;
      }
    } catch (err) {
      results.push({
        criteria_type: criteria.type,
        passed: false,
        error: `Grader "${criteria.type}" threw unexpectedly: ${(err as Error).message}`,
      });
    }
  }

  return results;
}

export { gradeExactMatch } from "./exact_match.js";
export { gradeContains } from "./contains.js";
export { gradeMaxWords } from "./max_words.js";
export { gradeRegex } from "./regex.js";
export { gradeLLMJudge } from "./llm_judge.js";
