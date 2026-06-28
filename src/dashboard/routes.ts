import type { Express } from "express";
import { makeApiHandlers } from "./api.js";

export function registerRoutes(app: Express, resultsDir: string, reportsDir?: string): void {
  const handlers = makeApiHandlers(resultsDir, reportsDir);

  app.get("/api/runs", (req, res) => handlers.listRuns(req, res));
  app.get("/api/runs/:id", (req, res) => handlers.getRun(req, res));
  app.get("/api/compare", (req, res) => handlers.compareRuns(req, res));
  app.get("/api/diff", (req, res) => handlers.diffRuns(req, res));
  app.get("/api/benchmarks", (req, res) => handlers.listBenchmarks(req, res));
  app.get("/api/benchmarks/:id", (req, res) => handlers.getBenchmark(req, res));
}
