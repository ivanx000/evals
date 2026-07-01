import type { Grader } from "./types.js";
import type {
  ExactMatchCriteria,
  ContainsCriteria,
  MaxWordsCriteria,
  RegexCriteria,
  LLMJudgeCriteria,
  CodeExecutionCriteria,
  NumericToleranceCriteria,
  CalibrationCriteria,
} from "../types.js";
import { gradeExactMatch } from "./exact_match.js";
import { gradeContains } from "./contains.js";
import { gradeMaxWords } from "./max_words.js";
import { gradeRegex } from "./regex.js";
import { gradeLLMJudge } from "./llm_judge.js";
import { gradeCodeExecution } from "./code_execution.js";
import { gradeNumericTolerance } from "./numeric_tolerance.js";
import { gradeCalibration } from "./calibration.js";

const registry = new Map<string, Grader>();

export function registerGrader(grader: Grader): void {
  registry.set(grader.type, grader);
}

export function getGrader(type: string): Grader | undefined {
  return registry.get(type);
}

export function isRegistered(type: string): boolean {
  return registry.has(type);
}

export function getRegisteredTypes(): readonly string[] {
  return [...registry.keys()];
}

// ─── Built-in grader registrations ────────────────────────────────────────────

registerGrader({
  type: "exact_match",
  async grade(output, criteria) {
    return gradeExactMatch(output, criteria as ExactMatchCriteria);
  },
});

registerGrader({
  type: "contains",
  async grade(output, criteria) {
    return gradeContains(output, criteria as ContainsCriteria);
  },
});

registerGrader({
  type: "max_words",
  async grade(output, criteria) {
    return gradeMaxWords(output, criteria as MaxWordsCriteria);
  },
});

registerGrader({
  type: "regex",
  async grade(output, criteria) {
    return gradeRegex(output, criteria as RegexCriteria);
  },
});

registerGrader({
  type: "llm_judge",
  async grade(output, criteria, context = {}) {
    return gradeLLMJudge(
      output,
      criteria as LLMJudgeCriteria,
      context.judgeModel,
      context.judgeApiKey,
    );
  },
});

registerGrader({
  type: "code_execution",
  async grade(output, criteria) {
    return gradeCodeExecution(output, criteria as CodeExecutionCriteria);
  },
});

registerGrader({
  type: "numeric_tolerance",
  async grade(output, criteria) {
    return gradeNumericTolerance(output, criteria as NumericToleranceCriteria);
  },
});

registerGrader({
  type: "calibration",
  async grade(output, criteria) {
    return gradeCalibration(output, criteria as CalibrationCriteria);
  },
});
