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
import {
  printRunResult,
  printCompareResult,
  printReportList,
  printCaseProgress,
} from "./reporter.js";
import type { EvalSuite, EvalConfig, RunResult } from "./types.js";

const program = new Command();

program
  .name("eval")
  .description("LLM Evaluation Framework — pytest for LLM outputs")
  .version("0.1.0");

// ─── API key guard ────────────────────────────────────────────────────────────

function checkApiKeys(suite: EvalSuite, config: EvalConfig): void {
  const provider = suite.provider ?? config.default_provider ?? "anthropic";

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
  .option("--timeout <ms>", "Per-case timeout in milliseconds (default: 30000)", "30000")
  .option("--concurrency <n>", "Run N cases in parallel (default: 1)", "1")
  .option("--dry-run", "Validate YAML and print what would run, without calling any API")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (suitePath: string, opts: {
    model?: string;
    watch?: boolean;
    cache: boolean;
    verbose?: boolean;
    json?: string;
    output?: string;
    filter?: string;
    timeout: string;
    concurrency: string;
    dryRun?: boolean;
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

          console.log(`\nDry run — no API calls will be made`);
          console.log(`Suite:    ${suite.name}`);
          console.log(`Provider: ${provider}`);
          console.log(`Model:    ${model}`);
          if (opts.filter) console.log(`Filter:   "${opts.filter}" (${cases.length}/${suite.cases.length} cases match)`);
          console.log(`\nCases (${cases.length}):`);
          cases.forEach((c, i) => {
            const id = c.id ?? `case-${i + 1}`;
            const criteria = c.criteria.map((cr) => cr.type).join(", ");
            console.log(`  [${i + 1}] ${id}`);
            console.log(`       Prompt:   ${c.prompt.slice(0, 70)}${c.prompt.length > 70 ? "…" : ""}`);
            console.log(`       Criteria: ${criteria}`);
          });
          return;
        }

        checkApiKeys(suite, config);

        console.log(`\nRunning suite: ${suite.name} (${suite.cases.length} cases)`);

        const result = await runSuite(suite, config, {
          model: opts.model,
          noCache: !opts.cache,
          verbose: opts.verbose,
          timeout: parseInt(opts.timeout, 10),
          concurrency: parseInt(opts.concurrency, 10),
          filter: opts.filter,
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
  .requiredOption("--models <models>", "Comma-separated list of model IDs to compare")
  .option("--provider <provider>", "Provider to use for all models (anthropic|openai)", "anthropic")
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
    const models = opts.models.split(",").map((m) => m.trim()).filter(Boolean);

    if (models.length < 2) {
      console.error("Error: --models requires at least 2 comma-separated model IDs");
      process.exitCode = 1;
      return;
    }

    try {
      const suite = loadSuite(path.resolve(suitePath));
      checkApiKeys(suite, config);
      console.log(`\nComparing ${models.length} models on suite: ${suite.name}`);

      const results: RunResult[] = [];

      for (const model of models) {
        console.log(`\n  Model: ${model}`);
        const result = await runSuite(suite, config, {
          model,
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

program.parse(process.argv);
