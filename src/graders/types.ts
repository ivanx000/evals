import type { GraderResult } from "../types.js";

export type ModelResponse = string;
export type Task = Record<string, unknown>;
export type GradeResult = GraderResult;

export interface GraderContext {
  judgeModel?: string;
  judgeApiKey?: string;
}

export interface Grader {
  readonly type: string;
  grade(response: ModelResponse, task: Task, context?: GraderContext): Promise<GradeResult>;
}
