import * as fs from "fs";
import * as path from "path";
import type { Request, Response } from "express";
import type { RunResult } from "../types.js";
import { computeDiff } from "../diff.js";

interface RunSummary {
  id: string;
  timestamp: string;
  suite_name: string;
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  models: string[];
}

function loadAllRuns(resultsDir: string): RunResult[] {
  if (!fs.existsSync(resultsDir)) return [];
  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(resultsDir, f), "utf-8");
    return JSON.parse(raw) as RunResult;
  });
}

function toSummary(run: RunResult): RunSummary {
  const avgLatency =
    run.cases.length > 0
      ? run.cases.reduce((s, c) => s + c.latency_ms, 0) / run.cases.length
      : 0;
  return {
    id: run.run_id,
    timestamp: run.timestamp,
    suite_name: run.suite_name,
    total: run.total,
    passed: run.passed,
    failed: run.failed,
    pass_rate: run.pass_rate,
    avg_latency_ms: Math.round(avgLatency),
    total_cost_usd: run.total_cost_usd,
    models: [...new Set(run.cases.map((c) => c.model))],
  };
}

export function makeApiHandlers(resultsDir: string) {
  return {
    listRuns(req: Request, res: Response): void {
      try {
        const runs = loadAllRuns(resultsDir);
        const summaries = runs
          .map(toSummary)
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        res.json(summaries);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },

    getRun(req: Request, res: Response): void {
      try {
        const { id } = req.params;
        const runs = loadAllRuns(resultsDir);
        const run = runs.find((r) => r.run_id === id);
        if (!run) {
          res.status(404).json({ error: "Run not found" });
          return;
        }
        res.json(run);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },

    compareRuns(req: Request, res: Response): void {
      try {
        const runIds = String(req.query.runIds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (runIds.length < 2) {
          res.status(400).json({ error: "Provide at least 2 runIds" });
          return;
        }
        const allRuns = loadAllRuns(resultsDir);
        const selected = runIds
          .map((id) => allRuns.find((r) => r.run_id === id))
          .filter((r): r is RunResult => r !== undefined);

        const caseMap = new Map<
          string,
          { runId: string; model: string; output: string; passed: boolean; latency_ms: number }[]
        >();

        for (const run of selected) {
          for (const c of run.cases) {
            const key = c.case_id;
            if (!caseMap.has(key)) caseMap.set(key, []);
            caseMap.get(key)!.push({
              runId: run.run_id,
              model: c.model,
              output: c.output,
              passed: c.passed,
              latency_ms: c.latency_ms,
            });
          }
        }

        const result = Array.from(caseMap.entries()).map(([caseName, results]) => ({
          caseName,
          results,
        }));

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },

    diffRuns(req: Request, res: Response): void {
      try {
        const baseline = String(req.query.baseline ?? "").trim();
        const candidate = String(req.query.candidate ?? "").trim();
        if (!baseline || !candidate) {
          res.status(400).json({ error: "Provide baseline and candidate run IDs" });
          return;
        }
        const allRuns = loadAllRuns(resultsDir);
        const baselineRun = allRuns.find((r) => r.run_id === baseline);
        const candidateRun = allRuns.find((r) => r.run_id === candidate);
        if (!baselineRun) {
          res.status(404).json({ error: `Baseline run not found: ${baseline}` });
          return;
        }
        if (!candidateRun) {
          res.status(404).json({ error: `Candidate run not found: ${candidate}` });
          return;
        }
        res.json(computeDiff(baselineRun, candidateRun));
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  };
}
