#!/usr/bin/env node

// Global handler — must be first, before any async work
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(`\nUnexpected error: ${msg}`);
  process.exit(1);
});

import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import { loadConfig } from "./config.js";
import {
  loadSuite,
  runSuite,
  saveResult,
  listResults,
  loadResult,
} from "./runner.js";
import { runSuiteBatch, resumeBatch } from "./batch-runner.js";
import {
  printRunResult,
  printCompareResult,
  printReportList,
  printCaseProgress,
  printDiffResult,
} from "./reporter.js";
import { computeDiff } from "./diff.js";
import {
  runBenchmark,
  saveBenchmarkReportJson,
  listBenchmarkReports,
} from "./benchmark.js";
import {
  printBenchmarkTaskProgress,
  printBenchmarkSummary,
  printBenchmarkList,
  saveBenchmarkReportMarkdown,
} from "./benchmark-reporter.js";
import type { EvalSuite, EvalConfig, RunResult } from "./types.js";

const program = new Command();

program
  .name("evals")
  .description("evals — benchmark and compare LLMs")
  .version("0.1.0");

// ─── API key guard ────────────────────────────────────────────────────────────

function checkApiKeys(suite: EvalSuite, config: EvalConfig, providerOverride?: string): void {
  const provider = providerOverride ?? suite.provider ?? config.default_provider ?? "anthropic";

  if (provider === "anthropic" && !config.anthropic_api_key) {
    console.error("Error: ANTHROPIC_API_KEY is required for the Anthropic provider.");
    console.error("  Set it with:          export ANTHROPIC_API_KEY=sk-ant-...");
    console.error("  Or add to .evalrc.json: { \"anthropic_api_key\": \"sk-ant-...\" }");
    process.exit(1);
  }

  if (provider === "openai" && !config.openai_api_key) {
    console.error("Error: OPENAI_API_KEY is required for the OpenAI provider.");
    console.error("  Set it with:          export OPENAI_API_KEY=sk-...");
    console.error("  Or add to .evalrc.json: { \"openai_api_key\": \"sk-...\" }");
    process.exit(1);
  }

  if (provider === "gemini" && !config.gemini_api_key) {
    console.error("Error: GEMINI_API_KEY is required for the Gemini provider.");
    console.error("  Get a free key at:    https://aistudio.google.com/app/apikey");
    console.error("  Set it with:          export GEMINI_API_KEY=AIza...");
    console.error("  Or add to .evalrc.json: { \"gemini_api_key\": \"AIza...\" }");
    process.exit(1);
  }

  // ollama: no API key needed — skip

  const hasLLMJudge = suite.cases.some((c) =>
    c.criteria.some((cr) => cr.type === "llm_judge")
  );
  if (hasLLMJudge && !config.anthropic_api_key) {
    console.error("Error: ANTHROPIC_API_KEY is required for llm_judge criteria.");
    console.error("  llm_judge always uses Anthropic regardless of the suite provider.");
    console.error("  Set it with: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }
}

// Parse "provider/model" or bare "model" (defaults to fallbackProvider)
function parseProviderModel(
  spec: string,
  fallbackProvider: string
): { provider: string; model: string } {
  const slashIdx = spec.indexOf("/");
  if (slashIdx !== -1) {
    return {
      provider: spec.slice(0, slashIdx),
      model: spec.slice(slashIdx + 1),
    };
  }
  return { provider: fallbackProvider, model: spec };
}

// ── eval run ──────────────────────────────────────────────────────────────────

program
  .command("run <suite>")
  .description("Run an evaluation suite against a model")
  .option("-m, --model <model>", "Override model specified in suite")
  .option("-w, --watch", "Re-run suite on file change")
  .option("--no-cache", "Disable semantic cache")
  .option("-v, --verbose", "Show full outputs and judge reasoning")
  .option("--json <path>", "Also save raw JSON result to a specific path")
  .option("-o, --output <path>", "Override the results save path (default: ./results/<timestamp>.json)")
  .option("--filter <substring>", "Run only cases whose ID or tag matches the substring")
  .option("--dataset <path>", "Override the dataset path specified in the suite YAML")
  .option("--timeout <ms>", "Per-case timeout in milliseconds (default: 30000)", "30000")
  .option("--concurrency <n>", "Run N cases in parallel (default: 1)", "1")
  .option("--dry-run", "Validate YAML and print what would run, without calling any API")
  .option("--batch", "Submit all cases to the Anthropic Batches API (50% cost, async, Anthropic-only)")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (suitePath: string, opts: {
    model?: string;
    watch?: boolean;
    cache: boolean;
    verbose?: boolean;
    json?: string;
    output?: string;
    filter?: string;
    dataset?: string;
    timeout: string;
    concurrency: string;
    dryRun?: boolean;
    batch?: boolean;
    config?: string;
  }) => {
    const config = loadConfig(opts.config);
    const resolvedSuite = path.resolve(suitePath);

    async function execute(): Promise<void> {
      try {
        const suite = loadSuite(resolvedSuite);

        if (opts.dryRun) {
          const provider = suite.provider ?? config.default_provider ?? "anthropic";
          const model = opts.model ?? suite.model ?? config.default_model ?? "claude-opus-4-8";
          const cases = opts.filter
            ? suite.cases.filter((c) => {
                const f = opts.filter!.toLowerCase();
                return (c.id?.toLowerCase().includes(f) ?? false) ||
                  (c.tags?.some((t) => t.toLowerCase().includes(f)) ?? false);
              })
            : suite.cases;

          const datasetPath = opts.dataset ?? suite.dataset;
          console.log(`\nDry run — no API calls will be made`);
          console.log(`Suite:    ${suite.name}`);
          console.log(`Provider: ${provider}`);
          console.log(`Model:    ${model}`);
          if (datasetPath) console.log(`Dataset:  ${datasetPath}${suite.dataset_limit ? ` (limit: ${suite.dataset_limit})` : ""}${suite.dataset_sample ? ` (sample: ${suite.dataset_sample})` : ""}`);
          if (opts.filter) console.log(`Filter:   "${opts.filter}" (${cases.length}/${suite.cases.length} template(s) match)`);
          console.log(`\nCase templates (${cases.length}):`);
          cases.forEach((c, i) => {
            const id = c.id ?? `case-${i + 1}`;
            const criteria = c.criteria.map((cr) => cr.type).join(", ");
            const promptDisplay = c.turns
              ? `[multi-turn: ${c.turns.length} turns]`
              : (c.prompt ?? "").slice(0, 70) + ((c.prompt ?? "").length > 70 ? "…" : "");
            console.log(`  [${i + 1}] ${id}`);
            console.log(`       Prompt:   ${promptDisplay}`);
            console.log(`       Criteria: ${criteria}`);
          });
          return;
        }

        checkApiKeys(suite, config);

        if (opts.batch) {
          const effectiveProvider =
            suite.provider ?? config.default_provider ?? "anthropic";
          if (effectiveProvider !== "anthropic") {
            console.error(
              `Error: --batch requires the Anthropic provider, but suite uses "${effectiveProvider}".`
            );
            console.error(`  Remove --batch or set provider to "anthropic".`);
            process.exitCode = 1;
            return;
          }
        }

        const datasetLabel = opts.dataset ?? suite.dataset;
        const caseCountLabel = datasetLabel ? `templates → dataset: ${datasetLabel}` : `${suite.cases.length} cases`;
        const modeLabel = opts.batch ? " [batch mode]" : "";
        console.log(`\nRunning suite: ${suite.name} (${caseCountLabel})${modeLabel}`);

        const result = opts.batch
          ? await runSuiteBatch(suite, config, {
              model: opts.model,
              filter: opts.filter,
              datasetOverride: opts.dataset,
              onCaseResult: printCaseProgress,
            })
          : await runSuite(suite, config, {
              model: opts.model,
              noCache: !opts.cache,
              verbose: opts.verbose,
              timeout: parseInt(opts.timeout, 10),
              concurrency: parseInt(opts.concurrency, 10),
              filter: opts.filter,
              datasetOverride: opts.dataset,
              onCaseResult: printCaseProgress,
            });

        printRunResult(result, opts.verbose);

        if (opts.output) {
          const dir = path.dirname(path.resolve(opts.output));
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(opts.output, JSON.stringify(result, null, 2));
          console.log(`Results saved → ${opts.output}`);
        } else {
          const savedPath = saveResult(result, config.results_dir ?? "./results");
          console.log(`Results saved → ${savedPath}`);
        }

        if (opts.json) {
          fs.writeFileSync(opts.json, JSON.stringify(result, null, 2));
          console.log(`JSON also saved → ${opts.json}`);
        }

        if (result.failed > 0) process.exitCode = 1;
      } catch (err) {
        console.error(`\nError: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    }

    await execute();

    if (opts.watch) {
      console.log(`\nWatching ${resolvedSuite} for changes…`);
      let debounce: ReturnType<typeof setTimeout> | null = null;
      fs.watch(resolvedSuite, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(async () => {
          console.log(`\nFile changed — re-running…`);
          await execute();
        }, 300);
      });
    }
  });

// ── eval compare ─────────────────────────────────────────────────────────────

program
  .command("compare <suite>")
  .description("Run a suite across multiple models and compare results")
  .requiredOption("--models <models>", "Comma-separated list of model IDs (use provider/model for mixed providers)")
  .option("--provider <provider>", "Default provider when no provider/ prefix is given (anthropic|openai|ollama)", "anthropic")
  .option("--no-cache", "Disable semantic cache")
  .option("-v, --verbose", "Show full outputs")
  .option("--timeout <ms>", "Per-case timeout in milliseconds (default: 30000)", "30000")
  .option("--concurrency <n>", "Run N cases in parallel per model (default: 1)", "1")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (suitePath: string, opts: {
    models: string;
    provider: string;
    cache: boolean;
    verbose?: boolean;
    timeout: string;
    concurrency: string;
    config?: string;
  }) => {
    const config = loadConfig(opts.config);
    const modelSpecs = opts.models.split(",").map((m) => m.trim()).filter(Boolean);

    if (modelSpecs.length < 2) {
      console.error("Error: --models requires at least 2 comma-separated model IDs");
      process.exitCode = 1;
      return;
    }

    const parsed = modelSpecs.map((spec) => parseProviderModel(spec, opts.provider));

    try {
      const suite = loadSuite(path.resolve(suitePath));

      // Check API keys for each unique provider being used
      const uniqueProviders = [...new Set(parsed.map((p) => p.provider))];
      for (const p of uniqueProviders) {
        checkApiKeys(suite, config, p);
      }

      console.log(`\nComparing ${parsed.length} models on suite: ${suite.name}`);

      const results: RunResult[] = [];

      for (const { provider, model } of parsed) {
        console.log(`\n  Model: ${provider}/${model}`);
        const result = await runSuite(suite, config, {
          model,
          providerOverride: provider,
          noCache: !opts.cache,
          verbose: opts.verbose,
          timeout: parseInt(opts.timeout, 10),
          concurrency: parseInt(opts.concurrency, 10),
          onCaseResult: (r, i, total) => {
            const status = r.passed ? "✓" : "✗";
            process.stdout.write(`    [${i + 1}/${total}] ${status} `);
            if (i === total - 1) console.log("");
          },
        });
        saveResult(result, config.results_dir ?? "./results");
        results.push(result);
      }

      printCompareResult(results);
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

// ── eval report ──────────────────────────────────────────────────────────────

program
  .command("report")
  .description("List and display stored evaluation results")
  .option("-n, --last <n>", "Show last N results", "10")
  .option("--suite <name>", "Filter by suite name (partial match)")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action((opts: {
    last: string;
    suite?: string;
    config?: string;
  }) => {
    const config = loadConfig(opts.config);
    const resultsDir = config.results_dir ?? "./results";
    const files = listResults(resultsDir);

    if (files.length === 0) {
      console.log("\nNo results found. Run 'eval run <suite.yaml>' first.");
      return;
    }

    let results = files.map(loadResult);

    if (opts.suite) {
      results = results.filter((r) =>
        r.suite_name.toLowerCase().includes(opts.suite!.toLowerCase())
      );
    }

    const n = parseInt(opts.last, 10);
    if (!isNaN(n) && n > 0) {
      results = results.slice(-n);
    }

    printReportList(results);
  });

// ── eval dashboard ────────────────────────────────────────────────────────────

program
  .command("dashboard")
  .description("Spin up a local web dashboard to visualize eval results")
  .option("-p, --port <port>", "Port to listen on (default: 3000)", "3000")
  .option("-d, --results-dir <dir>", "Results directory (default: ./results)", "./results")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (opts: { port: string; resultsDir: string; config?: string }) => {
    const config = loadConfig(opts.config);
    const resultsDir = path.resolve(opts.resultsDir ?? config.results_dir ?? "./results");
    const port = parseInt(opts.port, 10);

    const { startServer } = await import("./dashboard/server.js");
    // open is ESM-only in recent versions — dynamic import handles both
    const openModule = await import("open");
    const open = openModule.default;

    try {
      await startServer({ port, resultsDir });
      const url = `http://localhost:${port}`;
      console.log(`\nDashboard running at ${url}`);
      console.log(`Results directory: ${resultsDir}`);
      console.log("\nPress Ctrl+C to stop.\n");
      await open(url);
    } catch (err) {
      console.error(`\nFailed to start dashboard: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

// ── eval diff ─────────────────────────────────────────────────────────────────

program
  .command("diff <baseline> <candidate>")
  .description("Compare two result files and report regressions and improvements")
  .option("--format <fmt>", "Output format: table (default) or json", "table")
  .action((baselinePath: string, candidatePath: string, opts: { format: string }) => {
    try {
      const baseline = loadResult(path.resolve(baselinePath));
      const candidate = loadResult(path.resolve(candidatePath));
      const diff = computeDiff(baseline, candidate);

      if (opts.format === "json") {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        printDiffResult(diff);
      }

      if (diff.regressions.length > 0) process.exitCode = 1;
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

// ── eval providers ────────────────────────────────────────────────────────────

program
  .command("providers")
  .description("Show configured providers and their status")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (opts: { config?: string }) => {
    const config = loadConfig(opts.config);

    const Table = (await import("cli-table3")).default;
    const table = new Table({
      head: ["Provider", "Status", "Notes"],
      style: { head: ["cyan"] },
    });

    // Anthropic
    const hasAnthropic = !!config.anthropic_api_key;
    table.push([
      "anthropic",
      hasAnthropic ? "✅ ready" : "⚠️  no key",
      hasAnthropic ? "API key set" : "Set ANTHROPIC_API_KEY",
    ]);

    // OpenAI
    const hasOpenAI = !!config.openai_api_key;
    table.push([
      "openai",
      hasOpenAI ? "✅ ready" : "⚠️  no key",
      hasOpenAI ? "API key set" : "Set OPENAI_API_KEY",
    ]);

    // Gemini
    const hasGemini = !!config.gemini_api_key;
    table.push([
      "gemini",
      hasGemini ? "✅ ready" : "⚠️  no key",
      hasGemini ? "API key set" : "Get free key: aistudio.google.com",
    ]);

    // Ollama — ping /api/tags
    const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
    try {
      const res = await fetch(`${ollamaHost}/api/tags`);
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        const modelCount = data.models?.length ?? 0;
        const modelList = modelCount > 0
          ? data.models!.map((m) => m.name).slice(0, 3).join(", ") + (modelCount > 3 ? ", …" : "")
          : "no models pulled";
        table.push([
          "ollama",
          "✅ running",
          `${modelCount} model${modelCount !== 1 ? "s" : ""} available: ${modelList}`,
        ]);
      } else {
        table.push(["ollama", "❌ error", `Unexpected response: ${res.status}`]);
      }
    } catch {
      table.push([
        "ollama",
        "❌ offline",
        `Not running at ${ollamaHost} — install: https://ollama.com`,
      ]);
    }

    console.log("\n" + table.toString() + "\n");
  });

// ── eval benchmark ────────────────────────────────────────────────────────────

const benchmarkCmd = program
  .command("benchmark")
  .description("Run and manage domain-specific benchmark suites");

benchmarkCmd
  .command("run <name>")
  .description("Run a benchmark suite (looks for benchmarks/<name>/tasks.yaml)")
  .option("--provider <provider>", "LLM provider (anthropic|openai|ollama|gemini)")
  .option("-m, --model <model>", "Model to benchmark")
  .option("--report-dir <dir>", "Directory to save reports (default: ./reports)", "./reports")
  .option("--regression-threshold <pct>", "Accuracy drop % that flags a regression (default: 5)", "5")
  .option("--concurrency <n>", "Run N tasks in parallel (default: 1)", "1")
  .option("--timeout <ms>", "Per-task timeout in milliseconds (default: 60000)", "60000")
  .option("--no-cache", "Disable semantic cache")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (
    name: string,
    opts: {
      provider?: string;
      model?: string;
      reportDir: string;
      regressionThreshold: string;
      concurrency: string;
      timeout: string;
      cache: boolean;
      config?: string;
    }
  ) => {
    const config = loadConfig(opts.config);
    const provider = opts.provider ?? config.default_provider ?? "anthropic";
    const model = opts.model ?? config.default_model ?? "claude-opus-4-8";

    // API key guard
    if (provider === "anthropic" && !config.anthropic_api_key) {
      console.error("Error: ANTHROPIC_API_KEY is required for the Anthropic provider.");
      process.exit(1);
    }
    if (provider === "openai" && !config.openai_api_key) {
      console.error("Error: OPENAI_API_KEY is required for the OpenAI provider.");
      process.exit(1);
    }
    if (provider === "gemini" && !config.gemini_api_key) {
      console.error("Error: GEMINI_API_KEY is required for the Gemini provider.");
      process.exit(1);
    }
    // llm_judge always uses Anthropic
    if (!config.anthropic_api_key) {
      console.error("Error: ANTHROPIC_API_KEY is required for llm_judge scoring.");
      process.exit(1);
    }

    const benchmarkDir = path.resolve(`benchmarks/${name}`);
    if (!fs.existsSync(benchmarkDir)) {
      console.error(`Error: Benchmark not found at ${benchmarkDir}`);
      console.error(`  Create benchmarks/${name}/tasks.yaml to define a benchmark.`);
      process.exit(1);
    }

    const reportDir = path.resolve(opts.reportDir);

    console.log(`\nRunning benchmark: ${name}`);
    console.log(`  Model:    ${model} / ${provider}`);
    console.log(`  Tasks:    ${benchmarkDir}/tasks.yaml`);
    console.log(`  Reports:  ${reportDir}\n`);

    try {
      const report = await runBenchmark(benchmarkDir, config, {
        model,
        provider,
        noCache: !opts.cache,
        concurrency: parseInt(opts.concurrency, 10),
        timeout: parseInt(opts.timeout, 10),
        reportsDir: reportDir,
        regressionThreshold: parseFloat(opts.regressionThreshold),
        onTaskResult: printBenchmarkTaskProgress,
      });

      printBenchmarkSummary(report);

      const jsonPath = saveBenchmarkReportJson(report, reportDir);
      const mdPath = saveBenchmarkReportMarkdown(report, reportDir);
      console.log(`Reports saved:`);
      console.log(`  JSON: ${jsonPath}`);
      console.log(`  MD:   ${mdPath}\n`);

      if (report.regression?.threshold_exceeded) {
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

benchmarkCmd
  .command("list")
  .description("List saved benchmark reports")
  .option("--report-dir <dir>", "Directory to scan for reports (default: ./reports)", "./reports")
  .option("--benchmark <name>", "Filter by benchmark name")
  .action((opts: { reportDir: string; benchmark?: string }) => {
    const reportDir = path.resolve(opts.reportDir);
    const reports = listBenchmarkReports(reportDir, opts.benchmark);
    printBenchmarkList(reports);
  });

// ── eval batch ────────────────────────────────────────────────────────────────

program
  .command("batch <batchId> <suite>")
  .description("Re-attach to an in-progress or completed Anthropic batch and save results")
  .option("-m, --model <model>", "Model used when the batch was submitted (for cost calculation)")
  .option("--filter <substring>", "Same filter used when batch was submitted (if any)")
  .option("--dataset <path>", "Same dataset override used when batch was submitted (if any)")
  .option("-o, --output <path>", "Override the results save path (default: ./results/<timestamp>.json)")
  .option("-v, --verbose", "Show full outputs and judge reasoning")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (batchId: string, suitePath: string, opts: {
    model?: string;
    filter?: string;
    dataset?: string;
    output?: string;
    verbose?: boolean;
    config?: string;
  }) => {
    const config = loadConfig(opts.config);

    if (!config.anthropic_api_key) {
      console.error("Error: ANTHROPIC_API_KEY is required for batch resume.");
      console.error("  Set it with:           export ANTHROPIC_API_KEY=sk-ant-...");
      console.error("  Or add to .evalrc.json: { \"anthropic_api_key\": \"sk-ant-...\" }");
      process.exitCode = 1;
      return;
    }

    try {
      const suite = loadSuite(path.resolve(suitePath));

      console.log(`\nResuming batch: ${batchId}`);
      console.log(`Suite: ${suite.name}`);
      if (opts.filter) console.log(`Filter: "${opts.filter}"`);

      const result = await resumeBatch(batchId, suite, config, {
        model: opts.model,
        filter: opts.filter,
        datasetOverride: opts.dataset,
        onCaseResult: printCaseProgress,
      });

      printRunResult(result, opts.verbose);

      if (opts.output) {
        const dir = path.dirname(path.resolve(opts.output));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(opts.output, JSON.stringify(result, null, 2));
        console.log(`Results saved → ${opts.output}`);
      } else {
        const savedPath = saveResult(result, config.results_dir ?? "./results");
        console.log(`Results saved → ${savedPath}`);
      }

      if (result.failed > 0) process.exitCode = 1;
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
