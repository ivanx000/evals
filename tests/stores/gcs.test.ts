import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunResult } from "../../src/types.js";

// ─── Mock the Google Cloud Storage SDK so no real network calls are made ──────

const mockSave = vi.fn();
const mockGetFiles = vi.fn();
const mockDownload = vi.fn();
const mockBucket = vi.fn((_name: string) => ({
  file: () => ({ save: mockSave, download: mockDownload }),
  getFiles: mockGetFiles,
}));

vi.mock("@google-cloud/storage", () => {
  class Storage {
    bucket(name: string) {
      return mockBucket(name);
    }
  }
  return { Storage };
});

import { GCSResultsStore } from "../../src/stores/gcs.js";

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    suite_name: "My Suite",
    run_id: "run-1",
    timestamp: "2026-07-28T00:00:00.000Z",
    model: "claude-opus-4-8",
    provider: "anthropic",
    total: 1,
    passed: 1,
    failed: 0,
    pass_rate: 1,
    total_cost_usd: 0,
    total_latency_ms: 10,
    cases: [],
    ...overrides,
  };
}

describe("GCSResultsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── save ─────────────────────────────────────────────────────────────────────

  it("save() writes to bucket/prefix/<timestamp>_<suite>.json and returns a gs:// id", async () => {
    mockSave.mockResolvedValue(undefined);
    const store = new GCSResultsStore("my-bucket", "evals");
    const id = await store.save(makeResult());

    expect(id).toBe("gs://my-bucket/evals/2026-07-28T00-00-00-000Z_my_suite.json");
    expect(mockBucket).toHaveBeenCalledWith("my-bucket");
    const [body, opts] = mockSave.mock.calls[0];
    expect(JSON.parse(body).run_id).toBe("run-1");
    expect(opts).toEqual({ contentType: "application/json" });
  });

  it("save() with an empty prefix writes to the bucket root", async () => {
    mockSave.mockResolvedValue(undefined);
    const store = new GCSResultsStore("my-bucket", "");
    const id = await store.save(makeResult());
    expect(id).toBe("gs://my-bucket/2026-07-28T00-00-00-000Z_my_suite.json");
  });

  // ── list ─────────────────────────────────────────────────────────────────────

  it("list() filters to .json and returns sorted gs:// ids", async () => {
    mockGetFiles.mockResolvedValue([
      [{ name: "evals/b.json" }, { name: "evals/a.json" }, { name: "evals/notes.txt" }],
    ]);
    const store = new GCSResultsStore("my-bucket", "evals");
    const ids = await store.list();
    expect(ids).toEqual(["gs://my-bucket/evals/a.json", "gs://my-bucket/evals/b.json"]);
  });

  it("list() returns an empty array when the prefix has no objects", async () => {
    mockGetFiles.mockResolvedValue([[]]);
    const store = new GCSResultsStore("my-bucket", "evals");
    expect(await store.list()).toEqual([]);
  });

  // ── load ─────────────────────────────────────────────────────────────────────

  it("load() parses bucket and key from a full gs:// URI regardless of constructor bucket", async () => {
    mockDownload.mockResolvedValue([Buffer.from(JSON.stringify(makeResult({ run_id: "loaded-run" })))]);
    const store = new GCSResultsStore("other-bucket", "other-prefix");
    const result = await store.load("gs://my-bucket/evals/a.json");

    expect(result.run_id).toBe("loaded-run");
    expect(mockBucket).toHaveBeenCalledWith("my-bucket");
  });

  // ── error handling ──────────────────────────────────────────────────────────

  it("throws a clear error when the bucket or object is not found", async () => {
    mockGetFiles.mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
    const store = new GCSResultsStore("missing-bucket", "");
    await expect(store.list()).rejects.toThrow(/bucket or object not found.*missing-bucket/i);
  });

  it("throws a clear error when credentials are missing", async () => {
    mockGetFiles.mockRejectedValue(new Error("Could not load the default credentials"));
    const store = new GCSResultsStore("my-bucket", "");
    await expect(store.list()).rejects.toThrow(/Google Cloud credentials not found/);
  });

  it("throws a clear error on access denied", async () => {
    mockGetFiles.mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 }));
    const store = new GCSResultsStore("my-bucket", "");
    await expect(store.list()).rejects.toThrow(/Access denied to GCS bucket "my-bucket"/);
  });
});
