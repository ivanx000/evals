import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BenchmarkReport } from "../../../src/benchmark-types.js";

// ─── Mock the GCS SDK so no real network calls are made ───────────────────────

const mockSave = vi.fn();
const mockGetFiles = vi.fn();
const mockDownload = vi.fn();

vi.mock("@google-cloud/storage", () => {
  return {
    Storage: vi.fn().mockImplementation(() => ({
      bucket: vi.fn().mockImplementation(() => ({
        file: vi.fn().mockImplementation(() => ({
          save: mockSave,
          download: mockDownload,
        })),
        getFiles: mockGetFiles,
      })),
    })),
  };
});

import { GCSBenchmarkStore } from "../../../src/stores/benchmark/gcs.js";

function makeReport(overrides: Partial<BenchmarkReport> = {}): BenchmarkReport {
  return {
    benchmark_name: "CFA Basics",
    benchmark_version: "1.0",
    run_id: "run-1",
    timestamp: "2026-07-28T00:00:00.000Z",
    model: "claude-opus-4-8",
    provider: "anthropic",
    total_tasks: 1,
    duration_ms: 100,
    accuracy: 1,
    by_category: {},
    by_difficulty: {},
    mean_latency_ms: 100,
    estimated_cost_usd: 0.001,
    calibration: null,
    regression: null,
    tasks: [],
    ...overrides,
  };
}

describe("GCSBenchmarkStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("save() nests under prefix/slugified-benchmark-name/ and returns a gs:// id", async () => {
    mockSave.mockResolvedValue(undefined);
    const store = new GCSBenchmarkStore("my-bucket", "reports");
    const id = await store.save(makeReport());

    expect(id).toBe("gs://my-bucket/reports/cfa-basics/2026-07-28T00-00-00-000Z-claude-opus-4-8.json");
    expect(mockSave).toHaveBeenCalledWith(
      expect.stringContaining('"run_id": "run-1"'),
      { contentType: "application/json" }
    );
  });

  it("saveMarkdown() writes a .md sibling with text/markdown content type", async () => {
    mockSave.mockResolvedValue(undefined);
    const store = new GCSBenchmarkStore("my-bucket", "reports");
    const id = await store.saveMarkdown(makeReport(), "# report");

    expect(id).toBe("gs://my-bucket/reports/cfa-basics/2026-07-28T00-00-00-000Z-claude-opus-4-8.md");
    expect(mockSave).toHaveBeenCalledWith("# report", { contentType: "text/markdown" });
  });

  it("list() scopes to the slugified benchmark name when given", async () => {
    mockGetFiles.mockResolvedValue([[{ name: "reports/cfa-basics/a.json" }]]);
    const store = new GCSBenchmarkStore("my-bucket", "reports");
    const ids = await store.list("CFA Basics");

    expect(ids).toEqual(["gs://my-bucket/reports/cfa-basics/a.json"]);
    expect(mockGetFiles).toHaveBeenCalledWith({ prefix: "reports/cfa-basics" });
  });

  it("list() with no benchmark name lists everything under the plain prefix", async () => {
    mockGetFiles.mockResolvedValue([
      [{ name: "reports/cfa-basics/b.json" }, { name: "reports/other/notes.txt" }],
    ]);
    const store = new GCSBenchmarkStore("my-bucket", "reports");
    const ids = await store.list();

    expect(ids).toEqual(["gs://my-bucket/reports/cfa-basics/b.json"]);
    expect(mockGetFiles).toHaveBeenCalledWith({ prefix: "reports" });
  });

  it("load() parses bucket and key from a full gs:// URI", async () => {
    mockDownload.mockResolvedValue([Buffer.from(JSON.stringify(makeReport({ run_id: "loaded-run" })))]);
    const store = new GCSBenchmarkStore("other-bucket", "other-prefix");
    const result = await store.load("gs://my-bucket/reports/cfa-basics/a.json");
    expect(result.run_id).toBe("loaded-run");
  });

  it("throws a clear error when credentials are missing", async () => {
    mockSave.mockRejectedValue(new Error("Could not load the default credentials"));
    const store = new GCSBenchmarkStore("my-bucket", "reports");
    await expect(store.save(makeReport())).rejects.toThrow(/Google Cloud credentials not found/);
  });

  it("throws a clear error on 403", async () => {
    mockGetFiles.mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 }));
    const store = new GCSBenchmarkStore("my-bucket", "reports");
    await expect(store.list()).rejects.toThrow(/Access denied to GCS bucket "my-bucket"/);
  });
});
