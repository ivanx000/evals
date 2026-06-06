import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { ProviderCallOptions, ProviderResponse } from "./types.js";

const CACHE_DIR = path.join(process.cwd(), ".eval-cache");

function getCacheKey(options: ProviderCallOptions): string {
  const payload = JSON.stringify({
    model: options.model,
    prompt: options.prompt,
    system_prompt: options.system_prompt ?? null,
    temperature: options.temperature ?? null,
    max_tokens: options.max_tokens,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function getCachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

export function cacheGet(options: ProviderCallOptions): ProviderResponse | null {
  try {
    const key = getCacheKey(options);
    const filePath = getCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ProviderResponse;
  } catch {
    return null;
  }
}

export function cacheSet(options: ProviderCallOptions, response: ProviderResponse): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const key = getCacheKey(options);
    fs.writeFileSync(getCachePath(key), JSON.stringify(response, null, 2));
  } catch {
    // Cache writes are best-effort
  }
}
