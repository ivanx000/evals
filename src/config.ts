import * as fs from "fs";
import * as path from "path";
import type { EvalConfig } from "./types.js";
import { EvalConfigSchema } from "./types.js";

const CONFIG_FILENAMES = [".evalrc.json", ".evalrc", "eval.config.json"];

export function loadConfig(configPath?: string): EvalConfig {
  let raw: Record<string, unknown> = {};

  if (configPath) {
    const content = fs.readFileSync(configPath, "utf-8");
    raw = JSON.parse(content) as Record<string, unknown>;
  } else {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.join(process.cwd(), name);
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, "utf-8");
        raw = JSON.parse(content) as Record<string, unknown>;
        break;
      }
    }
  }

  // Merge env vars
  if (process.env.ANTHROPIC_API_KEY && !raw.anthropic_api_key) {
    raw.anthropic_api_key = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY && !raw.openai_api_key) {
    raw.openai_api_key = process.env.OPENAI_API_KEY;
  }

  return EvalConfigSchema.parse(raw);
}
