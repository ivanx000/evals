import type { BenchmarkReport } from "../../benchmark-types.js";

// A BenchmarkReportStore persists BenchmarkReport JSON (and an optional
// human-facing Markdown twin) the same way ResultsStore persists RunResult —
// `save`/`saveMarkdown` return a self-sufficient id, `load` resolves it back
// on any store (see makeBenchmarkStore in ./index.ts).
//
// Unlike ResultsStore, list() takes an optional benchmark name: reports nest
// under a per-benchmark-name subdirectory (or key prefix, for S3/GCS), and
// regression detection (findPreviousReport in ../../benchmark.ts) only ever
// needs one benchmark's history — scoping the listing avoids paying for a
// full bucket scan (or reading every report ever saved) on every run.
export interface BenchmarkReportStore {
  save(report: BenchmarkReport): Promise<string>;
  saveMarkdown(report: BenchmarkReport, markdown: string): Promise<string>;
  list(benchmarkName?: string): Promise<string[]>;
  load(id: string): Promise<BenchmarkReport>;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function reportBaseName(report: BenchmarkReport): string {
  const ts = report.timestamp.replace(/[:.]/g, "-");
  const modelSlug = report.model.replace(/\//g, "-");
  return `${ts}-${modelSlug}`;
}
