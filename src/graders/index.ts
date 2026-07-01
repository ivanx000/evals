import type { Criteria, GraderResult, PluginGrader } from "../types.js";
import { getGrader } from "./registry.js";
import { loadPlugins } from "../plugins.js";

// Re-export individual grader functions for direct use in tests / library consumers
export { gradeExactMatch } from "./exact_match.js";
export { gradeContains } from "./contains.js";
export { gradeMaxWords } from "./max_words.js";
export { gradeRegex } from "./regex.js";
export { gradeLLMJudge } from "./llm_judge.js";
export { gradeCodeExecution } from "./code_execution.js";
export { gradeNumericTolerance } from "./numeric_tolerance.js";
export { gradeCalibration } from "./calibration.js";

// Re-export registry utilities so callers can register custom graders programmatically
export { registerGrader, getGrader, isRegistered, getRegisteredTypes } from "./registry.js";

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
  const context = { judgeModel, judgeApiKey };

  for (const criteria of criteriaList) {
    try {
      const grader = getGrader(criteria.type);
      if (grader) {
        results.push(await grader.grade(output, criteria, context));
      } else {
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
            error: `Unknown grader type: "${(criteria as { type: string }).type}". Register it with registerGrader() or add a plugin to the graders/ directory.`,
          });
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
