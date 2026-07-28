import { describe, it, expect } from "vitest";
import { makeBenchmarkStore } from "../../../src/stores/benchmark/index.js";
import { LocalBenchmarkStore } from "../../../src/stores/benchmark/local.js";
import { S3BenchmarkStore } from "../../../src/stores/benchmark/s3.js";
import { GCSBenchmarkStore } from "../../../src/stores/benchmark/gcs.js";

describe("makeBenchmarkStore", () => {
  it("returns a LocalBenchmarkStore for a plain path", () => {
    expect(makeBenchmarkStore("./reports")).toBeInstanceOf(LocalBenchmarkStore);
    expect(makeBenchmarkStore("/abs/path/reports")).toBeInstanceOf(LocalBenchmarkStore);
  });

  it("returns an S3BenchmarkStore for an s3:// URI", () => {
    expect(makeBenchmarkStore("s3://my-bucket/reports")).toBeInstanceOf(S3BenchmarkStore);
  });

  it("returns a GCSBenchmarkStore for a gs:// URI", () => {
    expect(makeBenchmarkStore("gs://my-bucket/reports")).toBeInstanceOf(GCSBenchmarkStore);
  });

  it("treats an s3:// URI with no prefix as bucket root", () => {
    expect(() => makeBenchmarkStore("s3://my-bucket")).not.toThrow();
  });
});
