import type {
  RunSummary,
  RunResult,
  CaseResult,
  CompareRow,
  DiffResult,
  BenchmarkSummary,
  BenchmarkReport,
} from "../src/types";

export function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    timestamp: "2026-01-10T12:00:00Z",
    suite_name: "Summarization quality",
    total: 4,
    passed: 3,
    failed: 1,
    pass_rate: 0.75,
    avg_latency_ms: 1200,
    total_cost_usd: 0.0012,
    models: ["claude-haiku-4-5"],
    ...overrides,
  };
}

export function makeCaseResult(overrides: Partial<CaseResult> = {}): CaseResult {
  return {
    case_id: "case-1",
    prompt: "Summarize this article about penguins.",
    model: "claude-haiku-4-5",
    provider: "anthropic",
    output: "Penguins are flightless birds.",
    grader_results: [{ criteria_type: "exact_match", passed: true }],
    passed: true,
    latency_ms: 900,
    ...overrides,
  };
}

export function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    suite_name: "Summarization quality",
    run_id: "run-1",
    timestamp: "2026-01-10T12:00:00Z",
    model: "claude-haiku-4-5",
    provider: "anthropic",
    total: 2,
    passed: 1,
    failed: 1,
    pass_rate: 0.5,
    total_cost_usd: 0.002,
    total_latency_ms: 1800,
    cases: [
      makeCaseResult({ case_id: "case-1", passed: true }),
      makeCaseResult({
        case_id: "case-2",
        passed: false,
        grader_results: [{ criteria_type: "exact_match", passed: false }],
      }),
    ],
    ...overrides,
  };
}

export function makeCompareRow(overrides: Partial<CompareRow> = {}): CompareRow {
  return {
    caseName: "case-1",
    results: [
      { runId: "run-1", model: "claude-haiku-4-5", output: "output a", passed: true, latency_ms: 800 },
      { runId: "run-2", model: "claude-sonnet-4-6", output: "output b", passed: false, latency_ms: 650 },
    ],
    ...overrides,
  };
}

export function makeDiffResult(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    baseline_run_id: "run-1",
    candidate_run_id: "run-2",
    regressions: [
      { case_id: "case-3", criteria_type: "exact_match", baseline_passed: true, candidate_passed: false, status: "regression" },
    ],
    improvements: [],
    removed_cases: [],
    added_cases: [],
    unchanged_count: 5,
    ...overrides,
  };
}

export function makeBenchmarkSummary(overrides: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  return {
    run_id: "bench-run-1",
    benchmark_name: "financial-reasoning",
    benchmark_version: "1.0.0",
    timestamp: "2026-01-05T00:00:00Z",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    total_tasks: 10,
    accuracy: 0.8,
    mean_latency_ms: 1500,
    estimated_cost_usd: 0.01,
    brier_score: 0.12,
    ...overrides,
  };
}

export function makeBenchmarkReport(overrides: Partial<BenchmarkReport> = {}): BenchmarkReport {
  return {
    benchmark_name: "financial-reasoning",
    benchmark_version: "1.0.0",
    run_id: "bench-run-1",
    timestamp: "2026-01-05T00:00:00Z",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    total_tasks: 2,
    duration_ms: 4000,
    accuracy: 0.5,
    by_category: { arithmetic: { total: 2, passed: 1, pass_rate: 0.5 } },
    by_difficulty: { easy: { total: 2, passed: 1, pass_rate: 0.5 } },
    mean_latency_ms: 2000,
    estimated_cost_usd: 0.02,
    calibration: null,
    regression: null,
    tasks: [
      {
        task_id: "task-1",
        category: "arithmetic",
        difficulty: "easy",
        question: "What is 2+2?",
        model_answer: "4",
        reference_answer: "4",
        grader_type: "exact_match",
        passed: true,
        latency_ms: 900,
        grader_results: [{ criteria_type: "exact_match", passed: true }],
      },
      {
        task_id: "task-2",
        category: "arithmetic",
        difficulty: "easy",
        question: "What is 3+3?",
        model_answer: "5",
        reference_answer: "6",
        grader_type: "exact_match",
        passed: false,
        latency_ms: 1100,
        grader_results: [{ criteria_type: "exact_match", passed: false }],
      },
    ],
    ...overrides,
  };
}
