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

export const CriteriaSchema = z.discriminatedUnion("type", [
  ExactMatchCriteriaSchema,
  ContainsCriteriaSchema,
  MaxWordsCriteriaSchema,
  RegexCriteriaSchema,
  LLMJudgeCriteriaSchema,
]);

// ─── Eval suite schema ─────────────────────────────────────────────────────────

export const EvalCaseSchema = z.object({
  id: z.string().optional(),
  prompt: z.string(),
  expected: z.string().optional(),
  criteria: z.array(CriteriaSchema).min(1),
  tags: z.array(z.string()).optional().default([]),
});

export const EvalSuiteSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(["anthropic", "openai"]).optional().default("anthropic"),
  system_prompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional().default(1024),
  cases: z.array(EvalCaseSchema).min(1),
});

// ─── Config schema ─────────────────────────────────────────────────────────────

export const EvalConfigSchema = z.object({
  default_model: z.string().optional(),
  default_provider: z.enum(["anthropic", "openai"]).optional(),
  anthropic_api_key: z.string().optional(),
  openai_api_key: z.string().optional(),
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
export type Criteria = z.infer<typeof CriteriaSchema>;

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
}

// ─── Provider interface ────────────────────────────────────────────────────────

export interface ProviderCallOptions {
  model: string;
  prompt: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens: number;
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

export function estimateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number
): number {
  const table = provider === "openai" ? OPENAI_PRICING : ANTHROPIC_PRICING;
  const pricing = table[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
