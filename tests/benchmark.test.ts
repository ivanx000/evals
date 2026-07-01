import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { RunResult } from "../src/types.js";
import type { BenchmarkReport } from "../src/benchmark-types.js";

// ─── Mock runSuite so no real API calls are made ──────────────────────────────

const mockRunSuite = vi.hoisted(() => vi.fn());

vi.mock("../src/runner.js", () => ({
  runSuite: mockRunSuite,
}));

import {
  loadBenchmarkSpec,
  computeCalibration,
  computeRegression,
  runBenchmark,
} from "../src/benchmark.js";
import type { EvalConfig } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBenchmarkDir(tasksYaml: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-test-"));
  fs.writeFileSync(path.join(tmpDir, "tasks.yaml"), tasksYaml);
  return tmpDir;
}

function makeConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    anthropic_api_key: "test-key",
    judge_model: "claude-opus-4-8",
    results_dir: "./results",
    cache_enabled: false,
    ...overrides,
  };
}

function makeRunResult(cases: RunResult["cases"]): RunResult {
  const passed = cases.filter((c) => c.passed).length;
  return {
    suite_name: "Test Benchmark",
    run_id: "test-run-id",
    timestamp: new Date().toISOString(),
    model: "claude-haiku-4-5",
    provider: "anthropic",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    pass_rate: cases.length > 0 ? passed / cases.length : 0,
    total_cost_usd: cases.reduce((s, c) => s + (c.cost_usd ?? 0), 0),
    total_latency_ms: cases.reduce((s, c) => s + c.latency_ms, 0),
    cases,
  };
}

function makeCase(
  id: string,
  passed: boolean,
  graderResults: RunResult["cases"][0]["grader_results"] = []
): RunResult["cases"][0] {
  return {
    case_id: id,
    prompt: "test prompt",
    model: "claude-haiku-4-5",
    provider: "anthropic",
    output: "test output",
    grader_results: graderResults,
    passed,
    latency_ms: 100,
    cost_usd: 0.0001,
  };
}

// ─── loadBenchmarkSpec ────────────────────────────────────────────────────────

describe("loadBenchmarkSpec", () => {
  it("loads a valid numeric_tolerance spec", () => {
    const dir = makeBenchmarkDir(`
name: Test Benchmark
version: "1.0"
tasks:
  - id: task-1
    question: What is 2+2?
    reference_answer: "4"
    grader: numeric_tolerance
    tolerance_pct: 1.0
    difficulty: easy
    category: ratio_analysis
`);
    const spec = loadBenchmarkSpec(dir);
    expect(spec.name).toBe("Test Benchmark");
    expect(spec.tasks).toHaveLength(1);
    expect(spec.tasks[0].grader).toBe("numeric_tolerance");
    expect(spec.tasks[0].tolerance_pct).toBe(1.0);
  });

  it("loads a valid calibration spec", () => {
    const dir = makeBenchmarkDir(`
name: Calibration Benchmark
version: "1.0"
tasks:
  - id: calib-1
    question: What is the P/E ratio?
    reference_answer: "25"
    expected: "25"
    grader: calibration
    difficulty: medium
    category: ratio_analysis
`);
    const spec = loadBenchmarkSpec(dir);
    expect(spec.tasks[0].grader).toBe("calibration");
    expect(spec.tasks[0].expected).toBe("25");
  });

  it("loads a valid llm_judge spec", () => {
    const dir = makeBenchmarkDir(`
name: Judge Benchmark
version: "1.0"
tasks:
  - id: judge-1
    question: Explain beta in finance.
    reference_answer: A measure of volatility.
    grader: llm_judge
    rubric: Does the answer correctly explain beta as systematic risk measure?
    difficulty: hard
    category: risk_assessment
`);
    const spec = loadBenchmarkSpec(dir);
    expect(spec.tasks[0].grader).toBe("llm_judge");
    expect(spec.tasks[0].rubric).toBe(
      "Does the answer correctly explain beta as systematic risk measure?"
    );
  });

  it("throws when llm_judge task is missing rubric", () => {
    const dir = makeBenchmarkDir(`
name: Bad Benchmark
version: "1.0"
tasks:
  - id: bad-task
    question: Explain something.
    reference_answer: Something.
    grader: llm_judge
    difficulty: easy
    category: market_concepts
`);
    expect(() => loadBenchmarkSpec(dir)).toThrow(/llm_judge tasks require a 'rubric' field/);
  });

  it("throws on unknown grader type", () => {
    const dir = makeBenchmarkDir(`
name: Bad Benchmark
version: "1.0"
tasks:
  - id: bad-task
    question: Question?
    reference_answer: "42"
    grader: unknown_grader
    difficulty: easy
    category: ratio_analysis
`);
    expect(() => loadBenchmarkSpec(dir)).toThrow(/Benchmark spec validation failed/);
  });

  it("throws when tasks.yaml does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-empty-"));
    expect(() => loadBenchmarkSpec(tmpDir)).toThrow(/Cannot read benchmark tasks/);
  });

  it("throws for invalid YAML syntax", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-bad-"));
    fs.writeFileSync(path.join(tmpDir, "tasks.yaml"), "name: [\ninvalid yaml}}}");
    expect(() => loadBenchmarkSpec(tmpDir)).toThrow(/Invalid YAML/);
  });

  it("throws when tasks array is empty", () => {
    const dir = makeBenchmarkDir(`
name: Empty
version: "1.0"
tasks: []
`);
    expect(() => loadBenchmarkSpec(dir)).toThrow(/Benchmark spec validation failed/);
  });
});

// ─── computeCalibration ───────────────────────────────────────────────────────

describe("computeCalibration", () => {
  it("returns insufficient-data for fewer than 3 samples", () => {
    const result = computeCalibration([
      { task_id: "t1", confidence: 80, passed: true },
      { task_id: "t2", confidence: 60, passed: false },
    ]);
    expect(result.interpretation).toBe("insufficient-data");
    expect(result.n_samples).toBe(2);
    expect(result.brier_score).toBe(0);
  });

  it("returns insufficient-data for 0 samples", () => {
    const result = computeCalibration([]);
    expect(result.interpretation).toBe("insufficient-data");
    expect(result.n_samples).toBe(0);
  });

  it("computes exact Brier score for well-calibrated pairs", () => {
    // 100% confidence and passed → BS contribution = (1.0 - 1)^2 = 0
    // 0% confidence and failed → BS contribution = (0.0 - 0)^2 = 0
    // Perfect score = 0
    const pairs = [
      { task_id: "t1", confidence: 100, passed: true },
      { task_id: "t2", confidence: 100, passed: true },
      { task_id: "t3", confidence: 0, passed: false },
    ];
    const result = computeCalibration(pairs);
    expect(result.brier_score).toBeCloseTo(0, 5);
    expect(result.interpretation).toBe("well-calibrated");
    expect(result.n_samples).toBe(3);
  });

  it("interprets overconfident when mean confidence >> pass rate", () => {
    // All 90% confidence, all fail → diff = 0.9 - 0 = 0.9 (overconfident)
    const pairs = [
      { task_id: "t1", confidence: 90, passed: false },
      { task_id: "t2", confidence: 90, passed: false },
      { task_id: "t3", confidence: 90, passed: false },
    ];
    const result = computeCalibration(pairs);
    expect(result.interpretation).toBe("overconfident");
  });

  it("interprets underconfident when mean confidence << pass rate", () => {
    // All 10% confidence, all pass → diff = 0.1 - 1.0 = -0.9 (underconfident)
    const pairs = [
      { task_id: "t1", confidence: 10, passed: true },
      { task_id: "t2", confidence: 10, passed: true },
      { task_id: "t3", confidence: 10, passed: true },
    ];
    const result = computeCalibration(pairs);
    expect(result.interpretation).toBe("underconfident");
  });

  it("computes correct Brier score for a known mixed set", () => {
    // (0.8 - 1)^2 = 0.04, (0.5 - 0)^2 = 0.25, (0.7 - 1)^2 = 0.09
    // mean = (0.04 + 0.25 + 0.09) / 3 ≈ 0.1267
    const pairs = [
      { task_id: "t1", confidence: 80, passed: true },
      { task_id: "t2", confidence: 50, passed: false },
      { task_id: "t3", confidence: 70, passed: true },
    ];
    const result = computeCalibration(pairs);
    expect(result.brier_score).toBeCloseTo((0.04 + 0.25 + 0.09) / 3, 5);
    expect(result.pairs).toHaveLength(3);
  });

  it("returns pairs unchanged in the result", () => {
    const pairs = [
      { task_id: "t1", confidence: 75, passed: true },
      { task_id: "t2", confidence: 60, passed: false },
      { task_id: "t3", confidence: 80, passed: true },
    ];
    const result = computeCalibration(pairs);
    expect(result.pairs).toEqual(pairs);
  });
});

// ─── computeRegression ────────────────────────────────────────────────────────

function makeReport(
  tasks: Array<{ task_id: string; passed: boolean }>,
  accuracy: number,
  overrides: Partial<BenchmarkReport> = {}
): BenchmarkReport {
  return {
    benchmark_name: "Test",
    benchmark_version: "1.0",
    run_id: "run-id",
    timestamp: "2024-01-01T00:00:00.000Z",
    model: "claude-haiku-4-5",
    provider: "anthropic",
    total_tasks: tasks.length,
    duration_ms: 1000,
    accuracy,
    by_category: {},
    by_difficulty: {},
    mean_latency_ms: 100,
    estimated_cost_usd: 0.001,
    calibration: null,
    regression: null,
    tasks: tasks.map((t) => ({
      task_id: t.task_id,
      category: "ratio_analysis",
      difficulty: "easy",
      question: "Q",
      model_answer: "A",
      reference_answer: "A",
      grader_type: "numeric_tolerance",
      passed: t.passed,
      latency_ms: 100,
      grader_results: [],
    })),
    ...overrides,
  };
}

describe("computeRegression", () => {
  it("detects regressions (pass → fail)", () => {
    const prev = makeReport(
      [
        { task_id: "t1", passed: true },
        { task_id: "t2", passed: true },
      ],
      1.0
    );
    const current = makeReport(
      [
        { task_id: "t1", passed: false },
        { task_id: "t2", passed: true },
      ],
      0.5
    );
    const result = computeRegression(prev, current, 5);
    expect(result.regressed_tasks).toEqual(["t1"]);
    expect(result.improved_tasks).toEqual([]);
  });

  it("detects improvements (fail → pass)", () => {
    const prev = makeReport(
      [
        { task_id: "t1", passed: false },
        { task_id: "t2", passed: false },
      ],
      0.0
    );
    const current = makeReport(
      [
        { task_id: "t1", passed: true },
        { task_id: "t2", passed: false },
      ],
      0.5
    );
    const result = computeRegression(prev, current, 5);
    expect(result.improved_tasks).toEqual(["t1"]);
    expect(result.regressed_tasks).toEqual([]);
  });

  it("sets threshold_exceeded when accuracy drop exceeds threshold", () => {
    const prev = makeReport([], 1.0);
    const current = makeReport([], 0.85); // dropped 15 percentage points
    const result = computeRegression(prev, current, 5); // threshold = 5%
    expect(result.threshold_exceeded).toBe(true);
    expect(result.accuracy_delta).toBeCloseTo(-0.15, 5);
  });

  it("does not set threshold_exceeded when drop is within threshold", () => {
    const prev = makeReport([], 1.0);
    const current = makeReport([], 0.97); // dropped 3 percentage points
    const result = computeRegression(prev, current, 5); // threshold = 5%
    expect(result.threshold_exceeded).toBe(false);
  });

  it("computes latency and cost deltas", () => {
    const prev = makeReport([], 0.9, { mean_latency_ms: 200, estimated_cost_usd: 0.01 });
    const current = makeReport([], 0.9, { mean_latency_ms: 250, estimated_cost_usd: 0.015 });
    const result = computeRegression(prev, current, 5);
    expect(result.latency_delta_ms).toBe(50);
    expect(result.cost_delta_usd).toBeCloseTo(0.005, 5);
  });

  it("skips tasks that do not exist in previous report", () => {
    const prev = makeReport([{ task_id: "t1", passed: true }], 1.0);
    const current = makeReport(
      [
        { task_id: "t1", passed: false },
        { task_id: "t2", passed: true }, // new task, not in prev
      ],
      0.5
    );
    const result = computeRegression(prev, current, 5);
    expect(result.regressed_tasks).toEqual(["t1"]);
    expect(result.improved_tasks).toEqual([]);
  });

  it("includes previous run metadata in result", () => {
    const prev = makeReport([], 1.0, {
      run_id: "prev-run",
      timestamp: "2024-01-01T00:00:00.000Z",
      model: "claude-haiku-4-5",
    });
    const current = makeReport([], 0.9);
    const result = computeRegression(prev, current, 5);
    expect(result.previous_run_id).toBe("prev-run");
    expect(result.previous_timestamp).toBe("2024-01-01T00:00:00.000Z");
    expect(result.previous_model).toBe("claude-haiku-4-5");
  });
});

// ─── runBenchmark ─────────────────────────────────────────────────────────────

describe("runBenchmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const numericDir = () =>
    makeBenchmarkDir(`
name: Numeric Test
version: "1.0"
tasks:
  - id: num-1
    question: What is 100 / 4?
    reference_answer: "25"
    grader: numeric_tolerance
    tolerance_pct: 2.0
    difficulty: easy
    category: ratio_analysis
`);

  const calibrationDir = () =>
    makeBenchmarkDir(`
name: Calibration Test
version: "1.0"
tasks:
  - id: calib-1
    question: What is the current ratio?
    reference_answer: "2.5"
    grader: calibration
    difficulty: medium
    category: ratio_analysis
`);

  it("returns a BenchmarkReport with the correct structure", async () => {
    const dir = numericDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([makeCase("num-1", true, [{ criteria_type: "numeric_tolerance", passed: true }])])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.benchmark_name).toBe("Numeric Test");
    expect(report.benchmark_version).toBe("1.0");
    expect(report.total_tasks).toBe(1);
    expect(report.run_id).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(report.tasks).toHaveLength(1);
  });

  it("aggregates accuracy from runSuite pass_rate", async () => {
    const dir = numericDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([makeCase("num-1", true, [{ criteria_type: "numeric_tolerance", passed: true }])])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.accuracy).toBe(1.0);
  });

  it("builds category and difficulty breakdowns", async () => {
    const dir = numericDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([makeCase("num-1", true, [{ criteria_type: "numeric_tolerance", passed: true }])])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.by_category["ratio_analysis"]).toEqual({
      total: 1,
      passed: 1,
      pass_rate: 1,
    });
    expect(report.by_difficulty["easy"]).toEqual({
      total: 1,
      passed: 1,
      pass_rate: 1,
    });
  });

  it("sets calibration to null when no calibration tasks are present", async () => {
    const dir = numericDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([makeCase("num-1", true, [{ criteria_type: "numeric_tolerance", passed: true }])])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.calibration).toBeNull();
  });

  it("collects calibration pairs from grader_results metadata", async () => {
    const dir = calibrationDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([
        makeCase("calib-1", true, [
          {
            criteria_type: "calibration",
            passed: true,
            metadata: { answer: "2.5", expected: "2.5", correct: true, confidence: 85 },
          },
        ]),
      ])
    );

    const report = await runBenchmark(dir, makeConfig());
    // Only 1 sample → insufficient-data
    expect(report.calibration).not.toBeNull();
    expect(report.calibration!.interpretation).toBe("insufficient-data");
    expect(report.calibration!.pairs).toHaveLength(1);
    expect(report.calibration!.pairs[0]).toEqual({
      task_id: "calib-1",
      confidence: 85,
      passed: true,
    });
  });

  it("computes calibration Brier score when >= 3 calibration samples", async () => {
    const dir = makeBenchmarkDir(`
name: Multi Calib
version: "1.0"
tasks:
  - id: c1
    question: Q1
    reference_answer: "A"
    grader: calibration
    difficulty: easy
    category: ratio_analysis
  - id: c2
    question: Q2
    reference_answer: "B"
    grader: calibration
    difficulty: medium
    category: ratio_analysis
  - id: c3
    question: Q3
    reference_answer: "C"
    grader: calibration
    difficulty: hard
    category: risk_assessment
`);
    mockRunSuite.mockResolvedValue(
      makeRunResult([
        makeCase("c1", true, [
          { criteria_type: "calibration", passed: true, metadata: { confidence: 90, correct: true } },
        ]),
        makeCase("c2", false, [
          { criteria_type: "calibration", passed: false, metadata: { confidence: 80, correct: false } },
        ]),
        makeCase("c3", true, [
          { criteria_type: "calibration", passed: true, metadata: { confidence: 70, correct: true } },
        ]),
      ])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.calibration).not.toBeNull();
    expect(report.calibration!.n_samples).toBe(3);
    expect(report.calibration!.brier_score).toBeGreaterThan(0);
    expect(report.calibration!.interpretation).not.toBe("insufficient-data");
  });

  it("uses model_answer from raw output (no stripping)", async () => {
    const dir = calibrationDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([
        {
          ...makeCase("calib-1", true, [
            { criteria_type: "calibration", passed: true, metadata: { confidence: 80, correct: true } },
          ]),
          output: "ANSWER: 2.5 CONFIDENCE: 80",
        },
      ])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.tasks[0].model_answer).toBe("ANSWER: 2.5 CONFIDENCE: 80");
  });

  it("calls onTaskResult callback for each task", async () => {
    const dir = numericDir();
    mockRunSuite.mockImplementation(async (_suite, _config, opts) => {
      const result = makeRunResult([
        makeCase("num-1", true, [{ criteria_type: "numeric_tolerance", passed: true }]),
      ]);
      opts?.onCaseResult?.(result.cases[0], 0, 1);
      return result;
    });

    const cb = vi.fn();
    await runBenchmark(dir, makeConfig(), { onTaskResult: cb });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("num-1", true, 0, 1);
  });

  it("does not include confidence in task result when no calibration grader", async () => {
    const dir = numericDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([makeCase("num-1", true, [{ criteria_type: "numeric_tolerance", passed: true }])])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.tasks[0].confidence).toBeUndefined();
  });

  it("includes confidence in task result from calibration grader metadata", async () => {
    const dir = calibrationDir();
    mockRunSuite.mockResolvedValue(
      makeRunResult([
        makeCase("calib-1", true, [
          { criteria_type: "calibration", passed: true, metadata: { confidence: 72, correct: true } },
        ]),
      ])
    );

    const report = await runBenchmark(dir, makeConfig());
    expect(report.tasks[0].confidence).toBe(72);
  });
});
