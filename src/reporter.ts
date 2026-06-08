import Table from "cli-table3";
import type { RunResult, CaseResult } from "./types.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function usd(n: number): string {
  return `$${n.toFixed(6)}`;
}

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n}ms`;
}

function passIcon(passed: boolean): string {
  return passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function printRunResult(result: RunResult, verbose = false): void {
  const passColor = result.pass_rate === 1 ? GREEN : result.pass_rate >= 0.5 ? YELLOW : RED;

  console.log("");
  console.log(
    `${BOLD}${CYAN}Suite:${RESET} ${result.suite_name}  ${DIM}[${result.model} / ${result.provider}]${RESET}`
  );
  console.log(
    `${BOLD}Run ID:${RESET} ${DIM}${result.run_id}${RESET}   ${BOLD}At:${RESET} ${DIM}${result.timestamp}${RESET}`
  );
  console.log("");

  // ── Case table ──────────────────────────────────────────────────────────────
  const table = new Table({
    head: [
      `${BOLD}#${RESET}`,
      `${BOLD}Case ID${RESET}`,
      `${BOLD}Status${RESET}`,
      `${BOLD}Criteria${RESET}`,
      `${BOLD}Latency${RESET}`,
      `${BOLD}Cost${RESET}`,
      `${BOLD}Prompt (truncated)${RESET}`,
    ],
    colWidths: [4, 20, 8, 30, 10, 12, 36],
    wordWrap: false,
    style: { head: [], border: ["dim"] },
  });

  result.cases.forEach((c, i) => {
    const criteriaStr = c.grader_results
      .map((g) => `${passIcon(g.passed)} ${g.criteria_type}${g.score !== undefined ? ` (${g.score}/5)` : ""}`)
      .join("\n");

    table.push([
      String(i + 1),
      truncate(c.case_id, 18),
      c.error ? `${RED}ERROR${RESET}` : passIcon(c.passed),
      criteriaStr || DIM + "n/a" + RESET,
      ms(c.latency_ms) + (c.cached ? ` ${DIM}(cached)${RESET}` : ""),
      c.cost_usd !== undefined ? usd(c.cost_usd) : DIM + "—" + RESET,
      truncate(c.prompt, 34),
    ]);

    if (verbose && c.output) {
      table.push([
        { colSpan: 7, content: `  ${DIM}Output:${RESET} ${truncate(c.output, 200)}` },
      ]);
    }

    if (verbose && c.error) {
      table.push([
        { colSpan: 7, content: `  ${RED}Error:${RESET} ${c.error}` },
      ]);
    }

    if (verbose) {
      for (const g of c.grader_results) {
        if (g.reasoning) {
          table.push([
            { colSpan: 7, content: `  ${DIM}Judge reasoning:${RESET} ${g.reasoning}` },
          ]);
        }
        if (g.detail) {
          table.push([
            { colSpan: 7, content: `  ${DIM}Detail:${RESET} ${g.detail}` },
          ]);
        }
      }
    }
  });

  console.log(table.toString());

  // ── Summary bar ─────────────────────────────────────────────────────────────
  console.log("");
  const summaryTable = new Table({
    head: [
      `${BOLD}Total${RESET}`,
      `${BOLD}Passed${RESET}`,
      `${BOLD}Failed${RESET}`,
      `${BOLD}Pass Rate${RESET}`,
      `${BOLD}Total Cost${RESET}`,
      `${BOLD}Total Latency${RESET}`,
    ],
    style: { head: [], border: ["dim"] },
  });

  summaryTable.push([
    String(result.total),
    `${GREEN}${result.passed}${RESET}`,
    result.failed > 0 ? `${RED}${result.failed}${RESET}` : String(result.failed),
    `${passColor}${pct(result.pass_rate)}${RESET}`,
    usd(result.total_cost_usd),
    ms(result.total_latency_ms),
  ]);

  console.log(summaryTable.toString());

  const avgLatency = result.total > 0 ? Math.round(result.total_latency_ms / result.total) : 0;
  const passColor = result.pass_rate === 1 ? GREEN : result.pass_rate >= 0.5 ? YELLOW : RED;
  console.log(
    `${passColor}${result.passed}/${result.total} passed (${pct(result.pass_rate)})${RESET}` +
    ` — avg latency: ${ms(avgLatency)}` +
    ` — est. cost: ${usd(result.total_cost_usd)}`
  );
  console.log("");
}

export function printCompareResult(results: RunResult[]): void {
  if (results.length === 0) {
    console.log("No results to compare.");
    return;
  }

  console.log("");
  console.log(`${BOLD}${CYAN}Model Comparison${RESET}`);
  console.log(`${DIM}Suite: ${results[0].suite_name}${RESET}`);
  console.log("");

  const table = new Table({
    head: [
      `${BOLD}Model${RESET}`,
      `${BOLD}Provider${RESET}`,
      `${BOLD}Pass Rate${RESET}`,
      `${BOLD}Passed${RESET}`,
      `${BOLD}Failed${RESET}`,
      `${BOLD}Total Cost${RESET}`,
      `${BOLD}Avg Latency${RESET}`,
    ],
    style: { head: [], border: ["dim"] },
  });

  for (const r of results) {
    const passColor = r.pass_rate === 1 ? GREEN : r.pass_rate >= 0.5 ? YELLOW : RED;
    const avgLatency = r.total > 0 ? r.total_latency_ms / r.total : 0;
    table.push([
      r.model,
      r.provider,
      `${passColor}${pct(r.pass_rate)}${RESET}`,
      `${GREEN}${r.passed}${RESET}`,
      r.failed > 0 ? `${RED}${r.failed}${RESET}` : String(r.failed),
      usd(r.total_cost_usd),
      ms(avgLatency),
    ]);
  }

  console.log(table.toString());
  console.log("");

  // Per-case breakdown across models
  const caseIds = results[0].cases.map((c) => c.case_id);
  if (caseIds.length > 1) {
    console.log(`${BOLD}Per-case breakdown:${RESET}`);
    const breakdownTable = new Table({
      head: [`${BOLD}Case${RESET}`, ...results.map((r) => `${BOLD}${truncate(r.model, 20)}${RESET}`)],
      style: { head: [], border: ["dim"] },
    });

    for (let i = 0; i < caseIds.length; i++) {
      const row: string[] = [truncate(caseIds[i], 20)];
      for (const r of results) {
        const c = r.cases[i];
        row.push(c ? passIcon(c.passed) : DIM + "—" + RESET);
      }
      breakdownTable.push(row);
    }
    console.log(breakdownTable.toString());
    console.log("");
  }
}

export function printReportList(results: RunResult[]): void {
  if (results.length === 0) {
    console.log(`${DIM}No results found. Run 'eval run <suite.yaml>' first.${RESET}`);
    return;
  }

  console.log("");
  console.log(`${BOLD}${CYAN}Stored Results${RESET}`);
  console.log("");

  const table = new Table({
    head: [
      `${BOLD}#${RESET}`,
      `${BOLD}Suite${RESET}`,
      `${BOLD}Model${RESET}`,
      `${BOLD}Pass Rate${RESET}`,
      `${BOLD}Total${RESET}`,
      `${BOLD}Cost${RESET}`,
      `${BOLD}Timestamp${RESET}`,
    ],
    style: { head: [], border: ["dim"] },
  });

  results.forEach((r, i) => {
    const passColor = r.pass_rate === 1 ? GREEN : r.pass_rate >= 0.5 ? YELLOW : RED;
    table.push([
      String(i + 1),
      truncate(r.suite_name, 24),
      truncate(r.model, 22),
      `${passColor}${pct(r.pass_rate)}${RESET}`,
      String(r.total),
      usd(r.total_cost_usd),
      r.timestamp,
    ]);
  });

  console.log(table.toString());
  console.log("");
}

export function printCaseProgress(
  result: CaseResult,
  index: number,
  total: number
): void {
  const status = result.error
    ? `${RED}ERROR${RESET}`
    : result.passed
    ? `${GREEN}PASS${RESET}`
    : `${RED}FAIL${RESET}`;
  const cached = result.cached ? ` ${DIM}[cached]${RESET}` : "";
  console.log(
    `  [${index + 1}/${total}] ${status}${cached}  ${DIM}${truncate(result.case_id, 30)}${RESET}  ${ms(result.latency_ms)}`
  );
}
