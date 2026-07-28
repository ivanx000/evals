import { describe, it, expect } from "vitest";
import { makeResultsStore } from "../../src/stores/index.js";
import { LocalResultsStore } from "../../src/stores/local.js";
import { S3ResultsStore } from "../../src/stores/s3.js";
import { GCSResultsStore } from "../../src/stores/gcs.js";

describe("makeResultsStore", () => {
  it("returns a LocalResultsStore for a plain path", () => {
    expect(makeResultsStore("./results")).toBeInstanceOf(LocalResultsStore);
    expect(makeResultsStore("/abs/path/results")).toBeInstanceOf(LocalResultsStore);
  });

  it("returns an S3ResultsStore for an s3:// URI", () => {
    expect(makeResultsStore("s3://my-bucket/evals")).toBeInstanceOf(S3ResultsStore);
  });

  it("returns a GCSResultsStore for a gs:// URI", () => {
    expect(makeResultsStore("gs://my-bucket/evals")).toBeInstanceOf(GCSResultsStore);
  });

  it("treats an s3:// URI with no prefix as bucket root", () => {
    // Bucket-only URIs should not throw during construction.
    expect(() => makeResultsStore("s3://my-bucket")).not.toThrow();
  });
});
