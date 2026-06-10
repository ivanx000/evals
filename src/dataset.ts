import * as fs from "fs";
import * as readline from "readline";
import type { EvalCase } from "./types.js";

// ─── Template substitution ────────────────────────────────────────────────────

export function substituteTemplate(
  template: EvalCase,
  row: Record<string, unknown>
): EvalCase {
  const json = JSON.stringify(template);
  const substituted = json.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const val = row[key];
    if (val === undefined) return match;
    // Escape JSON special characters in the substituted value
    return String(val).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  });
  return JSON.parse(substituted) as EvalCase;
}

// ─── JSONL streaming loader ───────────────────────────────────────────────────

export async function loadDatasetRows(
  filePath: string,
  limit?: number,
  sample?: number
): Promise<Record<string, unknown>[]> {
  let rows: Record<string, unknown>[] = [];

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    stream.on("error", (err) =>
      reject(new Error(`Cannot read dataset file: ${filePath}\n  ${err.message}`))
    );

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNum = 0;
    let earlyError: Error | null = null;

    rl.on("line", (line) => {
      lineNum++;
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        earlyError = new Error(`Invalid JSON on line ${lineNum} of ${filePath}`);
        rl.close();
        stream.destroy();
        return;
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        earlyError = new Error(`Line ${lineNum} of ${filePath} is not a JSON object`);
        rl.close();
        stream.destroy();
        return;
      }

      rows.push(parsed as Record<string, unknown>);

      // Apply limit early to avoid loading the whole file
      if (limit !== undefined && rows.length >= limit) {
        rl.close();
        stream.destroy();
      }
    });

    rl.on("close", () => {
      if (earlyError) reject(earlyError);
      else resolve();
    });
    rl.on("error", reject);
  });

  if (limit !== undefined) {
    rows = rows.slice(0, limit);
  }

  if (sample !== undefined && sample < rows.length) {
    rows = reservoirSample(rows, sample);
  }

  return rows;
}

// ─── Reservoir sampling (O(n) random sample without full load) ────────────────

function reservoirSample<T>(items: T[], k: number): T[] {
  const reservoir = items.slice(0, k);
  for (let i = k; i < items.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) reservoir[j] = items[i];
  }
  return reservoir;
}

// ─── Expand templates against a dataset ──────────────────────────────────────

export async function expandDataset(
  templates: EvalCase[],
  datasetPath: string,
  limit?: number,
  sample?: number
): Promise<EvalCase[]> {
  const rows = await loadDatasetRows(datasetPath, limit, sample);
  const expanded: EvalCase[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    for (let tplIdx = 0; tplIdx < templates.length; tplIdx++) {
      const tpl = templates[tplIdx];
      const expanded_case = substituteTemplate(tpl, row);
      // Always assign an id that incorporates the row index for traceability
      expanded_case.id = tpl.id
        ? `${tpl.id}-row${rowIdx + 1}`
        : `dataset-row${rowIdx + 1}${templates.length > 1 ? `-tpl${tplIdx + 1}` : ""}`;
      expanded.push(expanded_case);
    }
  }

  return expanded;
}
