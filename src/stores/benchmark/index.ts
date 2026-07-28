import type { BenchmarkReportStore } from "./types.js";
import { LocalBenchmarkStore } from "./local.js";
import { S3BenchmarkStore } from "./s3.js";
import { GCSBenchmarkStore } from "./gcs.js";
import { parseBucketUri } from "../uri.js";

export type { BenchmarkReportStore } from "./types.js";

// `location` is either a local directory path or an `s3://bucket/prefix` /
// `gs://bucket/prefix` URI — same scheme convention as makeResultsStore
// (src/stores/index.ts).
export function makeBenchmarkStore(location: string): BenchmarkReportStore {
  if (location.startsWith("s3://")) {
    const { bucket, prefix } = parseBucketUri(location, "s3://");
    return new S3BenchmarkStore(bucket, prefix);
  }
  if (location.startsWith("gs://")) {
    const { bucket, prefix } = parseBucketUri(location, "gs://");
    return new GCSBenchmarkStore(bucket, prefix);
  }
  return new LocalBenchmarkStore(location);
}
