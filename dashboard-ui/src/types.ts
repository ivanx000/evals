// Mirrors src/types.ts RunResult shape exactly

export interface GraderResult {
  criteria_type: string;
  passed: boolean;
  score?: number;
  reasoning?: string;
  detail?: string;
  error?: string;
}

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

// Summary shape returned by GET /api/runs
export interface RunSummary {
  id: string;
  timestamp: string;
  suite_name: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  models: string[];
}

// Shape returned by GET /api/compare
export interface CompareCell {
  runId: string;
  model: string;
  output: string;
  passed: boolean;
  latency_ms: number;
}

export interface CompareRow {
  caseName: string;
  results: CompareCell[];
}

// ─── Benchmark types (mirrors src/benchmark-types.ts) ─────────────────────────

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

// ─── Diff types ────────────────────────────────────────────────────────────────

// Shape returned by GET /api/diff
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
