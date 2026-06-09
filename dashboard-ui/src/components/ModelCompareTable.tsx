import type { CompareRow, RunSummary } from "../types";

interface Props {
  rows: CompareRow[];
  runIds: string[];
  runs: RunSummary[];
}

function truncate(s: string, n = 120) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function ModelCompareTable({ rows, runIds, runs }: Props) {
  const runLabels = runIds.map((id) => {
    const run = runs.find((r) => r.id === id);
    return run ? `${run.suite_name} — ${run.models[0] ?? id}` : id;
  });

  const passRates = runIds.map((id) => {
    const cells = rows.flatMap((r) => r.results.filter((c) => c.runId === id));
    if (cells.length === 0) return null;
    return Math.round((cells.filter((c) => c.passed).length / cells.length) * 100);
  });

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No shared cases between selected runs.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-xs uppercase tracking-wide text-gray-400">
            <th className="pb-2 pr-4 text-left w-48">Case</th>
            {runLabels.map((label, i) => (
              <th key={i} className="pb-2 px-3 text-left min-w-48">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cellsByRun = new Map(row.results.map((c) => [c.runId, c]));
            const allPassed = runIds.every((id) => cellsByRun.get(id)?.passed ?? false);
            const allFailed = runIds.every((id) => !(cellsByRun.get(id)?.passed ?? true));
            const disagree = !allPassed && !allFailed;

            return (
              <tr
                key={row.caseName}
                className={`border-b border-gray-800 ${disagree ? "bg-yellow-900/10" : ""}`}
              >
                <td className="py-3 pr-4 font-mono text-xs text-gray-300 align-top">
                  {row.caseName}
                  {disagree && (
                    <span className="ml-1.5 px-1 py-0.5 bg-yellow-700/40 rounded text-yellow-400 text-xs">
                      disagree
                    </span>
                  )}
                </td>
                {runIds.map((id) => {
                  const cell = cellsByRun.get(id);
                  if (!cell) {
                    return (
                      <td key={id} className="py-3 px-3 text-gray-600 text-xs align-top">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={id} className="py-3 px-3 align-top">
                      <div className="flex items-start gap-1.5">
                        <span className={`text-base leading-none shrink-0 ${cell.passed ? "text-green-400" : "text-red-400"}`}>
                          {cell.passed ? "✓" : "✗"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-300 break-words">
                            {truncate(cell.output)}
                          </p>
                          <span className="text-xs text-gray-600 font-mono">{cell.latency_ms}ms</span>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Summary row */}
          <tr className="border-t-2 border-gray-600 bg-gray-800/50">
            <td className="py-2 pr-4 text-xs text-gray-400 font-semibold uppercase">Pass rate</td>
            {passRates.map((rate, i) => (
              <td key={i} className="py-2 px-3">
                {rate === null ? (
                  <span className="text-gray-600 text-xs">—</span>
                ) : (
                  <span
                    className={`font-mono font-semibold text-sm ${
                      rate >= 90 ? "text-green-400" : rate >= 60 ? "text-yellow-400" : "text-red-400"
                    }`}
                  >
                    {rate}%
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
