import type { Express } from "express";
import { makeApiHandlers } from "./api.js";

export function registerRoutes(app: Express, resultsDir: string): void {
  const handlers = makeApiHandlers(resultsDir);

  app.get("/api/runs", (req, res) => handlers.listRuns(req, res));
  app.get("/api/runs/:id", (req, res) => handlers.getRun(req, res));
  app.get("/api/compare", (req, res) => handlers.compareRuns(req, res));
}
