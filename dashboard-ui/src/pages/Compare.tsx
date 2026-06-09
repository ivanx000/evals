import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useRuns, useCompare } from "../hooks/useRuns";
import { RunsTable } from "../components/RunsTable";
import { ModelCompareTable } from "../components/ModelCompareTable";

export function Compare() {
  const [searchParams] = useSearchParams();
  const { runs, loading: runsLoading } = useRuns();
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const param = searchParams.get("runIds");
    return param ? param.split(",").filter(Boolean) : [];
  });

  useEffect(() => {
    const param = searchParams.get("runIds");
    if (param) setSelectedIds(param.split(",").filter(Boolean));
  }, [searchParams]);

  const { rows, loading: compareLoading, error } = useCompare(selectedIds);

  function toggleId(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

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

      {selectedIds.length >= 2 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-300">
              Comparison ({selectedIds.length} runs)
            </h2>
            {compareLoading && <span className="text-xs text-gray-500">Loading…</span>}
          </div>
          {error ? (
            <div className="text-red-400 text-sm">{error}</div>
          ) : (
            <ModelCompareTable rows={rows} runIds={selectedIds} runs={runs} />
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
