import * as path from "path";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageBatchIndividualResponse } from "@anthropic-ai/sdk/resources/messages/batches.js";
import type { EvalSuite, EvalCase, CaseResult, RunResult, EvalConfig } from "./types.js";
import { ANTHROPIC_PRICING } from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { runGraders } from "./graders/index.js";
import { expandDataset } from "./dataset.js";
import type { RunOptions } from "./runner.js";

type BatchRequest = {
  custom_id: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
};

function buildBatchRequest(
  evalCase: EvalCase,
  suite: EvalSuite,
  model: string,
  index: number
): BatchRequest | { error: string } {
  const baseParams = {
    model,
    max_tokens: suite.max_tokens ?? 1024,
    ...(suite.system_prompt !== undefined && { system: suite.system_prompt }),
    ...(suite.temperature !== undefined && { temperature: suite.temperature }),
  };

  if (evalCase.prompt !== undefined) {
    return {
      custom_id: String(index),
      params: {
        ...baseParams,
        messages: [{ role: "user" as const, content: evalCase.prompt }],
      },
    };
  }

  if (evalCase.turns) {
    const turns = evalCase.turns;
    // Intermediate null assistant turns require mid-conversation API calls — not batchable
    const hasIntermediateNull = turns
      .slice(0, -1)
      .some((t) => t.role === "assistant" && t.content === null);
    if (hasIntermediateNull) {
      return {
        error:
          "--batch does not support multi-turn cases with intermediate model calls. Use regular run mode for this case.",
      };
    }

    // Build messages from all turns except the final null assistant turn
    const messages: Anthropic.MessageParam[] = turns
      .filter((t) => t.content !== null)
      .map((t) => ({ role: t.role, content: t.content! }));

    return {
      custom_id: String(index),
      params: { ...baseParams, messages },
    };
  }

  return { error: "Case has neither prompt nor turns" };
}

export async function runSuiteBatch(
  suite: EvalSuite,
  config: EvalConfig,
  options: RunOptions = {}
): Promise<RunResult> {
  const model =
    options.model ?? suite.model ?? config.default_model ?? "claude-opus-4-8";
  const provider =
    options.providerOverride ?? suite.provider ?? config.default_provider ?? "anthropic";

  if (provider !== "anthropic") {
    throw new Error(
      `--batch is only supported for the Anthropic provider, but suite uses "${provider}".\n` +
        `  Remove --batch or set provider to "anthropic".`
    );
  }

  // Expand dataset
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

  // Apply filter
  const filteredCases = options.filter
    ? resolvedCases.filter((c) => {
        const f = options.filter!.toLowerCase();
        return (
          (c.id?.toLowerCase().includes(f) ?? false) ||
          (c.tags?.some((t) => t.toLowerCase().includes(f)) ?? false)
        );
      })
    : resolvedCases;

  const runId = randomUUID();
  const timestamp = new Date().toISOString();

  // Build batch requests, recording which indices failed at build time
  const batchRequests: BatchRequest[] = [];
  const buildErrors = new Map<number, string>();

  for (let i = 0; i < filteredCases.length; i++) {
    const req = buildBatchRequest(filteredCases[i], suite, model, i);
    if ("error" in req) {
      buildErrors.set(i, req.error);
    } else {
      batchRequests.push(req);
    }
  }

  const anthropicProvider = new AnthropicProvider(config.anthropic_api_key);

  const batchId = await anthropicProvider.batchSubmit(batchRequests);
  const batchStart = Date.now();

  // Poll with exponential backoff until processing_status === "ended"
  let delay = 5_000;
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    const batch = await anthropicProvider.batchPoll(batchId);
    if (batch.processing_status === "ended") break;
    delay = Math.min(delay * 2, 60_000);
  }

  const batchWallClock = Date.now() - batchStart;

  // Collect results indexed by custom_id
  const resultMap = new Map<string, MessageBatchIndividualResponse>();
  const resultsIterable = await anthropicProvider.batchResults(batchId);
  for await (const item of resultsIterable) {
    resultMap.set(item.custom_id, item);
  }

  // Map each case (in input order) to a CaseResult
  const caseResults: CaseResult[] = [];
  let totalBatchCost = 0;

  for (let i = 0; i < filteredCases.length; i++) {
    const evalCase = filteredCases[i];
    const caseId = evalCase.id ?? `case-${randomUUID().slice(0, 8)}`;
    const isMultiTurn = Array.isArray(evalCase.turns) && evalCase.turns.length > 0;
    const promptLabel = isMultiTurn
      ? `[multi-turn: ${evalCase.turns!.length} turns]`
      : (evalCase.prompt ?? "");

    const makeErrorResult = (error: string): CaseResult => ({
      case_id: caseId,
      prompt: promptLabel,
      model,
      provider,
      output: "",
      grader_results: [],
      passed: false,
      latency_ms: batchWallClock,
      error,
    });

    if (buildErrors.has(i)) {
      caseResults.push(makeErrorResult(buildErrors.get(i)!));
      continue;
    }

    const item = resultMap.get(String(i));
    if (!item) {
      caseResults.push(makeErrorResult("Result missing from batch response"));
      continue;
    }

    const result = item.result;

    if (result.type === "errored") {
      caseResults.push(makeErrorResult(result.error.error.message));
      continue;
    }

    if (result.type === "canceled" || result.type === "expired") {
      caseResults.push(makeErrorResult(`Batch request ${result.type}`));
      continue;
    }

    // result.type === "succeeded"
    const message = result.message;
    const output = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;

    const pricing = ANTHROPIC_PRICING[model];
    // Batch API costs 50% of standard pricing
    const cost_usd = pricing
      ? ((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000) * 0.5
      : undefined;

    if (cost_usd !== undefined) totalBatchCost += cost_usd;

    const grader_results = await runGraders(
      output,
      evalCase.criteria,
      config.judge_model,
      config.anthropic_api_key
    );
    const passed = grader_results.every((r) => r.passed);

    const caseResult: CaseResult = {
      case_id: caseId,
      prompt: promptLabel,
      model,
      provider,
      output,
      grader_results,
      passed,
      latency_ms: batchWallClock,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd,
    };

    options.onCaseResult?.(caseResult, i, filteredCases.length);
    caseResults.push(caseResult);
  }

  const passedCount = caseResults.filter((c) => c.passed).length;
  const total_cost_usd = caseResults.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0);

  return {
    suite_name: suite.name,
    run_id: runId,
    timestamp,
    model,
    provider,
    total: caseResults.length,
    passed: passedCount,
    failed: caseResults.length - passedCount,
    pass_rate: caseResults.length > 0 ? passedCount / caseResults.length : 0,
    total_cost_usd,
    total_latency_ms: batchWallClock,
    cases: caseResults,
    batch_id: batchId,
    batch_cost_usd: totalBatchCost,
  };
}
