import type { BenchmarkReport } from "../../benchmark-types.js";
import type { BenchmarkReportStore } from "./types.js";
import { slugify, reportBaseName } from "./types.js";
import { loadAwsSdk, formatS3Error } from "../s3.js";

function parseS3Location(id: string, fallbackBucket: string): { bucket: string; key: string } {
  if (id.startsWith("s3://")) {
    const rest = id.slice("s3://".length);
    const slash = rest.indexOf("/");
    if (slash === -1) throw new Error(`Invalid S3 URI (missing key): ${id}`);
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return { bucket: fallbackBucket, key: id };
}

export class S3BenchmarkStore implements BenchmarkReportStore {
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
    const { S3Client, PutObjectCommand } = await loadAwsSdk();
    try {
      const client = new S3Client({});
      await client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
      );
    } catch (err) {
      throw formatS3Error(err, this.bucket);
    }
    return `s3://${this.bucket}/${key}`;
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
    const { S3Client, ListObjectsV2Command } = await loadAwsSdk();
    const client = new S3Client({});
    const trimmed = this.trimmedPrefix();
    const prefix = benchmarkName
      ? [trimmed, slugify(benchmarkName)].filter(Boolean).join("/")
      : trimmed;
    const ids: string[] = [];
    try {
      let continuationToken: string | undefined;
      do {
        const resp = await client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix || undefined,
            ContinuationToken: continuationToken,
          })
        );
        for (const obj of resp.Contents ?? []) {
          if (obj.Key && obj.Key.endsWith(".json")) {
            ids.push(`s3://${this.bucket}/${obj.Key}`);
          }
        }
        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch (err) {
      throw formatS3Error(err, this.bucket);
    }
    return ids.sort();
  }

  async load(id: string): Promise<BenchmarkReport> {
    const { S3Client, GetObjectCommand } = await loadAwsSdk();
    const { bucket, key } = parseS3Location(id, this.bucket);
    try {
      const client = new S3Client({});
      const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await resp.Body!.transformToString();
      return JSON.parse(body) as BenchmarkReport;
    } catch (err) {
      throw formatS3Error(err, bucket);
    }
  }
}
