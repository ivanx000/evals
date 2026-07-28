import type { RunResult } from "../types.js";
import type { ResultsStore } from "./types.js";

// Loaded lazily so the CLI's default install never pulls in the GCS client —
// only users who configure a gs:// results_dir pay for it.
export async function loadGcsSdk() {
  try {
    return await import("@google-cloud/storage");
  } catch {
    throw new Error(
      "GCS results storage requires the @google-cloud/storage package.\n" +
        "  Install it with: npm install @google-cloud/storage"
    );
  }
}

export function formatGcsError(err: unknown, bucket: string): Error {
  const e = err as { code?: number | string; message?: string };
  const message = e.message ?? String(err);

  if (/could not load the default credentials/i.test(message)) {
    return new Error(
      "Google Cloud credentials not found.\n" +
        "  Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file,\n" +
        "  or run: gcloud auth application-default login"
    );
  }
  if (e.code === 404) {
    return new Error(
      `GCS bucket or object not found ("${bucket}").\n` +
        `  Check the bucket name in results_dir (gs://${bucket}/...) and that it exists.`
    );
  }
  if (e.code === 403) {
    return new Error(
      `Access denied to GCS bucket "${bucket}".\n` +
        "  Check your Google Cloud credentials have Storage Object Admin/Viewer permissions."
    );
  }
  return new Error(`GCS error: ${message}`);
}

function parseGcsLocation(id: string, fallbackBucket: string): { bucket: string; key: string } {
  if (id.startsWith("gs://")) {
    const rest = id.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash === -1) throw new Error(`Invalid GCS URI (missing key): ${id}`);
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return { bucket: fallbackBucket, key: id };
}

export class GCSResultsStore implements ResultsStore {
  constructor(
    private bucket: string,
    private prefix: string
  ) {}

  private key(filename: string): string {
    const trimmed = this.prefix.replace(/^\/+|\/+$/g, "");
    return trimmed ? `${trimmed}/${filename}` : filename;
  }

  async save(result: RunResult): Promise<string> {
    const { Storage } = await loadGcsSdk();
    const ts = result.timestamp.replace(/[:.]/g, "-");
    const filename = `${ts}_${result.suite_name.replace(/\s+/g, "_").toLowerCase()}.json`;
    const key = this.key(filename);
    try {
      const storage = new Storage();
      await storage
        .bucket(this.bucket)
        .file(key)
        .save(JSON.stringify(result, null, 2), { contentType: "application/json" });
    } catch (err) {
      throw formatGcsError(err, this.bucket);
    }
    return `gs://${this.bucket}/${key}`;
  }

  async list(): Promise<string[]> {
    const { Storage } = await loadGcsSdk();
    const prefix = this.prefix.replace(/^\/+|\/+$/g, "");
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

  async load(id: string): Promise<RunResult> {
    const { Storage } = await loadGcsSdk();
    const { bucket, key } = parseGcsLocation(id, this.bucket);
    try {
      const storage = new Storage();
      const [contents] = await storage.bucket(bucket).file(key).download();
      return JSON.parse(contents.toString("utf-8")) as RunResult;
    } catch (err) {
      throw formatGcsError(err, bucket);
    }
  }
}
