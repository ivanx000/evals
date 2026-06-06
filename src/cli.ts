#!/usr/bin/env node
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
import type { RunResult } from "./types.js";

const program = new Command();

program
  .name("eval")
  .description("LLM Evaluation Framework — pytest for LLM outputs")
  .version("0.1.0");

// ── eval run ──────────────────────────────────────────────────────────────────

program
  .command("run <suite>")
  .description("Run an evaluation suite against a model")
  .option("-m, --model <model>", "Override model specified in suite")
  .option("-w, --watch", "Re-run suite on file change")
  .option("--no-cache", "Disable semantic cache")
  .option("-v, --verbose", "Show full outputs and judge reasoning")
  .option("--json <path>", "Save raw JSON result to a specific path")
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (suitePath: string, opts: {
    model?: string;
    watch?: boolean;
    cache: boolean;
    verbose?: boolean;
    json?: string;
    config?: string;
  }) => {
    const config = loadConfig(opts.config);
    const resolvedSuite = path.resolve(suitePath);

    async function execute() {
      try {
        const suite = loadSuite(resolvedSuite);
        console.log(`\nRunning suite: ${suite.name} (${suite.cases.length} cases)`);

        const result = await runSuite(suite, config, {
          model: opts.model,
          noCache: !opts.cache,
          verbose: opts.verbose,
          onCaseResult: printCaseProgress,
        });

        printRunResult(result, opts.verbose);

        const savedPath = saveResult(result, config.results_dir ?? "./results");
        console.log(`Results saved → ${savedPath}`);

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
  .option("-c, --config <path>", "Path to .evalrc.json config file")
  .action(async (suitePath: string, opts: {
    models: string;
    provider: string;
    cache: boolean;
    verbose?: boolean;
    config?: string;
  }) => {
    const config = loadConfig(opts.config);
    const models = opts.models.split(",").map((m) => m.trim()).filter(Boolean);

    if (models.length < 2) {
      console.error("Error: --models requires at least 2 comma-separated model IDs");
      process.exitCode = 1;
      return;
    }

    const suite = loadSuite(path.resolve(suitePath));
    console.log(`\nComparing ${models.length} models on suite: ${suite.name}`);

    const results: RunResult[] = [];

    for (const model of models) {
      console.log(`\n  Model: ${model}`);
      const result = await runSuite(suite, config, {
        model,
        noCache: !opts.cache,
        verbose: opts.verbose,
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
  });

// ── eval report ──────────────────────────────────────────────────────────────

program
  .command("report")
  .description("List and display stored evaluation results")
  .option("-n, --last <n>", "Show last N results", "10")
  .option("--suite <name>", "Filter by suite name")
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
