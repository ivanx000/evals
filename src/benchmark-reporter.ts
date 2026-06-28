import * as fs from "fs";
import * as path from "path";
import type { BenchmarkReport, BenchmarkSummary } from "./benchmark-types.js";

// ─── Terminal colors ───────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function pct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n}ms`;
}

function passColor(rate: number): string {
  return rate >= 0.8 ? GREEN : rate >= 0.5 ? YELLOW : RED;
}

// ─── Terminal progress ─────────────────────────────────────────────────────────

export function printBenchmarkTaskProgress(
  taskId: string,
  passed: boolean,
  index: number,
  total: number
): void {
  const status = passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  console.log(`  [${index + 1}/${total}] ${status}  ${DIM}${taskId}${RESET}`);
}

// ─── Terminal summary ──────────────────────────────────────────────────────────

export function printBenchmarkSummary(report: BenchmarkReport): void {
  console.log("");
  console.log(
    `${BOLD}${CYAN}Benchmark:${RESET} ${report.benchmark_name} v${report.benchmark_version}`
  );
  console.log(
    `${BOLD}Model:${RESET}     ${DIM}${report.model} / ${report.provider}${RESET}`
  );
  console.log(
    `${BOLD}Run ID:${RESET}    ${DIM}${report.run_id}${RESET}`
  );
  console.log("");

  // Overall accuracy
  const color = passColor(report.accuracy);
  console.log(
    `${BOLD}Overall accuracy:${RESET} ${color}${pct(report.accuracy)}${RESET}` +
    ` (${report.tasks.filter((t) => t.passed).length}/${report.total_tasks} passed)` +
    `  |  avg latency: ${ms(report.mean_latency_ms)}` +
    `  |  est. cost: $${report.estimated_cost_usd.toFixed(6)}`
  );
  console.log("");

  // By category
  console.log(`${BOLD}By category:${RESET}`);
  for (const [cat, m] of Object.entries(report.by_category)) {
    const c = passColor(m.pass_rate);
    console.log(
      `  ${cat.padEnd(28)} ${c}${String(m.passed).padStart(2)}/${m.total}${RESET}  ${c}${pct(m.pass_rate)}${RESET}`
    );
  }
  console.log("");

  // By difficulty
  console.log(`${BOLD}By difficulty:${RESET}`);
  for (const [diff, m] of Object.entries(report.by_difficulty)) {
    const c = passColor(m.pass_rate);
    console.log(
      `  ${diff.padEnd(28)} ${c}${String(m.passed).padStart(2)}/${m.total}${RESET}  ${c}${pct(m.pass_rate)}${RESET}`
    );
  }
  console.log("");

  // Calibration
  if (report.calibration && report.calibration.interpretation !== "insufficient-data") {
    const bs = report.calibration.brier_score.toFixed(4);
    const interp = report.calibration.interpretation;
    const interpColor = interp === "well-calibrated" ? GREEN : YELLOW;
    console.log(
      `${BOLD}Calibration:${RESET}  Brier score ${BOLD}${bs}${RESET}` +
      `  —  ${interpColor}${interp}${RESET}` +
      `  (${report.calibration.n_samples} llm_judge samples)`
    );
    console.log("");
  }

  // Regression
  if (report.regression) {
    const r = report.regression;
    const deltaColor = r.accuracy_delta >= 0 ? GREEN : RED;
    const sign = r.accuracy_delta >= 0 ? "+" : "";
    console.log(
      `${BOLD}Regression vs ${DIM}${r.previous_timestamp.slice(0, 10)}${RESET}${BOLD}:${RESET}` +
      `  accuracy ${deltaColor}${sign}${pct(r.accuracy_delta)}${RESET}`
    );
    if (r.regressed_tasks.length > 0) {
      console.log(`  ${RED}Regressed (${r.regressed_tasks.length}):${RESET} ${r.regressed_tasks.join(", ")}`);
    }
    if (r.improved_tasks.length > 0) {
      console.log(`  ${GREEN}Improved (${r.improved_tasks.length}):${RESET} ${r.improved_tasks.join(", ")}`);
    }
    if (r.threshold_exceeded) {
      console.log(`  ${RED}${BOLD}⚠  Accuracy dropped more than threshold — review required.${RESET}`);
    }
    console.log("");
  }

  // Per-task breakdown (compact)
  console.log(`${BOLD}Per-task results:${RESET}`);
  for (const t of report.tasks) {
    const icon = t.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const conf = t.confidence !== undefined ? `  conf:${t.confidence}` : "";
    console.log(
      `  ${icon}  ${t.task_id.padEnd(32)} ${DIM}[${t.category} / ${t.difficulty}]${conf}${RESET}`
    );
  }
  console.log("");
}

// ─── Markdown report ───────────────────────────────────────────────────────────

function mdPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function interpretBrierScore(score: number): string {
  if (score < 0.10) return "excellent calibration";
  if (score < 0.15) return "good calibration";
  if (score < 0.20) return "moderate calibration";
  return "poor calibration";
}

export function generateMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  const date = report.timestamp.slice(0, 10);
  const durationSec = (report.duration_ms / 1000).toFixed(1);

  lines.push(`# ${report.benchmark_name} Benchmark Report`);
  lines.push("");
  lines.push(`> Generated ${date} · ${report.model} (${report.provider}) · v${report.benchmark_version}`);
  lines.push("");

  // Run metadata
  lines.push("## Run Metadata");
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Model | \`${report.model}\` |`);
  lines.push(`| Provider | ${report.provider} |`);
  lines.push(`| Run ID | \`${report.run_id}\` |`);
  lines.push(`| Date | ${date} |`);
  lines.push(`| Total Tasks | ${report.total_tasks} |`);
  lines.push(`| Duration | ${durationSec}s |`);
  lines.push(`| Estimated Cost | $${report.estimated_cost_usd.toFixed(6)} |`);
  lines.push("");

  // Score summary
  lines.push("## Score Summary");
  lines.push("");
  lines.push(`**Overall accuracy: ${mdPct(report.accuracy)}** (${report.tasks.filter((t) => t.passed).length}/${report.total_tasks} tasks passed)`);
  lines.push(`**Mean latency:** ${ms(report.mean_latency_ms)} per task`);
  lines.push("");

  // Category breakdown
  lines.push("### By Category");
  lines.push("");
  const categories = Object.keys(report.by_category).sort();
  lines.push(`| Category | Passed | Total | Pass Rate |`);
  lines.push(`|---|---|---|---|`);
  for (const cat of categories) {
    const m = report.by_category[cat];
    lines.push(`| ${cat.replace(/_/g, " ")} | ${m.passed} | ${m.total} | ${mdPct(m.pass_rate)} |`);
  }
  lines.push("");

  // Difficulty breakdown
  lines.push("### By Difficulty");
  lines.push("");
  lines.push(`| Difficulty | Passed | Total | Pass Rate |`);
  lines.push(`|---|---|---|---|`);
  for (const diff of ["easy", "medium", "hard"]) {
    const m = report.by_difficulty[diff];
    if (!m) continue;
    lines.push(`| ${diff} | ${m.passed} | ${m.total} | ${mdPct(m.pass_rate)} |`);
  }
  lines.push("");

  // Calibration
  lines.push("## Calibration");
  lines.push("");
  if (!report.calibration) {
    lines.push("_No LLM-judge tasks in this run — calibration score not applicable._");
  } else if (report.calibration.interpretation === "insufficient-data") {
    lines.push(`_Insufficient data (${report.calibration.n_samples} samples) for reliable calibration._`);
  } else {
    const { brier_score, interpretation, n_samples, pairs } = report.calibration;
    lines.push(`**Brier Score: ${brier_score.toFixed(4)}** — ${interpretBrierScore(brier_score)} (${interpretation})`);
    lines.push(`_Lower is better. A perfect forecaster scores 0.0; random 50/50 guessing scores 0.25._`);
    lines.push(`_Computed over ${n_samples} LLM-judge tasks with model-expressed confidence._`);
    lines.push("");

    if (pairs.length > 0) {
      lines.push("| Task | Confidence | Outcome |");
      lines.push("|---|---|---|");
      for (const p of pairs) {
        lines.push(`| ${p.task_id} | ${p.confidence}% | ${p.passed ? "✅ pass" : "❌ fail"} |`);
      }
    }
  }
  lines.push("");

  // Regression
  lines.push("## Regression vs Previous Run");
  lines.push("");
  if (!report.regression) {
    lines.push("_No previous run found for this benchmark + model combination._");
  } else {
    const r = report.regression;
    const sign = r.accuracy_delta >= 0 ? "+" : "";
    lines.push(`**Baseline run:** \`${r.previous_run_id}\` (${r.previous_timestamp.slice(0, 10)}, model: ${r.previous_model})`);
    lines.push("");
    lines.push(`| Metric | Delta |`);
    lines.push(`|---|---|`);
    lines.push(`| Accuracy | ${sign}${mdPct(r.accuracy_delta)} |`);
    lines.push(`| Mean latency | ${r.latency_delta_ms >= 0 ? "+" : ""}${ms(Math.abs(r.latency_delta_ms))} |`);
    lines.push(`| Estimated cost | ${r.cost_delta_usd >= 0 ? "+" : ""}$${r.cost_delta_usd.toFixed(6)} |`);
    lines.push("");

    if (r.regressed_tasks.length > 0) {
      lines.push(`**⚠ Regressions (${r.regressed_tasks.length}):** ${r.regressed_tasks.map((t) => `\`${t}\``).join(", ")}`);
    } else {
      lines.push("**No regressions detected.**");
    }
    if (r.improved_tasks.length > 0) {
      lines.push(`**Improvements (${r.improved_tasks.length}):** ${r.improved_tasks.map((t) => `\`${t}\``).join(", ")}`);
    }
    if (r.threshold_exceeded) {
      lines.push("");
      lines.push("> ⚠ **Accuracy dropped beyond the configured threshold.** Manual review recommended.");
    }
  }
  lines.push("");

  // Per-task breakdown
  lines.push("## Per-Task Breakdown");
  lines.push("");
  lines.push(`| # | Task | Category | Difficulty | Grader | Pass | Latency | Confidence | Model Answer (truncated) |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|`);

  report.tasks.forEach((t, i) => {
    const icon = t.passed ? "✅" : "❌";
    const conf = t.confidence !== undefined ? `${t.confidence}%` : "—";
    const answer = t.model_answer.replace(/\n/g, " ").slice(0, 80) + (t.model_answer.length > 80 ? "…" : "");
    lines.push(
      `| ${i + 1} | \`${t.task_id}\` | ${t.category.replace(/_/g, " ")} | ${t.difficulty} | ${t.grader_type} | ${icon} | ${ms(t.latency_ms)} | ${conf} | ${answer} |`
    );
  });
  lines.push("");

  // Detailed task breakdown (for LLM judge tasks)
  const judgedTasks = report.tasks.filter((t) => t.grader_type === "llm_judge");
  if (judgedTasks.length > 0) {
    lines.push("## LLM Judge Task Details");
    lines.push("");
    for (const t of judgedTasks) {
      const icon = t.passed ? "✅" : "❌";
      lines.push(`### ${icon} \`${t.task_id}\``);
      lines.push("");
      lines.push(`**Category:** ${t.category.replace(/_/g, " ")} · **Difficulty:** ${t.difficulty}`);
      lines.push("");
      lines.push("**Question:**");
      lines.push("> " + t.question.trim().replace(/\n/g, "\n> "));
      lines.push("");
      lines.push("**Reference answer:**");
      lines.push("> " + t.reference_answer.trim().replace(/\n/g, "\n> "));
      lines.push("");
      lines.push("**Model answer:**");
      lines.push("```");
      lines.push(t.model_answer.trim());
      lines.push("```");
      lines.push("");
      for (const g of t.grader_results) {
        if (g.score !== undefined) {
          lines.push(`**Judge score:** ${g.score}/5 — ${g.passed ? "PASS" : "FAIL"}`);
        }
        if (g.reasoning) {
          lines.push(`**Reasoning:** ${g.reasoning}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function saveBenchmarkReportMarkdown(
  report: BenchmarkReport,
  reportsDir: string
): string {
  const benchSlug = report.benchmark_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const dir = path.join(reportsDir, benchSlug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ts = report.timestamp.replace(/[:.]/g, "-");
  const modelSlug = report.model.replace(/\//g, "-");
  const filename = `${ts}-${modelSlug}.md`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, generateMarkdownReport(report));
  return filePath;
}

// ─── Terminal report list ──────────────────────────────────────────────────────

export function printBenchmarkList(reports: BenchmarkReport[]): void {
  if (reports.length === 0) {
    console.log("\nNo benchmark reports found.");
    return;
  }

  console.log("");
  console.log(`${BOLD}${CYAN}Benchmark Reports${RESET}`);
  console.log("");

  for (const r of reports) {
    const color = passColor(r.accuracy);
    const bs = r.calibration?.brier_score?.toFixed(4) ?? "—";
    console.log(
      `  ${DIM}${r.timestamp.slice(0, 16)}${RESET}  ` +
      `${BOLD}${r.benchmark_name}${RESET}  ` +
      `${DIM}${r.model}${RESET}  ` +
      `${color}${pct(r.accuracy)}${RESET}  ` +
      `BS:${bs}  ` +
      `${DIM}${r.run_id.slice(0, 8)}…${RESET}`
    );
  }
  console.log("");
}

// ─── Summary conversion ────────────────────────────────────────────────────────

export function toSummary(report: BenchmarkReport): BenchmarkSummary {
  return {
    run_id: report.run_id,
    benchmark_name: report.benchmark_name,
    benchmark_version: report.benchmark_version,
    timestamp: report.timestamp,
    model: report.model,
    provider: report.provider,
    total_tasks: report.total_tasks,
    accuracy: report.accuracy,
    mean_latency_ms: report.mean_latency_ms,
    estimated_cost_usd: report.estimated_cost_usd,
    brier_score: report.calibration?.brier_score ?? null,
  };
}
