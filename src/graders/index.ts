import type { Criteria, GraderResult, PluginGrader } from "../types.js";
import { gradeExactMatch } from "./exact_match.js";
import { gradeContains } from "./contains.js";
import { gradeMaxWords } from "./max_words.js";
import { gradeRegex } from "./regex.js";
import { gradeLLMJudge } from "./llm_judge.js";
import { gradeCodeExecution } from "./code_execution.js";
import { gradeNumericTolerance } from "./numeric_tolerance.js";
import { loadPlugins } from "../plugins.js";

// Plugins are loaded once per process and cached here
let pluginCache: Map<string, PluginGrader> | null = null;

async function getPlugins(): Promise<Map<string, PluginGrader>> {
  if (pluginCache === null) {
    pluginCache = await loadPlugins();
  }
  return pluginCache;
}

export async function runGraders(
  output: string,
  criteriaList: Criteria[],
  judgeModel?: string,
  judgeApiKey?: string
): Promise<GraderResult[]> {
  const results: GraderResult[] = [];
  const plugins = await getPlugins();

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
        case "code_execution":
          results.push(await gradeCodeExecution(output, criteria));
          break;
        case "numeric_tolerance":
          results.push(gradeNumericTolerance(output, criteria));
          break;
        default: {
          // Try plugin graders
          const plugin = plugins.get((criteria as { type: string }).type);
          if (plugin) {
            try {
              const result = await plugin.run(output, criteria);
              results.push(result);
            } catch (pluginErr) {
              results.push({
                criteria_type: (criteria as { type: string }).type,
                passed: false,
                error: `Plugin grader "${(criteria as { type: string }).type}" failed: ${(pluginErr as Error).message}`,
              });
            }
          } else {
            results.push({
              criteria_type: (criteria as { type: string }).type,
              passed: false,
              error: `Unknown grader type: "${(criteria as { type: string }).type}"`,
            });
          }
        }
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

// Exported for tests: reset the plugin cache (e.g. between test suites)
export function resetPluginCache(): void {
  pluginCache = null;
}

export { gradeExactMatch } from "./exact_match.js";
export { gradeContains } from "./contains.js";
export { gradeMaxWords } from "./max_words.js";
export { gradeRegex } from "./regex.js";
export { gradeLLMJudge } from "./llm_judge.js";
export { gradeCodeExecution } from "./code_execution.js";
export { gradeNumericTolerance } from "./numeric_tolerance.js";
