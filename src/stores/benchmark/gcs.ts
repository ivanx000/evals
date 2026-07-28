import type { BenchmarkReport } from "../../benchmark-types.js";
import type { BenchmarkReportStore } from "./types.js";
import { slugify, reportBaseName } from "./types.js";
import { loadGcsSdk, formatGcsError } from "../gcs.js";

function parseGcsLocation(id: string, fallbackBucket: string): { bucket: string; key: string } {
  if (id.startsWith("gs://")) {
    const rest = id.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash === -1) throw new Error(`Invalid GCS URI (missing key): ${id}`);
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return { bucket: fallbackBucket, key: id };
}

export class GCSBenchmarkStore implements BenchmarkReportStore {
  constructor(
    private bucket: string,
    private prefix: string
  ) {}

  private trimmedPrefix(): string {
    return this.prefix.replace(/^\/+|\/+$/g, "");
  }

  private key(benchmarkName: string, filename: string): string {
    const trimmed = this.trimmedPrefix();
    const parts = [trimmed, slugify(benchmarkName), filename].filter(Boolean);
    return parts.join("/");
  }

  private async put(key: string, body: string, contentType: string): Promise<string> {
    const { Storage } = await loadGcsSdk();
    try {
      const storage = new Storage();
      await storage.bucket(this.bucket).file(key).save(body, { contentType });
    } catch (err) {
      throw formatGcsError(err, this.bucket);
    }
    return `gs://${this.bucket}/${key}`;
  }

  async save(report: BenchmarkReport): Promise<string> {
    const key = this.key(report.benchmark_name, `${reportBaseName(report)}.json`);
    return this.put(key, JSON.stringify(report, null, 2), "application/json");
  }

  async saveMarkdown(report: BenchmarkReport, markdown: string): Promise<string> {
    const key = this.key(report.benchmark_name, `${reportBaseName(report)}.md`);
    return this.put(key, markdown, "text/markdown");
  }

  async list(benchmarkName?: string): Promise<string[]> {
    const { Storage } = await loadGcsSdk();
    const trimmed = this.trimmedPrefix();
    const prefix = benchmarkName
      ? [trimmed, slugify(benchmarkName)].filter(Boolean).join("/")
      : trimmed;
    try {
      const storage = new Storage();
      const [files] = await storage.bucket(this.bucket).getFiles({ prefix: prefix || undefined });
      return files
        .filter((f) => f.name.endsWith(".json"))
        .map((f) => `gs://${this.bucket}/${f.name}`)
        .sort();
    } catch (err) {
      throw formatGcsError(err, this.bucket);
    }
  }

  async load(id: string): Promise<BenchmarkReport> {
    const { Storage } = await loadGcsSdk();
    const { bucket, key } = parseGcsLocation(id, this.bucket);
    try {
      const storage = new Storage();
      const [contents] = await storage.bucket(bucket).file(key).download();
      return JSON.parse(contents.toString("utf-8")) as BenchmarkReport;
    } catch (err) {
      throw formatGcsError(err, bucket);
    }
  }
}
