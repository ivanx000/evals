import { useNavigate } from "react-router-dom";
import type { RunSummary } from "../types";

interface Props {
  runs: RunSummary[];
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

function passRateColor(rate: number) {
  if (rate >= 0.9) return "text-green-400";
  if (rate >= 0.6) return "text-yellow-400";
  return "text-red-400";
}

export function RunsTable({ runs, selectable, selectedIds = [], onToggleSelect }: Props) {
  const navigate = useNavigate();

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No eval runs found. Run <code className="text-gray-400">eval run suite.yaml</code> to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
            {selectable && <th className="pb-2 pr-4 w-8" />}
            <th className="pb-2 pr-6">Date</th>
            <th className="pb-2 pr-6">Suite</th>
            <th className="pb-2 pr-6">Models</th>
            <th className="pb-2 pr-6">Pass rate</th>
            <th className="pb-2 pr-6">Cases</th>
            <th className="pb-2 pr-6">Avg latency</th>
            <th className="pb-2 pr-6">Est. cost</th>
            {!selectable && <th className="pb-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer"
              onClick={() => !selectable && navigate(`/runs/${run.id}`)}
            >
              {selectable && (
                <td className="py-3 pr-4">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-400"
                    checked={selectedIds.includes(run.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelect?.(run.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
              )}
              <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">
                {new Date(run.timestamp).toLocaleString()}
              </td>
              <td className="py-3 pr-6 font-medium text-gray-100">{run.suite_name}</td>
              <td className="py-3 pr-6 text-gray-300">
                <div className="flex flex-wrap gap-1">
                  {run.models.map((m) => (
                    <span
                      key={m}
                      className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </td>
              <td className={`py-3 pr-6 font-mono font-semibold ${passRateColor(run.pass_rate)}`}>
                {Math.round(run.pass_rate * 100)}%
              </td>
              <td className="py-3 pr-6 text-gray-300">
                <span className="text-green-400">{run.passed}</span>
                <span className="text-gray-600">/</span>
                <span className="text-gray-300">{run.total}</span>
              </td>
              <td className="py-3 pr-6 font-mono text-gray-300">{run.avg_latency_ms}ms</td>
              <td className="py-3 pr-6 font-mono text-gray-300">
                {run.total_cost_usd > 0 ? `$${run.total_cost_usd.toFixed(4)}` : "—"}
              </td>
              {!selectable && (
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/runs/${run.id}`);
                      }}
                    >
                      View
                    </button>
                    <button
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/compare?runIds=${run.id}`);
                      }}
                    >
                      Compare
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
