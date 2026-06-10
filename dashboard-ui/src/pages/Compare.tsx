import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useRuns, useCompare, useDiff } from "../hooks/useRuns";
import { RunsTable } from "../components/RunsTable";
import { ModelCompareTable } from "../components/ModelCompareTable";
import type { DiffEntry } from "../types";

type Tab = "compare" | "regressions";

function DiffBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) return <span className="text-gray-500 text-xs">—</span>;
  return passed ? (
    <span className="text-green-400 font-medium text-xs">PASS</span>
  ) : (
    <span className="text-red-400 font-medium text-xs">FAIL</span>
  );
}

function DiffTable({ entries, title, color }: { entries: DiffEntry[]; title: string; color: "red" | "green" }) {
  if (entries.length === 0) return null;
  const headerColor = color === "red" ? "text-red-400" : "text-green-400";

  return (
    <div className="mb-4">
      <h3 className={`text-sm font-semibold mb-2 ${headerColor}`}>{title} ({entries.length})</h3>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="text-left py-1.5 pr-4 font-medium">Case</th>
            <th className="text-left py-1.5 pr-4 font-medium">Grader</th>
            <th className="text-left py-1.5 pr-4 font-medium">Baseline</th>
            <th className="text-left py-1.5 font-medium">Candidate</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={i}
              className={`border-b border-gray-800 ${color === "red" ? "bg-red-950/20" : "bg-green-950/20"}`}
            >
              <td className="py-1.5 pr-4 text-gray-200 font-mono">{e.case_id}</td>
              <td className="py-1.5 pr-4 text-gray-400">{e.criteria_type}</td>
              <td className="py-1.5 pr-4"><DiffBadge passed={e.baseline_passed} /></td>
              <td className="py-1.5"><DiffBadge passed={e.candidate_passed} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Compare() {
  const [searchParams] = useSearchParams();
  const { runs, loading: runsLoading } = useRuns();
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const param = searchParams.get("runIds");
    return param ? param.split(",").filter(Boolean) : [];
  });
  const [activeTab, setActiveTab] = useState<Tab>("compare");

  useEffect(() => {
    const param = searchParams.get("runIds");
    if (param) setSelectedIds(param.split(",").filter(Boolean));
  }, [searchParams]);

  const { rows, loading: compareLoading, error: compareError } = useCompare(selectedIds);

  // For regressions: use first two selected as baseline/candidate
  const baselineId = selectedIds[0] ?? null;
  const candidateId = selectedIds[1] ?? null;
  const { diff, loading: diffLoading, error: diffError } = useDiff(
    activeTab === "regressions" ? baselineId : null,
    activeTab === "regressions" ? candidateId : null
  );

  function toggleId(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const showTabs = selectedIds.length >= 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Compare runs</h1>
        <p className="text-sm text-gray-500 mt-1">Select 2 or more runs to compare outputs side-by-side</p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Select runs</h2>
        {runsLoading ? (
          <div className="text-gray-500 text-sm py-4">Loading…</div>
        ) : (
          <RunsTable
            runs={runs}
            selectable
            selectedIds={selectedIds}
            onToggleSelect={toggleId}
          />
        )}
      </div>

      {showTabs && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {/* Tab bar */}
          <div className="flex gap-1 mb-4 border-b border-gray-700 pb-0">
            <button
              onClick={() => setActiveTab("compare")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                activeTab === "compare"
                  ? "bg-gray-700 text-gray-100 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Side-by-side ({selectedIds.length} runs)
            </button>
            <button
              onClick={() => setActiveTab("regressions")}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                activeTab === "regressions"
                  ? "bg-gray-700 text-gray-100 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Regressions
            </button>
          </div>

          {activeTab === "compare" && (
            <>
              {compareLoading && <span className="text-xs text-gray-500">Loading…</span>}
              {compareError ? (
                <div className="text-red-400 text-sm">{compareError}</div>
              ) : (
                <ModelCompareTable rows={rows} runIds={selectedIds} runs={runs} />
              )}
            </>
          )}

          {activeTab === "regressions" && (
            <div>
              <p className="text-xs text-gray-500 mb-4">
                Comparing <span className="font-mono text-gray-300">{baselineId?.slice(0, 8)}…</span> (baseline) → <span className="font-mono text-gray-300">{candidateId?.slice(0, 8)}…</span> (candidate)
              </p>

              {diffLoading && <div className="text-gray-500 text-sm py-4">Loading diff…</div>}
              {diffError && <div className="text-red-400 text-sm">{diffError}</div>}

              {diff && !diffLoading && (
                <>
                  <DiffTable entries={diff.regressions} title="❌ Regressions" color="red" />
                  <DiffTable entries={diff.improvements} title="✅ Improvements" color="green" />

                  {diff.removed_cases.length > 0 && (
                    <p className="text-xs text-yellow-500 mb-2">
                      Removed cases: {diff.removed_cases.join(", ")}
                    </p>
                  )}
                  {diff.added_cases.length > 0 && (
                    <p className="text-xs text-blue-400 mb-2">
                      Added cases: {diff.added_cases.join(", ")}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-400 flex gap-6">
                    <span>Unchanged: {diff.unchanged_count}</span>
                    <span className={diff.regressions.length > 0 ? "text-red-400 font-semibold" : ""}>
                      Regressions: {diff.regressions.length}
                    </span>
                    <span className={diff.improvements.length > 0 ? "text-green-400 font-semibold" : ""}>
                      Improvements: {diff.improvements.length}
                    </span>
                  </div>

                  {diff.regressions.length === 0 && diff.improvements.length === 0 && (
                    <p className="text-green-400 text-sm mt-2">No regressions or improvements found.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {selectedIds.length === 1 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          Select one more run to compare.
        </div>
      )}

      {selectedIds.length === 0 && !runsLoading && (
        <div className="text-center py-8 text-gray-500 text-sm">
          Select at least 2 runs above to start comparing.
        </div>
      )}
    </div>
  );
}
