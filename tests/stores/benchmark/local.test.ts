import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { BenchmarkReport } from "../../../src/benchmark-types.js";
import { LocalBenchmarkStore } from "../../../src/stores/benchmark/local.js";

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

describe("LocalBenchmarkStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-bench-store-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("save() nests under a slugified benchmark-name subdirectory", async () => {
    const store = new LocalBenchmarkStore(dir);
    const filePath = await store.save(makeReport());

    expect(filePath).toBe(
      path.join(dir, "cfa-basics", "2026-07-28T00-00-00-000Z-claude-opus-4-8.json")
    );
    expect(fs.existsSync(filePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).run_id).toBe("run-1");
  });

  it("saveMarkdown() writes a sibling .md file with the same base name", async () => {
    const store = new LocalBenchmarkStore(dir);
    const filePath = await store.saveMarkdown(makeReport(), "# report");

    expect(filePath).toBe(
      path.join(dir, "cfa-basics", "2026-07-28T00-00-00-000Z-claude-opus-4-8.md")
    );
    expect(fs.readFileSync(filePath, "utf-8")).toBe("# report");
  });

  it("list() returns an empty array when the directory doesn't exist", async () => {
    const store = new LocalBenchmarkStore(path.join(dir, "missing"));
    expect(await store.list()).toEqual([]);
  });

  it("list() scopes to one benchmark subdirectory when a name is given", async () => {
    const store = new LocalBenchmarkStore(dir);
    await store.save(makeReport({ benchmark_name: "CFA Basics", run_id: "a" }));
    await store.save(makeReport({ benchmark_name: "Other Bench", run_id: "b", timestamp: "2026-07-28T00:00:01.000Z" }));

    const ids = await store.list("CFA Basics");
    expect(ids).toHaveLength(1);
    expect(ids[0]).toContain("cfa-basics");
  });

  it("list() with no name returns reports across all benchmark subdirectories", async () => {
    const store = new LocalBenchmarkStore(dir);
    await store.save(makeReport({ benchmark_name: "CFA Basics", run_id: "a" }));
    await store.save(makeReport({ benchmark_name: "Other Bench", run_id: "b", timestamp: "2026-07-28T00:00:01.000Z" }));

    expect(await store.list()).toHaveLength(2);
  });

  it("list() ignores .md files, only returning .json ids", async () => {
    const store = new LocalBenchmarkStore(dir);
    const report = makeReport();
    await store.save(report);
    await store.saveMarkdown(report, "# report");

    const ids = await store.list();
    expect(ids).toHaveLength(1);
    expect(ids[0].endsWith(".json")).toBe(true);
  });

  it("load() round-trips a saved report", async () => {
    const store = new LocalBenchmarkStore(dir);
    const filePath = await store.save(makeReport({ run_id: "round-trip" }));
    const loaded = await store.load(filePath);
    expect(loaded.run_id).toBe("round-trip");
  });

  it("load() throws a clear error for a missing file", async () => {
    const store = new LocalBenchmarkStore(dir);
    await expect(store.load(path.join(dir, "does-not-exist.json"))).rejects.toThrow(
      /Cannot read benchmark report file/
    );
  });
});
