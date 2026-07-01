import { z } from "zod";
import type { GraderResult } from "./types.js";

// ─── Benchmark task definition (from tasks.yaml) ─────────────────────────────

export const BenchmarkTaskSchema = z.object({
  id: z.string(),
  question: z.string(),
  reference_answer: z.string(),
  grader: z.enum(["numeric_tolerance", "calibration", "llm_judge"]),
  tolerance_pct: z.number().positive().optional().default(2.0),
  rubric: z.string().optional(),
  expected: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  category: z.enum([
    "ratio_analysis",
    "earnings_interpretation",
    "risk_assessment",
    "market_concepts",
  ]),
}).refine(
  (d) => d.grader !== "llm_judge" || d.rubric !== undefined,
  { message: "llm_judge tasks require a 'rubric' field" }
);

export const BenchmarkSpecSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  tasks: z.array(BenchmarkTaskSchema).min(1),
});

export type BenchmarkTask = z.infer<typeof BenchmarkTaskSchema>;
export type BenchmarkSpec = z.infer<typeof BenchmarkSpecSchema>;

// ─── Benchmark run result types ───────────────────────────────────────────────

export interface CategoryMetrics {
  total: number;
  passed: number;
  pass_rate: number;
}

export interface CalibrationPair {
  task_id: string;
  confidence: number;
  passed: boolean;
}

export interface CalibrationResult {
  brier_score: number;
  interpretation: "well-calibrated" | "overconfident" | "underconfident" | "insufficient-data";
  n_samples: number;
  pairs: CalibrationPair[];
}

export interface RegressionInfo {
  previous_run_id: string;
  previous_timestamp: string;
  previous_model: string;
  accuracy_delta: number;
  latency_delta_ms: number;
  cost_delta_usd: number;
  regressed_tasks: string[];
  improved_tasks: string[];
  threshold_exceeded: boolean;
}

export interface BenchmarkTaskResult {
  task_id: string;
  category: string;
  difficulty: string;
  question: string;
  model_answer: string;
  reference_answer: string;
  grader_type: string;
  passed: boolean;
  latency_ms: number;
  cost_usd?: number;
  confidence?: number;
  grader_results: GraderResult[];
}

export interface BenchmarkReport {
  benchmark_name: string;
  benchmark_version: string;
  run_id: string;
  timestamp: string;
  model: string;
  provider: string;
  total_tasks: number;
  duration_ms: number;

  accuracy: number;
  by_category: Record<string, CategoryMetrics>;
  by_difficulty: Record<string, CategoryMetrics>;
  mean_latency_ms: number;
  estimated_cost_usd: number;

  calibration: CalibrationResult | null;
  regression: RegressionInfo | null;

  tasks: BenchmarkTaskResult[];
}

// Lightweight summary for listing
export interface BenchmarkSummary {
  run_id: string;
  benchmark_name: string;
  benchmark_version: string;
  timestamp: string;
  model: string;
  provider: string;
  total_tasks: number;
  accuracy: number;
  mean_latency_ms: number;
  estimated_cost_usd: number;
  brier_score: number | null;
}
