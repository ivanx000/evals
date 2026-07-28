import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunResult } from "../../src/types.js";

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

import { S3ResultsStore } from "../../src/stores/s3.js";
import { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

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

describe("S3ResultsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── save ─────────────────────────────────────────────────────────────────────

  it("save() writes to bucket/prefix/<timestamp>_<suite>.json and returns an s3:// id", async () => {
    mockSend.mockResolvedValue({});
    const store = new S3ResultsStore("my-bucket", "evals");
    const id = await store.save(makeResult());

    expect(id).toBe("s3://my-bucket/evals/2026-07-28T00-00-00-000Z_my_suite.json");
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.Bucket).toBe("my-bucket");
    expect(cmd.input.Key).toBe("evals/2026-07-28T00-00-00-000Z_my_suite.json");
    expect(JSON.parse(cmd.input.Body as string).run_id).toBe("run-1");
  });

  it("save() with an empty prefix writes to the bucket root", async () => {
    mockSend.mockResolvedValue({});
    const store = new S3ResultsStore("my-bucket", "");
    const id = await store.save(makeResult());
    expect(id).toBe("s3://my-bucket/2026-07-28T00-00-00-000Z_my_suite.json");
  });

  // ── list ─────────────────────────────────────────────────────────────────────

  it("list() paginates, filters to .json, and returns sorted s3:// ids", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "evals/b.json" }, { Key: "evals/a.json" }, { Key: "evals/notes.txt" }],
        IsTruncated: true,
        NextContinuationToken: "token-2",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "evals/c.json" }],
        IsTruncated: false,
      });

    const store = new S3ResultsStore("my-bucket", "evals");
    const ids = await store.list();

    expect(ids).toEqual([
      "s3://my-bucket/evals/a.json",
      "s3://my-bucket/evals/b.json",
      "s3://my-bucket/evals/c.json",
    ]);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(mockSend.mock.calls[1][0].input.ContinuationToken).toBe("token-2");
  });

  it("list() returns an empty array when the prefix has no objects", async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
    const store = new S3ResultsStore("my-bucket", "evals");
    expect(await store.list()).toEqual([]);
  });

  // ── load ─────────────────────────────────────────────────────────────────────

  it("load() parses bucket and key from a full s3:// URI regardless of constructor bucket", async () => {
    mockSend.mockResolvedValue({
      Body: { transformToString: async () => JSON.stringify(makeResult({ run_id: "loaded-run" })) },
    });
    const store = new S3ResultsStore("other-bucket", "other-prefix");
    const result = await store.load("s3://my-bucket/evals/a.json");

    expect(result.run_id).toBe("loaded-run");
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect(cmd.input.Bucket).toBe("my-bucket");
    expect(cmd.input.Key).toBe("evals/a.json");
  });

  // ── error handling ──────────────────────────────────────────────────────────

  it("throws a clear error when the bucket does not exist", async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error("The specified bucket does not exist"), { name: "NoSuchBucket" })
    );
    const store = new S3ResultsStore("missing-bucket", "");
    await expect(store.list()).rejects.toThrow(/bucket not found.*missing-bucket/i);
  });

  it("throws a clear error when credentials are missing", async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error("Could not load credentials from any providers"), {
        name: "CredentialsProviderError",
      })
    );
    const store = new S3ResultsStore("my-bucket", "");
    await expect(store.save(makeResult())).rejects.toThrow(/AWS credentials not found/);
  });

  it("throws a clear error on access denied", async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error("Access Denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      })
    );
    const store = new S3ResultsStore("my-bucket", "");
    await expect(store.list()).rejects.toThrow(/Access denied to S3 bucket "my-bucket"/);
  });
});
