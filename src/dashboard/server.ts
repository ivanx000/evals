import express from "express";
import cors from "cors";
import * as path from "path";
import * as fs from "fs";
import { registerRoutes } from "./routes.js";

export interface ServerOptions {
  port: number;
  resultsDir: string;
  reportsDir?: string;
}

export function createServer(opts: ServerOptions): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  registerRoutes(app, opts.resultsDir, opts.reportsDir);

  const uiDist = path.resolve(__dirname, "../../dashboard-ui/dist");
  if (fs.existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(uiDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.send(
        "<h2>Dashboard UI not built.</h2><p>Run <code>npm run build</code> inside <code>dashboard-ui/</code>.</p>"
      );
    });
  }

  return app;
}

export function startServer(opts: ServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = createServer(opts);
    const server = app.listen(opts.port, () => resolve());
    server.on("error", reject);
  });
}
