import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── loadPlugins tests ────────────────────────────────────────────────────────

describe("loadPlugins", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-plugins-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function importLoadPlugins() {
    // Re-import fresh to avoid module cache issues
    const { loadPlugins } = await import("../src/plugins.js");
    return loadPlugins;
  }

  it("returns empty map when graders/ directory does not exist", async () => {
    const loadPlugins = await importLoadPlugins();
    const plugins = await loadPlugins(path.join(tmpDir, "nonexistent"));
    expect(plugins.size).toBe(0);
  });

  it("loads a valid plugin from a .js file", async () => {
    const pluginPath = path.join(tmpDir, "my_plugin.js");
    fs.writeFileSync(
      pluginPath,
      `
export default {
  type: "my_custom_grader",
  run: async (output, config) => ({
    criteria_type: "my_custom_grader",
    passed: output.includes("yes"),
  }),
};
`
    );

    const loadPlugins = await importLoadPlugins();
    const plugins = await loadPlugins(tmpDir);
    expect(plugins.has("my_custom_grader")).toBe(true);
  });

  it("calls plugin run() and returns correct result", async () => {
    const pluginPath = path.join(tmpDir, "yesno.js");
    fs.writeFileSync(
      pluginPath,
      `
export default {
  type: "yesno",
  run: async (output) => ({
    criteria_type: "yesno",
    passed: output.toLowerCase().includes("yes"),
    detail: "checked for yes",
  }),
};
`
    );

    const loadPlugins = await importLoadPlugins();
    const plugins = await loadPlugins(tmpDir);
    const plugin = plugins.get("yesno")!;
    const result = await plugin.run("Yes, this works!", {});
    expect(result.passed).toBe(true);
    expect(result.detail).toBe("checked for yes");

    const result2 = await plugin.run("No, it does not.", {});
    expect(result2.passed).toBe(false);
  });

  it("skips a file that fails to load and prints a warning", async () => {
    const pluginPath = path.join(tmpDir, "broken.js");
    fs.writeFileSync(pluginPath, "this is not valid javascript {{{{");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadPlugins = await importLoadPlugins();
    const plugins = await loadPlugins(tmpDir);
    expect(plugins.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("broken.js"));
    warnSpy.mockRestore();
  });

  it("skips a file that does not export a valid default object", async () => {
    const pluginPath = path.join(tmpDir, "invalid_export.js");
    fs.writeFileSync(pluginPath, `export default "not an object";`);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadPlugins = await importLoadPlugins();
    const plugins = await loadPlugins(tmpDir);
    expect(plugins.size).toBe(0);
    warnSpy.mockRestore();
  });

  it("throws when a plugin type conflicts with a built-in grader", async () => {
    const pluginPath = path.join(tmpDir, "conflict.js");
    fs.writeFileSync(
      pluginPath,
      `
export default {
  type: "contains",
  run: async () => ({ criteria_type: "contains", passed: true }),
};
`
    );

    const loadPlugins = await importLoadPlugins();
    await expect(loadPlugins(tmpDir)).rejects.toThrow(/conflicts with a built-in/);
  });

  it("warns and skips duplicate plugin type names", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "plugin_a.js"),
      `export default { type: "my_grader", run: async () => ({ criteria_type: "my_grader", passed: true }) };`
    );
    fs.writeFileSync(
      path.join(tmpDir, "plugin_b.js"),
      `export default { type: "my_grader", run: async () => ({ criteria_type: "my_grader", passed: false }) };`
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadPlugins = await importLoadPlugins();
    const plugins = await loadPlugins(tmpDir);
    // Only one should be registered
    expect(plugins.size).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("duplicate"));
    warnSpy.mockRestore();
  });
});

// ─── Plugin integration with runGraders ───────────────────────────────────────

describe("runGraders with plugin graders", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-plugins-graders-"));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("returns error result for an unknown grader type (no plugin)", async () => {
    // Mock loadPlugins to return empty map
    vi.doMock("../src/plugins.js", () => ({
      loadPlugins: vi.fn().mockResolvedValue(new Map()),
    }));

    const { runGraders, resetPluginCache } = await import("../src/graders/index.js");
    resetPluginCache();

    const results = await runGraders("some output", [
      { type: "unknown_grader" } as unknown as import("../src/types.js").Criteria,
    ]);
    expect(results[0].passed).toBe(false);
    expect(results[0].error).toContain("Unknown grader type");
  });

  it("gracefully handles a plugin run() that throws", async () => {
    const badPlugin = new Map([
      [
        "bad_plugin",
        {
          type: "bad_plugin",
          run: async () => {
            throw new Error("plugin exploded");
          },
        },
      ],
    ]);

    vi.doMock("../src/plugins.js", () => ({
      loadPlugins: vi.fn().mockResolvedValue(badPlugin),
    }));

    const { runGraders, resetPluginCache } = await import("../src/graders/index.js");
    resetPluginCache();

    const results = await runGraders("some output", [
      { type: "bad_plugin" } as unknown as import("../src/types.js").Criteria,
    ]);
    expect(results[0].passed).toBe(false);
    expect(results[0].error).toContain("plugin exploded");
  });
});
