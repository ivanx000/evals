import type { RunResult } from "../types.js";
import type { ResultsStore } from "./types.js";

// Loaded lazily so the CLI's default install never pulls in the AWS SDK —
// only users who configure an s3:// results_dir pay for it.
export async function loadAwsSdk() {
  try {
    return await import("@aws-sdk/client-s3");
  } catch {
    throw new Error(
      "S3 results storage requires the @aws-sdk/client-s3 package.\n" +
        "  Install it with: npm install @aws-sdk/client-s3"
    );
  }
}

export function formatS3Error(err: unknown, bucket: string): Error {
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode;
  const message = e.message ?? String(err);

  if (e.name === "CredentialsProviderError" || /could not load credentials/i.test(message)) {
    return new Error(
      "AWS credentials not found.\n" +
        "  Set them via env vars: export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...\n" +
        "  Or configure ~/.aws/credentials, or run in an environment with an IAM role attached."
    );
  }
  if (/region/i.test(message) && /missing|could not be found/i.test(message)) {
    return new Error(
      "AWS region not configured.\n" +
        "  Set it with: export AWS_REGION=us-east-1 (use your bucket's region)."
    );
  }
  if (e.name === "NoSuchBucket") {
    return new Error(
      `S3 bucket not found: "${bucket}".\n` +
        `  Check the bucket name in results_dir (s3://${bucket}/...) and that it exists in the configured region.`
    );
  }
  if (e.name === "NoSuchKey") {
    return new Error(`Result not found in bucket "${bucket}".`);
  }
  if (e.name === "AccessDenied" || status === 403) {
    return new Error(
      `Access denied to S3 bucket "${bucket}".\n` +
        "  Check your AWS credentials have s3:GetObject/PutObject/ListBucket permissions on this bucket."
    );
  }
  return new Error(`S3 error: ${message}`);
}

function parseS3Location(id: string, fallbackBucket: string): { bucket: string; key: string } {
  if (id.startsWith("s3://")) {
    const rest = id.slice("s3://".length);
    const slash = rest.indexOf("/");
    if (slash === -1) throw new Error(`Invalid S3 URI (missing key): ${id}`);
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return { bucket: fallbackBucket, key: id };
}

export class S3ResultsStore implements ResultsStore {
  constructor(
    private bucket: string,
    private prefix: string
  ) {}

  private key(filename: string): string {
    const trimmed = this.prefix.replace(/^\/+|\/+$/g, "");
    return trimmed ? `${trimmed}/${filename}` : filename;
  }

  async save(result: RunResult): Promise<string> {
    const { S3Client, PutObjectCommand } = await loadAwsSdk();
    const ts = result.timestamp.replace(/[:.]/g, "-");
    const filename = `${ts}_${result.suite_name.replace(/\s+/g, "_").toLowerCase()}.json`;
    const key = this.key(filename);
    try {
      const client = new S3Client({});
      await client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: JSON.stringify(result, null, 2),
          ContentType: "application/json",
        })
      );
    } catch (err) {
      throw formatS3Error(err, this.bucket);
    }
    return `s3://${this.bucket}/${key}`;
  }

  async list(): Promise<string[]> {
    const { S3Client, ListObjectsV2Command } = await loadAwsSdk();
    const client = new S3Client({});
    const prefix = this.prefix.replace(/^\/+|\/+$/g, "");
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

  async load(id: string): Promise<RunResult> {
    const { S3Client, GetObjectCommand } = await loadAwsSdk();
    const { bucket, key } = parseS3Location(id, this.bucket);
    try {
      const client = new S3Client({});
      const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await resp.Body!.transformToString();
      return JSON.parse(body) as RunResult;
    } catch (err) {
      throw formatS3Error(err, bucket);
    }
  }
}
