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
  Message,
} from "./types.js";
import { EvalSuiteSchema } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { OllamaProvider } from "./providers/ollama.js";
import { GeminiProvider } from "./providers/gemini.js";
import { runGraders } from "./graders/index.js";
import { cacheGet, cacheSet } from "./cache.js";
import { expandDataset } from "./dataset.js";

export interface RunOptions {
  model?: string;
  providerOverride?: string;
  watch?: boolean;
  noCache?: boolean;
  verbose?: boolean;
  stream?: boolean;
  timeout?: number;
  concurrency?: number;
  filter?: string;
  tagFilter?: string[];
  datasetOverride?: string;
  batch?: boolean;
  _pollDelayMs?: number;
  onCaseResult?: (result: CaseResult, index: number, total: number) => void;
}

// ─── Suite loading ─────────────────────────────────────────────────────────────

function readYamlFile(filePath: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(
      `Cannot read suite file: ${filePath}\n  Check the file exists and is readable.`
    );
  }
  try {
    return yaml.load(raw);
  } catch (err) {
    throw new Error(
      `Invalid YAML in ${path.basename(filePath)}: ${(err as Error).message}`
    );
  }
}

function mergeSuiteRaw(
  base: Record<string, unknown>,
  child: Record<string, unknown>
): Record<string, unknown> {
  const { cases: baseCases = [] } = base;
  const { cases: childCases = [], extends: _ext, ...childFields } = child;
  const { extends: _baseExt, ...baseFields } = base;
  return {
    ...baseFields,
    ...childFields,
    cases: [...(baseCases as unknown[]), ...(childCases as unknown[])],
  };
}

// Resolves a suite file and all its ancestors into one merged raw object.
// `ancestors` tracks the absolute paths of files currently on the call stack
// to detect cycles.
function loadRawSuite(
  absPath: string,
  ancestors: Set<string>
): Record<string, unknown> {
  if (ancestors.has(absPath)) {
    const chain = [...ancestors, absPath].map((p) => path.basename(p)).join(" → ");
    throw new Error(`Circular suite inheritance detected: ${chain}`);
  }

  const parsed = readYamlFile(absPath);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Suite file is not a YAML mapping: ${path.basename(absPath)}`);
  }

  const raw = parsed as Record<string, unknown>;

  if (typeof raw.extends !== "string") {
    return raw;
  }

  const basePath = path.resolve(path.dirname(absPath), raw.extends);
  const next = new Set(ancestors).add(absPath);
  const baseRaw = loadRawSuite(basePath, next);

  return mergeSuiteRaw(baseRaw, raw);
}

export function loadSuite(suitePath: string): EvalSuite {
  const absPath = path.resolve(suitePath);
  const merged = loadRawSuite(absPath, new Set());

  const result = EvalSuiteSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Suite validation failed in ${path.basename(suitePath)}:\n${issues}`
    );
  }

  return result.data;
}

// ─── Provider factory ─────────────────────────────────────────────────────────

function makeProvider(provider: string, config: EvalConfig) {
  if (provider === "openai") {
    return new OpenAIProvider(config.openai_api_key);
  }
  if (provider === "ollama") {
    return new OllamaProvider();
  }
  if (provider === "gemini") {
    return new GeminiProvider(config.gemini_api_key);
  }
  return new AnthropicProvider(config.anthropic_api_key);
}

// ─── Semaphore for concurrency control ────────────────────────────────────────

class Semaphore {
  private count: number;
  private queue: Array<() => void> = [];

  constructor(limit: number) {
    this.count = Math.max(1, limit);
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}

// ─── Multi-turn conversation builder ─────────────────────────────────────────

async function buildMultiTurnMessages(
  evalCase: EvalCase,
  suite: EvalSuite,
  model: string,
  provider: string,
  config: EvalConfig
): Promise<{ messages: Message[]; totalInputTokens: number; totalOutputTokens: number; totalCost: number }> {
  const turns = evalCase.turns!;

  // Find the index of the last null assistant turn (the one being evaluated)
  let lastNullIdx = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "assistant" && turns[i].content === null) {
      lastNullIdx = i;
      break;
    }
  }
  if (lastNullIdx === -1) {
    throw new Error("Multi-turn case has no null assistant turn to evaluate");
  }

  const messages: Message[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  // Process all turns before the last null assistant turn
  for (let i = 0; i < lastNullIdx; i++) {
    const turn = turns[i];
    if (turn.content !== null) {
      messages.push({ role: turn.role, content: turn.content });
    } else {
      // Intermediate null assistant turn — call the model to fill it in
      const llm = makeProvider(provider, config);
      const response = await llm.call({
        model,
        messages: [...messages],
        system_prompt: suite.system_prompt,
        temperature: suite.temperature,
        max_tokens: suite.max_tokens ?? 1024,
      });
      messages.push({ role: "assistant", content: response.output });
      totalInputTokens += response.input_tokens ?? 0;
      totalOutputTokens += response.output_tokens ?? 0;
      totalCost += response.cost_usd ?? 0;
    }
  }

  return { messages, totalInputTokens, totalOutputTokens, totalCost };
}

// ─── Case execution ───────────────────────────────────────────────────────────

async function runCase(
  evalCase: EvalCase,
  suite: EvalSuite,
  model: string,
  provider: string,
  config: EvalConfig,
  options: RunOptions
): Promise<CaseResult> {
  const caseId = evalCase.id ?? `case-${randomUUID().slice(0, 8)}`;
  const isMultiTurn = Array.isArray(evalCase.turns) && evalCase.turns.length > 0;

  let output = "";
  let input_tokens: number | undefined;
  let output_tokens: number | undefined;
  let cost_usd: number | undefined;
  let cached = false;
  let error: string | undefined;
  const promptLabel = isMultiTurn ? `[multi-turn: ${evalCase.turns!.length} turns]` : (evalCase.prompt ?? "");

  const start = Date.now();

  try {
    if (isMultiTurn) {
      // Multi-turn: build conversation history, then run final turn
      const { messages, totalInputTokens, totalOutputTokens, totalCost } =
        await buildMultiTurnMessages(evalCase, suite, model, provider, config);

      const callOptions: ProviderCallOptions = {
        model,
        messages,
        system_prompt: suite.system_prompt,
        temperature: suite.temperature,
        max_tokens: suite.max_tokens ?? 1024,
      };

      if (options.stream) {
        process.stderr.write(`\n[${caseId}]\n`);
        callOptions.onToken = (token) => process.stderr.write(token);
      }

      const llm = makeProvider(provider, config);
      const response = await llm.call(callOptions);

      if (options.stream) process.stderr.write("\n");

      output = response.output;
      input_tokens = (response.input_tokens ?? 0) + totalInputTokens;
      output_tokens = (response.output_tokens ?? 0) + totalOutputTokens;
      cost_usd = (response.cost_usd ?? 0) + totalCost;
    } else {
      const callOptions: ProviderCallOptions = {
        model,
        prompt: evalCase.prompt,
        system_prompt: suite.system_prompt,
        temperature: suite.temperature,
        max_tokens: suite.max_tokens ?? 1024,
      };

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
        if (options.stream) {
          process.stderr.write(`\n[${caseId}]\n`);
          callOptions.onToken = (token) => process.stderr.write(token);
        }

        const llm = makeProvider(provider, config);
        const response = await llm.call(callOptions);

        if (options.stream) process.stderr.write("\n");

        output = response.output;
        input_tokens = response.input_tokens;
        output_tokens = response.output_tokens;
        cost_usd = response.cost_usd;

        if (cacheEnabled) {
          cacheSet(callOptions, response);
        }
      }
    }
  } catch (err) {
    error = (err as Error).message;
  }

  const latency_ms = Date.now() - start;

  const grader_results = error
    ? []
    : await runGraders(output, evalCase.criteria, config.judge_model, config.anthropic_api_key);

  const passed = !error && grader_results.every((r) => r.passed);

  return {
    case_id: caseId,
    prompt: promptLabel,
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

async function runCaseWithTimeout(
  evalCase: EvalCase,
  suite: EvalSuite,
  model: string,
  provider: string,
  config: EvalConfig,
  options: RunOptions
): Promise<CaseResult> {
  const timeoutMs = options.timeout ?? 30_000;
  const caseId = evalCase.id ?? `case-${randomUUID().slice(0, 8)}`;
  const isMultiTurn = Array.isArray(evalCase.turns) && evalCase.turns.length > 0;
  const promptLabel = isMultiTurn ? `[multi-turn: ${evalCase.turns!.length} turns]` : (evalCase.prompt ?? "");

  const timeoutResult: CaseResult = {
    case_id: caseId,
    prompt: promptLabel,
    model,
    provider,
    output: "",
    grader_results: [],
    passed: false,
    latency_ms: timeoutMs,
    error: `Timeout: case exceeded ${timeoutMs}ms`,
    cached: false,
  };

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<CaseResult>((resolve) => {
    timeoutId = setTimeout(() => resolve(timeoutResult), timeoutMs);
  });

  return Promise.race([
    runCase(evalCase, suite, model, provider, config, options).then((r) => {
      clearTimeout(timeoutId);
      return r;
    }),
    timeoutPromise,
  ]);
}

// ─── Suite execution ──────────────────────────────────────────────────────────

export async function runSuite(
  suite: EvalSuite,
  config: EvalConfig,
  options: RunOptions = {}
): Promise<RunResult> {
  const model =
    options.model ?? suite.model ?? config.default_model ?? "claude-opus-4-8";
  const provider = options.providerOverride ?? suite.provider ?? config.default_provider ?? "anthropic";

  // Resolve dataset: CLI override takes precedence over YAML field
  const datasetPath = options.datasetOverride ?? suite.dataset;

  let resolvedCases = suite.cases;
  if (datasetPath) {
    const absPath = path.isAbsolute(datasetPath)
      ? datasetPath
      : path.join(process.cwd(), datasetPath);
    resolvedCases = await expandDataset(
      suite.cases,
      absPath,
      suite.dataset_limit,
      suite.dataset_sample
    );
  }

  const substringFiltered = options.filter
    ? resolvedCases.filter((c) => {
        const filterLower = options.filter!.toLowerCase();
        const matchesId = c.id?.toLowerCase().includes(filterLower) ?? false;
        const matchesTags = c.tags?.some((t) => t.toLowerCase().includes(filterLower)) ?? false;
        return matchesId || matchesTags;
      })
    : resolvedCases;

  const activeTags = options.tagFilter && options.tagFilter.length > 0 ? options.tagFilter : null;
  const filteredCases = activeTags
    ? substringFiltered.filter((c) => c.tags?.some((t) => activeTags.includes(t)) ?? false)
    : substringFiltered;
  const skipped = activeTags ? substringFiltered.length - filteredCases.length : undefined;

  const runId = randomUUID();
  const timestamp = new Date().toISOString();

  const concurrency = options.concurrency ?? 1;
  const sem = new Semaphore(concurrency);

  const casePromises = filteredCases.map(async (evalCase, i) => {
    await sem.acquire();
    try {
      const result = await runCaseWithTimeout(evalCase, suite, model, provider, config, options);
      options.onCaseResult?.(result, i, filteredCases.length);
      return result;
    } finally {
      sem.release();
    }
  });

  const cases = await Promise.all(casePromises);

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
    ...(skipped !== undefined && { skipped }),
    pass_rate: cases.length > 0 ? passed / cases.length : 0,
    total_cost_usd,
    total_latency_ms,
    cases,
  };
}

// ─── Result persistence ───────────────────────────────────────────────────────

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
