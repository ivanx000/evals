import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { randomUUID } from "crypto";
import type {
  EvalSuite,
  EvalCase,
  CaseResult,
  RunResult,
  EvalConfig,
  ProviderCallOptions,
} from "./types.js";
import { EvalSuiteSchema } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { runGraders } from "./graders/index.js";
import { cacheGet, cacheSet } from "./cache.js";

export interface RunOptions {
  model?: string;
  watch?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  onCaseResult?: (result: CaseResult, index: number, total: number) => void;
}

export function loadSuite(suitePath: string): EvalSuite {
  const raw = fs.readFileSync(suitePath, "utf-8");
  const parsed = yaml.load(raw);
  return EvalSuiteSchema.parse(parsed);
}

function makeProvider(provider: string, config: EvalConfig) {
  if (provider === "openai") {
    return new OpenAIProvider(config.openai_api_key);
  }
  return new AnthropicProvider(config.anthropic_api_key);
}

async function runCase(
  evalCase: EvalCase,
  suite: EvalSuite,
  model: string,
  provider: string,
  config: EvalConfig,
  options: RunOptions
): Promise<CaseResult> {
  const caseId =
    evalCase.id ?? `case-${randomUUID().slice(0, 8)}`;

  const callOptions: ProviderCallOptions = {
    model,
    prompt: evalCase.prompt,
    system_prompt: suite.system_prompt,
    temperature: suite.temperature,
    max_tokens: suite.max_tokens ?? 1024,
  };

  let output = "";
  let input_tokens: number | undefined;
  let output_tokens: number | undefined;
  let cost_usd: number | undefined;
  let cached = false;
  let error: string | undefined;

  const start = Date.now();

  try {
    // Check semantic cache
    const cacheEnabled = config.cache_enabled && !options.noCache;
    if (cacheEnabled) {
      const hit = cacheGet(callOptions);
      if (hit) {
        output = hit.output;
        input_tokens = hit.input_tokens;
        output_tokens = hit.output_tokens;
        cost_usd = hit.cost_usd;
        cached = true;
      }
    }

    if (!cached) {
      const llm = makeProvider(provider, config);
      const response = await llm.call(callOptions);
      output = response.output;
      input_tokens = response.input_tokens;
      output_tokens = response.output_tokens;
      cost_usd = response.cost_usd;

      if (cacheEnabled) {
        cacheSet(callOptions, response);
      }
    }
  } catch (err) {
    error = (err as Error).message;
  }

  const latency_ms = Date.now() - start;

  const grader_results = error
    ? []
    : await runGraders(output, evalCase.criteria, config.judge_model);

  const passed = !error && grader_results.every((r) => r.passed);

  return {
    case_id: caseId,
    prompt: evalCase.prompt,
    model,
    provider,
    output,
    grader_results,
    passed,
    latency_ms,
    input_tokens,
    output_tokens,
    cost_usd,
    error,
    cached,
  };
}

export async function runSuite(
  suite: EvalSuite,
  config: EvalConfig,
  options: RunOptions = {}
): Promise<RunResult> {
  const model =
    options.model ?? suite.model ?? config.default_model ?? "claude-opus-4-8";
  const provider = suite.provider ?? config.default_provider ?? "anthropic";

  const runId = randomUUID();
  const timestamp = new Date().toISOString();
  const cases: CaseResult[] = [];

  for (let i = 0; i < suite.cases.length; i++) {
    const evalCase = suite.cases[i];
    const result = await runCase(evalCase, suite, model, provider, config, options);
    cases.push(result);
    options.onCaseResult?.(result, i, suite.cases.length);
  }

  const passed = cases.filter((c) => c.passed).length;
  const failed = cases.length - passed;
  const total_cost_usd = cases.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0);
  const total_latency_ms = cases.reduce((sum, c) => sum + c.latency_ms, 0);

  return {
    suite_name: suite.name,
    run_id: runId,
    timestamp,
    model,
    provider,
    total: cases.length,
    passed,
    failed,
    pass_rate: cases.length > 0 ? passed / cases.length : 0,
    total_cost_usd,
    total_latency_ms,
    cases,
  };
}

export function saveResult(result: RunResult, resultsDir: string): string {
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const ts = result.timestamp.replace(/[:.]/g, "-");
  const filename = `${ts}_${result.suite_name.replace(/\s+/g, "_").toLowerCase()}.json`;
  const filePath = path.join(resultsDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  return filePath;
}

export function listResults(resultsDir: string): string[] {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(resultsDir, f))
    .sort();
}

export function loadResult(filePath: string): RunResult {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as RunResult;
}
