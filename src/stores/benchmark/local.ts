import * as fs from "fs";
import * as path from "path";
import type { BenchmarkReport } from "../../benchmark-types.js";
import type { BenchmarkReportStore } from "./types.js";
import { slugify, reportBaseName } from "./types.js";

export class LocalBenchmarkStore implements BenchmarkReportStore {
  constructor(private dir: string) {}

  async save(report: BenchmarkReport): Promise<string> {
    const benchDir = path.join(this.dir, slugify(report.benchmark_name));
    if (!fs.existsSync(benchDir)) fs.mkdirSync(benchDir, { recursive: true });
    const filePath = path.join(benchDir, `${reportBaseName(report)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    return filePath;
  }

  async saveMarkdown(report: BenchmarkReport, markdown: string): Promise<string> {
    const benchDir = path.join(this.dir, slugify(report.benchmark_name));
    if (!fs.existsSync(benchDir)) fs.mkdirSync(benchDir, { recursive: true });
    const filePath = path.join(benchDir, `${reportBaseName(report)}.md`);
    fs.writeFileSync(filePath, markdown);
    return filePath;
  }

  async list(benchmarkName?: string): Promise<string[]> {
    if (!fs.existsSync(this.dir)) return [];

    const benchDirs = benchmarkName
      ? [slugify(benchmarkName)]
      : fs.readdirSync(this.dir).filter((d) => fs.statSync(path.join(this.dir, d)).isDirectory());

    const ids: string[] = [];
    for (const d of benchDirs) {
      const full = path.join(this.dir, d);
      if (!fs.existsSync(full)) continue;
      for (const f of fs.readdirSync(full).filter((f) => f.endsWith(".json"))) {
        ids.push(path.join(full, f));
      }
    }
    return ids.sort();
  }

  async load(id: string): Promise<BenchmarkReport> {
    try {
      return JSON.parse(fs.readFileSync(id, "utf-8")) as BenchmarkReport;
    } catch (err) {
      throw new Error(`Cannot read benchmark report file: ${id}\n  ${(err as Error).message}`);
    }
  }
}
