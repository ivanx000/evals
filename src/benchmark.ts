import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { randomUUID } from "crypto";
import type { EvalSuite, EvalConfig } from "./types.js";
import { runSuite } from "./runner.js";
import {
  BenchmarkSpecSchema,
  type BenchmarkSpec,
  type BenchmarkTask,
  type BenchmarkReport,
  type BenchmarkTaskResult,
  type CategoryMetrics,
  type CalibrationResult,
  type RegressionInfo,
} from "./benchmark-types.js";
import { makeBenchmarkStore } from "./stores/benchmark/index.js";

// ─── Benchmark spec loading ────────────────────────────────────────────────────

export function loadBenchmarkSpec(benchmarkDir: string): BenchmarkSpec {
  const specPath = path.join(benchmarkDir, "tasks.yaml");

  let raw: string;
  try {
    raw = fs.readFileSync(specPath, "utf-8");
  } catch {
    throw new Error(`Cannot read benchmark tasks: ${specPath}`);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${specPath}: ${(err as Error).message}`);
  }

  const result = BenchmarkSpecSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Benchmark spec validation failed:\n${issues}`);
  }

  return result.data;
}

// ─── Convert benchmark tasks → EvalSuite ─────────────────────────────────────

const CALIBRATION_FORMAT = `

Respond with exactly:
ANSWER: <your answer>
CONFIDENCE: <0-100>
where CONFIDENCE is your certainty that your answer is correct (0 = no idea, 100 = certain).`;

function taskToEvalCase(task: BenchmarkTask) {
  const suffix = task.grader === "calibration" ? CALIBRATION_FORMAT : "";
  const prompt = task.question.trim() + suffix;

  let criteria;
  if (task.grader === "numeric_tolerance") {
    criteria = [
      {
        type: "numeric_tolerance" as const,
        value: parseFloat(task.reference_answer),
        tolerance_pct: task.tolerance_pct ?? 2.0,
      },
    ];
  } else if (task.grader === "calibration") {
    criteria = [
      {
        type: "calibration" as const,
        expected: task.expected ?? task.reference_answer,
        case_sensitive: false as const,
      },
    ];
  } else {
    criteria = [
      {
        type: "llm_judge" as const,
        rubric: task.rubric!,
        pass_threshold: 3 as const,
      },
    ];
  }

  return {
    id: task.id,
    prompt,
    criteria,
    tags: [task.difficulty, task.category],
  };
}

const DEFAULT_SYSTEM_PROMPT = "Answer the following question accurately and concisely.";

function buildEvalSuite(
  spec: BenchmarkSpec,
  model: string,
  provider: string,
): EvalSuite {
  return {
    name: spec.name,
    description: spec.description,
    model,
    provider: provider as EvalSuite["provider"],
    system_prompt: spec.system_prompt ?? DEFAULT_SYSTEM_PROMPT,
    max_tokens: 1024,
    temperature: 0,
    cases: spec.tasks.map((t) => taskToEvalCase(t)),
  };
}

// ─── Calibration (Brier score) ────────────────────────────────────────────────

export function computeCalibration(
  pairs: Array<{ task_id: string; confidence: number; passed: boolean }>
): CalibrationResult {
  if (pairs.length < 3) {
    return { brier_score: 0, interpretation: "insufficient-data", n_samples: pairs.length, pairs };
  }

  // Brier score: mean((f - o)^2) where f = probability, o = outcome
  const brierScore =
    pairs.reduce((sum, p) => sum + Math.pow(p.confidence / 100 - (p.passed ? 1 : 0), 2), 0) /
    pairs.length;

  // Perfect calibration ≈ 0.25 for random 50/50 tasks; lower is better
  // For financial tasks where a good model should score 70%+:
  //   well-calibrated: BS < 0.15
  //   overconfident: mean confidence >> actual pass rate
  //   underconfident: mean confidence << actual pass rate
  const meanConfidence = pairs.reduce((s, p) => s + p.confidence, 0) / pairs.length / 100;
  const meanPassRate = pairs.filter((p) => p.passed).length / pairs.length;
  const diff = meanConfidence - meanPassRate;

  let interpretation: CalibrationResult["interpretation"];
  if (brierScore < 0.15) {
    interpretation = "well-calibrated";
  } else if (diff > 0.1) {
    interpretation = "overconfident";
  } else if (diff < -0.1) {
    interpretation = "underconfident";
  } else {
    interpretation = "well-calibrated";
  }

  return { brier_score: brierScore, interpretation, n_samples: pairs.length, pairs };
}

// ─── Regression detection ─────────────────────────────────────────────────────

export async function findPreviousReport(
  reportsDir: string,
  benchmarkName: string,
  model: string,
  currentRunId: string
): Promise<BenchmarkReport | null> {
  const store = makeBenchmarkStore(reportsDir);
  const ids = await store.list(benchmarkName);

  for (const id of [...ids].reverse()) {
    try {
      const data = await store.load(id);
      if (data.run_id !== currentRunId && data.model === model) {
        return data;
      }
    } catch {
      // skip malformed/unreadable reports
    }
  }
  return null;
}

export function computeRegression(
  prev: BenchmarkReport,
  current: BenchmarkReport,
  threshold: number
): RegressionInfo {
  const prevById = new Map(prev.tasks.map((t) => [t.task_id, t]));
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const t of current.tasks) {
    const p = prevById.get(t.task_id);
    if (!p) continue;
    if (p.passed && !t.passed) regressions.push(t.task_id);
    if (!p.passed && t.passed) improvements.push(t.task_id);
  }

  const accuracyDelta = current.accuracy - prev.accuracy;
  const threshold_exceeded = accuracyDelta < -(threshold / 100);

  return {
    previous_run_id: prev.run_id,
    previous_timestamp: prev.timestamp,
    previous_model: prev.model,
    accuracy_delta: accuracyDelta,
    latency_delta_ms: current.mean_latency_ms - prev.mean_latency_ms,
    cost_delta_usd: current.estimated_cost_usd - prev.estimated_cost_usd,
    regressed_tasks: regressions,
    improved_tasks: improvements,
    threshold_exceeded,
  };
}

// ─── Main benchmark runner ────────────────────────────────────────────────────

export interface BenchmarkRunOptions {
  model?: string;
  provider?: string;
  noCache?: boolean;
  concurrency?: number;
  timeout?: number;
  reportsDir?: string;
  regressionThreshold?: number;
  onTaskResult?: (taskId: string, passed: boolean, index: number, total: number) => void;
}

export async function runBenchmark(
  benchmarkDir: string,
  config: EvalConfig,
  options: BenchmarkRunOptions = {}
): Promise<BenchmarkReport> {
  const spec = loadBenchmarkSpec(benchmarkDir);
  const model = options.model ?? config.default_model ?? "claude-opus-4-8";
  const provider = options.provider ?? config.default_provider ?? "anthropic";
  const reportsDir = options.reportsDir ?? "./reports";
  const regressionThreshold = options.regressionThreshold ?? 5;
  const runId = randomUUID();
  const timestamp = new Date().toISOString();
  const startMs = Date.now();

  const hasCalibrationTasks = spec.tasks.some((t) => t.grader === "calibration");
  const suite = buildEvalSuite(spec, model, provider);

  const runResult = await runSuite(suite, config, {
    noCache: options.noCache,
    concurrency: options.concurrency ?? 1,
    timeout: options.timeout ?? 60_000,
    onCaseResult: (r, i, total) => {
      options.onTaskResult?.(r.case_id, r.passed, i, total);
    },
  });

  // Build task-level metadata lookup
  const taskMeta = new Map(spec.tasks.map((t) => [t.id, t]));

  // Collect calibration pairs from calibration grader results
  const calibrationPairs: Array<{ task_id: string; confidence: number; passed: boolean }> = [];

  const taskResults: BenchmarkTaskResult[] = runResult.cases.map((c) => {
    const meta = taskMeta.get(c.case_id);
    const calibMeta = c.grader_results.find((r) => r.criteria_type === "calibration")?.metadata;
    const confidence = typeof calibMeta?.confidence === "number" ? calibMeta.confidence : undefined;
    const correct = typeof calibMeta?.correct === "boolean" ? calibMeta.correct : undefined;

    if (confidence !== undefined && correct !== undefined) {
      calibrationPairs.push({ task_id: c.case_id, confidence, passed: correct });
    }

    return {
      task_id: c.case_id,
      category: meta?.category ?? "unknown",
      difficulty: meta?.difficulty ?? "unknown",
      question: meta?.question.trim() ?? c.prompt,
      model_answer: c.output,
      reference_answer: meta?.reference_answer ?? "",
      grader_type: meta?.grader ?? "unknown",
      passed: c.passed,
      latency_ms: c.latency_ms,
      cost_usd: c.cost_usd,
      confidence,
      grader_results: c.grader_results,
    };
  });

  // Aggregate metrics
  const byCategory: Record<string, CategoryMetrics> = {};
  const byDifficulty: Record<string, CategoryMetrics> = {};

  for (const t of taskResults) {
    for (const [key, dim] of [
      [t.category, byCategory] as const,
      [t.difficulty, byDifficulty] as const,
    ]) {
      if (!dim[key]) dim[key] = { total: 0, passed: 0, pass_rate: 0 };
      dim[key].total++;
      if (t.passed) dim[key].passed++;
    }
  }
  for (const m of [...Object.values(byCategory), ...Object.values(byDifficulty)]) {
    m.pass_rate = m.total > 0 ? m.passed / m.total : 0;
  }

  const accuracy = runResult.pass_rate;
  const mean_latency_ms =
    taskResults.length > 0
      ? Math.round(taskResults.reduce((s, t) => s + t.latency_ms, 0) / taskResults.length)
      : 0;
  const estimated_cost_usd = runResult.total_cost_usd;
  const calibration = hasCalibrationTasks ? computeCalibration(calibrationPairs) : null;
  const duration_ms = Date.now() - startMs;

  const report: BenchmarkReport = {
    benchmark_name: spec.name,
    benchmark_version: spec.version,
    run_id: runId,
    timestamp,
    model,
    provider,
    total_tasks: taskResults.length,
    duration_ms,
    accuracy,
    by_category: byCategory,
    by_difficulty: byDifficulty,
    mean_latency_ms,
    estimated_cost_usd,
    calibration,
    regression: null, // filled in below
    tasks: taskResults,
  };

  // Regression detection
  const prevReport = await findPreviousReport(reportsDir, spec.name, model, runId);
  if (prevReport) {
    report.regression = computeRegression(prevReport, report, regressionThreshold);
  }

  return report;
}

// ─── Report persistence ────────────────────────────────────────────────────────

export async function saveBenchmarkReportJson(
  report: BenchmarkReport,
  reportsDir: string
): Promise<string> {
  return makeBenchmarkStore(reportsDir).save(report);
}

export async function listBenchmarkReports(
  reportsDir: string,
  benchmarkFilter?: string
): Promise<BenchmarkReport[]> {
  const store = makeBenchmarkStore(reportsDir);
  const ids = await store.list(benchmarkFilter);

  const reports: BenchmarkReport[] = [];
  for (const id of ids) {
    try {
      reports.push(await store.load(id));
    } catch {
      // skip malformed/unreadable reports
    }
  }

  return reports.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
