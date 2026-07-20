import { z } from "zod";

// ─── Grader schemas ────────────────────────────────────────────────────────────

export const ExactMatchCriteriaSchema = z.object({
  type: z.literal("exact_match"),
  value: z.string(),
  case_sensitive: z.boolean().optional().default(false),
});

export const ContainsCriteriaSchema = z.object({
  type: z.literal("contains"),
  value: z.string(),
  case_sensitive: z.boolean().optional().default(false),
});

export const MaxWordsCriteriaSchema = z.object({
  type: z.literal("max_words"),
  value: z.number().int().positive(),
});

export const RegexCriteriaSchema = z.object({
  type: z.literal("regex"),
  value: z.string(),
  flags: z.string().optional().default(""),
});

export const LLMJudgeCriteriaSchema = z.object({
  type: z.literal("llm_judge"),
  rubric: z.string(),
  pass_threshold: z.number().min(1).max(5).optional().default(3),
  model: z.string().optional(),
});

export const CodeExecutionCriteriaSchema = z.object({
  type: z.literal("code_execution"),
  language: z.enum(["python", "javascript", "bash"]),
  test_code: z.string().optional(),
  expected_output: z.string().optional(),
  timeout_ms: z.number().int().positive().optional().default(10_000),
});

export const NumericToleranceCriteriaSchema = z.object({
  type: z.literal("numeric_tolerance"),
  value: z.number(),
  tolerance_pct: z.number().positive().optional().default(2.0),
});

export const CalibrationCriteriaSchema = z.object({
  type: z.literal("calibration"),
  expected: z.string(),
  case_sensitive: z.boolean().optional().default(false),
});

export const JsonSchemaCriteriaSchema = z.object({
  type: z.literal("json_schema"),
  schema: z.record(z.unknown()),
  extract_json: z.boolean().optional().default(false),
});

export const JsonPathCriteriaSchema = z.object({
  type: z.literal("json_path"),
  path: z.string(),
  extract_json: z.boolean().optional().default(false),
  equals: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  contains: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const CriteriaSchema = z.discriminatedUnion("type", [
  ExactMatchCriteriaSchema,
  ContainsCriteriaSchema,
  MaxWordsCriteriaSchema,
  RegexCriteriaSchema,
  LLMJudgeCriteriaSchema,
  CodeExecutionCriteriaSchema,
  NumericToleranceCriteriaSchema,
  CalibrationCriteriaSchema,
  JsonSchemaCriteriaSchema,
  JsonPathCriteriaSchema,
]);

// ─── Eval suite schema ─────────────────────────────────────────────────────────

// ─── Multi-turn schema ─────────────────────────────────────────────────────────

export const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().nullable(),
});

export const EvalCaseSchema = z.object({
  id: z.string().optional(),
  prompt: z.string().optional(),
  turns: z.array(TurnSchema).min(2).optional(),
  expected: z.string().optional(),
  criteria: z.array(CriteriaSchema).min(1),
  tags: z.array(z.string()).optional().default([]),
}).refine(
  (d) => d.prompt !== undefined || d.turns !== undefined,
  { message: "Each case must have either 'prompt' or 'turns'" }
);

export const EvalSuiteSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  extends: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(["anthropic", "openai", "ollama", "gemini"]).optional().default("anthropic"),
  system_prompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional().default(1024),
  cases: z.array(EvalCaseSchema).min(1),
  // ── Dataset fields ──────────────────────────────────────────────────────────
  dataset: z.string().optional(),
  dataset_limit: z.number().int().positive().optional(),
  dataset_sample: z.number().int().positive().optional(),
});

// ─── Config schema ─────────────────────────────────────────────────────────────

export const EvalConfigSchema = z.object({
  default_model: z.string().optional(),
  default_provider: z.enum(["anthropic", "openai", "ollama", "gemini"]).optional(),
  anthropic_api_key: z.string().optional(),
  openai_api_key: z.string().optional(),
  gemini_api_key: z.string().optional(),
  judge_model: z.string().optional().default("claude-opus-4-8"),
  results_dir: z.string().optional().default("./results"),
  cache_enabled: z.boolean().optional().default(true),
});

// ─── Inferred types ────────────────────────────────────────────────────────────

export type ExactMatchCriteria = z.infer<typeof ExactMatchCriteriaSchema>;
export type ContainsCriteria = z.infer<typeof ContainsCriteriaSchema>;
export type MaxWordsCriteria = z.infer<typeof MaxWordsCriteriaSchema>;
export type RegexCriteria = z.infer<typeof RegexCriteriaSchema>;
export type LLMJudgeCriteria = z.infer<typeof LLMJudgeCriteriaSchema>;
export type CodeExecutionCriteria = z.infer<typeof CodeExecutionCriteriaSchema>;
export type NumericToleranceCriteria = z.infer<typeof NumericToleranceCriteriaSchema>;
export type CalibrationCriteria = z.infer<typeof CalibrationCriteriaSchema>;
export type JsonSchemaCriteria = z.infer<typeof JsonSchemaCriteriaSchema>;
export type JsonPathCriteria = z.infer<typeof JsonPathCriteriaSchema>;
export type Criteria = z.infer<typeof CriteriaSchema>;

export type Turn = z.infer<typeof TurnSchema>;
export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalSuite = z.infer<typeof EvalSuiteSchema>;
export type EvalConfig = z.infer<typeof EvalConfigSchema>;

// ─── Grader result ─────────────────────────────────────────────────────────────

export interface GraderResult {
  criteria_type: string;
  passed: boolean;
  score?: number;      // 1-5 for llm_judge, else undefined
  reasoning?: string;  // for llm_judge
  detail?: string;     // human-readable detail for other graders
  error?: string;      // set when grader failed to execute
  metadata?: Record<string, unknown>;  // grader-specific extra data (e.g. calibration confidence)
}

// ─── Run result ────────────────────────────────────────────────────────────────

export interface CaseResult {
  case_id: string;
  prompt: string;
  model: string;
  provider: string;
  output: string;
  grader_results: GraderResult[];
  passed: boolean;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  error?: string;
  cached?: boolean;
}

export interface RunResult {
  suite_name: string;
  run_id: string;
  timestamp: string;
  model: string;
  provider: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  total_cost_usd: number;
  total_latency_ms: number;
  cases: CaseResult[];
  batch_id?: string;
  batch_cost_usd?: number;
}

// ─── Provider interface ────────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderCallOptions {
  model: string;
  prompt?: string;
  messages?: Message[];
  system_prompt?: string;
  temperature?: number;
  max_tokens: number;
  onToken?: (token: string) => void;
}

export interface ProviderResponse {
  output: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

export interface LLMProvider {
  call(options: ProviderCallOptions): Promise<ProviderResponse>;
}

// ─── Pricing table ────────────────────────────────────────────────────────────
// Prices in USD per 1M tokens

export const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8":   { input: 5.00,  output: 25.00 },
  "claude-opus-4-7":   { input: 5.00,  output: 25.00 },
  "claude-opus-4-6":   { input: 5.00,  output: 25.00 },
  "claude-sonnet-4-6": { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5":  { input: 1.00,  output: 5.00  },
};

export const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":          { input: 5.00,  output: 15.00 },
  "gpt-4o-mini":     { input: 0.15,  output: 0.60  },
  "gpt-4-turbo":     { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo":   { input: 0.50,  output: 1.50  },
};

export const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-pro":    { input: 1.25,  output: 10.00 },
  "gemini-2.0-flash":  { input: 0.10,  output: 0.40  },
  "gemini-1.5-pro":    { input: 1.25,  output: 5.00  },
  "gemini-1.5-flash":  { input: 0.075, output: 0.30  },
};

// ─── Plugin grader interface ───────────────────────────────────────────────────

export interface PluginGrader {
  type: string;
  validate: (config: unknown) => import("zod").ZodSchema;
  run: (output: string, config: unknown) => Promise<GraderResult>;
}

// ─── Regression diff types ─────────────────────────────────────────────────────

export type DiffStatus = "regression" | "improvement" | "unchanged" | "added" | "removed";

export interface DiffEntry {
  case_id: string;
  criteria_type: string;
  baseline_passed: boolean | null;
  candidate_passed: boolean | null;
  status: DiffStatus;
}

export interface DiffResult {
  baseline_run_id: string;
  candidate_run_id: string;
  regressions: DiffEntry[];
  improvements: DiffEntry[];
  removed_cases: string[];
  added_cases: string[];
  unchanged_count: number;
}

export function estimateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (provider === "ollama") return 0;
  const table =
    provider === "openai" ? OPENAI_PRICING :
    provider === "gemini" ? GEMINI_PRICING :
    ANTHROPIC_PRICING;
  const pricing = table[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
