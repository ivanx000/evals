import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BenchmarkReport } from "../../../src/benchmark-types.js";

// ─── Mock the AWS SDK so no real network calls are made ───────────────────────

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  class ListObjectsV2Command {
    constructor(public input: Record<string, unknown>) {}
  }
  class GetObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand,
  };
});

import { S3BenchmarkStore } from "../../../src/stores/benchmark/s3.js";
import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

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

describe("S3BenchmarkStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── save ─────────────────────────────────────────────────────────────────────

  it("save() nests the key under prefix/slugified-benchmark-name/ and returns an s3:// id", async () => {
    mockSend.mockResolvedValue({});
    const store = new S3BenchmarkStore("my-bucket", "reports");
    const id = await store.save(makeReport());

    expect(id).toBe("s3://my-bucket/reports/cfa-basics/2026-07-28T00-00-00-000Z-claude-opus-4-8.json");
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.Bucket).toBe("my-bucket");
    expect(cmd.input.Key).toBe("reports/cfa-basics/2026-07-28T00-00-00-000Z-claude-opus-4-8.json");
    expect(JSON.parse(cmd.input.Body as string).run_id).toBe("run-1");
  });

  it("save() with an empty prefix writes directly under the benchmark subfolder", async () => {
    mockSend.mockResolvedValue({});
    const store = new S3BenchmarkStore("my-bucket", "");
    const id = await store.save(makeReport());
    expect(id).toBe("s3://my-bucket/cfa-basics/2026-07-28T00-00-00-000Z-claude-opus-4-8.json");
  });

  it("saveMarkdown() writes a .md sibling with text/markdown content type", async () => {
    mockSend.mockResolvedValue({});
    const store = new S3BenchmarkStore("my-bucket", "reports");
    const id = await store.saveMarkdown(makeReport(), "# report");

    expect(id).toBe("s3://my-bucket/reports/cfa-basics/2026-07-28T00-00-00-000Z-claude-opus-4-8.md");
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Body).toBe("# report");
    expect(cmd.input.ContentType).toBe("text/markdown");
  });

  // ── list ─────────────────────────────────────────────────────────────────────

  it("list() scopes the Prefix to the slugified benchmark name when given", async () => {
    mockSend.mockResolvedValue({
      Contents: [{ Key: "reports/cfa-basics/a.json" }],
      IsTruncated: false,
    });
    const store = new S3BenchmarkStore("my-bucket", "reports");
    const ids = await store.list("CFA Basics");

    expect(ids).toEqual(["s3://my-bucket/reports/cfa-basics/a.json"]);
    expect(mockSend.mock.calls[0][0].input.Prefix).toBe("reports/cfa-basics");
  });

  it("list() with no benchmark name uses the plain prefix and paginates", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/cfa-basics/b.json" }, { Key: "reports/other/notes.txt" }],
        IsTruncated: true,
        NextContinuationToken: "token-2",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "reports/other/a.json" }],
        IsTruncated: false,
      });

    const store = new S3BenchmarkStore("my-bucket", "reports");
    const ids = await store.list();

    expect(ids).toEqual([
      "s3://my-bucket/reports/cfa-basics/b.json",
      "s3://my-bucket/reports/other/a.json",
    ]);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(mockSend.mock.calls[0][0].input.Prefix).toBe("reports");
  });

  // ── load ─────────────────────────────────────────────────────────────────────

  it("load() parses bucket and key from a full s3:// URI regardless of constructor bucket", async () => {
    mockSend.mockResolvedValue({
      Body: { transformToString: async () => JSON.stringify(makeReport({ run_id: "loaded-run" })) },
    });
    const store = new S3BenchmarkStore("other-bucket", "other-prefix");
    const result = await store.load("s3://my-bucket/reports/cfa-basics/a.json");

    expect(result.run_id).toBe("loaded-run");
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect(cmd.input.Bucket).toBe("my-bucket");
    expect(cmd.input.Key).toBe("reports/cfa-basics/a.json");
  });

  // ── error handling ──────────────────────────────────────────────────────────

  it("throws a clear error when the bucket does not exist", async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error("The specified bucket does not exist"), { name: "NoSuchBucket" })
    );
    const store = new S3BenchmarkStore("missing-bucket", "");
    await expect(store.list()).rejects.toThrow(/bucket not found.*missing-bucket/i);
  });

  it("throws a clear error when credentials are missing", async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error("Could not load credentials from any providers"), {
        name: "CredentialsProviderError",
      })
    );
    const store = new S3BenchmarkStore("my-bucket", "");
    await expect(store.save(makeReport())).rejects.toThrow(/AWS credentials not found/);
  });
});
