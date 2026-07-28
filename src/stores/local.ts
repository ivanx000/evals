import * as fs from "fs";
import * as path from "path";
import type { RunResult } from "../types.js";
import type { ResultsStore } from "./types.js";

export class LocalResultsStore implements ResultsStore {
  constructor(private dir: string) {}

  async save(result: RunResult): Promise<string> {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    const ts = result.timestamp.replace(/[:.]/g, "-");
    const filename = `${ts}_${result.suite_name.replace(/\s+/g, "_").toLowerCase()}.json`;
    const filePath = path.join(this.dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    return filePath;
  }

  async list(): Promise<string[]> {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(this.dir, f))
      .sort();
  }

  async load(id: string): Promise<RunResult> {
    try {
      return JSON.parse(fs.readFileSync(id, "utf-8")) as RunResult;
    } catch (err) {
      throw new Error(`Cannot read result file: ${id}\n  ${(err as Error).message}`);
    }
  }
}
