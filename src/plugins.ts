import * as fs from "fs";
import * as path from "path";
import type { PluginGrader } from "./types.js";

const BUILTIN_TYPES = new Set([
  "exact_match",
  "contains",
  "max_words",
  "regex",
  "llm_judge",
  "code_execution",
  "numeric_tolerance",
  "calibration",
  "json_schema",
]);

export async function loadPlugins(pluginsDir?: string): Promise<Map<string, PluginGrader>> {
  const dir = pluginsDir ?? path.join(process.cwd(), "graders");
  const plugins = new Map<string, PluginGrader>();

  if (!fs.existsSync(dir)) return plugins;

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return plugins;
  }

  const pluginFiles = entries.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

  for (const file of pluginFiles) {
    const filePath = path.resolve(dir, file);
    let mod: unknown;

    try {
      // Use a URL to ensure ESM compatibility
      const fileUrl = new URL(`file://${filePath}`);
      mod = await import(fileUrl.toString());
    } catch (err) {
      console.warn(`[plugins] Warning: failed to load ${file}: ${(err as Error).message}`);
      continue;
    }

    const plugin = (mod as { default?: PluginGrader }).default;
    if (
      !plugin ||
      typeof plugin !== "object" ||
      typeof plugin.type !== "string" ||
      typeof plugin.run !== "function"
    ) {
      console.warn(
        `[plugins] Warning: ${file} does not export a valid PluginGrader (needs { type, run })`
      );
      continue;
    }

    if (BUILTIN_TYPES.has(plugin.type)) {
      throw new Error(
        `Plugin in ${file} uses type "${plugin.type}" which conflicts with a built-in grader. ` +
          `Choose a different type name.`
      );
    }

    if (plugins.has(plugin.type)) {
      console.warn(
        `[plugins] Warning: duplicate plugin type "${plugin.type}" in ${file} — skipping`
      );
      continue;
    }

    plugins.set(plugin.type, plugin);
  }

  return plugins;
}
