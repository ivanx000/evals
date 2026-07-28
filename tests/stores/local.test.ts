import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { RunResult } from "../../src/types.js";
import { LocalResultsStore } from "../../src/stores/local.js";

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

describe("LocalResultsStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-local-store-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("save() creates the directory if missing and writes a timestamped filename", async () => {
    const nested = path.join(dir, "nested");
    const store = new LocalResultsStore(nested);
    const filePath = await store.save(makeResult());

    expect(filePath).toBe(path.join(nested, "2026-07-28T00-00-00-000Z_my_suite.json"));
    expect(fs.existsSync(filePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(filePath, "utf-8")).run_id).toBe("run-1");
  });

  it("list() returns an empty array when the directory doesn't exist", async () => {
    const store = new LocalResultsStore(path.join(dir, "missing"));
    expect(await store.list()).toEqual([]);
  });

  it("list() returns sorted .json file paths, ignoring other extensions", async () => {
    fs.writeFileSync(path.join(dir, "b.json"), "{}");
    fs.writeFileSync(path.join(dir, "a.json"), "{}");
    fs.writeFileSync(path.join(dir, "notes.txt"), "");
    const store = new LocalResultsStore(dir);
    expect(await store.list()).toEqual([path.join(dir, "a.json"), path.join(dir, "b.json")]);
  });

  it("load() round-trips a saved result", async () => {
    const store = new LocalResultsStore(dir);
    const filePath = await store.save(makeResult({ run_id: "round-trip" }));
    const loaded = await store.load(filePath);
    expect(loaded.run_id).toBe("round-trip");
  });

  it("load() throws a clear error for a missing file", async () => {
    const store = new LocalResultsStore(dir);
    await expect(store.load(path.join(dir, "does-not-exist.json"))).rejects.toThrow(
      /Cannot read result file/
    );
  });
});
