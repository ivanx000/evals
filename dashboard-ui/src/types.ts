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
