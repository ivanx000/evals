import { useRuns } from "../hooks/useRuns";
import { RunsTable } from "../components/RunsTable";
import { PassRateChart } from "../components/PassRateChart";
import { LatencyChart } from "../components/LatencyChart";
import { CostChart } from "../components/CostChart";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Overview() {
  const { runs, loading, error } = useRuns();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-900/30 border border-red-700 p-4 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  const totalRuns = runs.length;
  const overallPassRate =
    runs.length > 0
      ? Math.round(
          (runs.reduce((s, r) => s + r.passed, 0) /
            Math.max(runs.reduce((s, r) => s + r.total, 0), 1)) *
            100
        )
      : 0;
  const avgLatency =
    runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + r.avg_latency_ms, 0) / runs.length)
      : 0;
  const totalCost = runs.reduce((s, r) => s + r.total_cost_usd, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">All eval runs from your results directory</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total runs" value={String(totalRuns)} />
        <StatCard label="Overall pass rate" value={`${overallPassRate}%`} />
        <StatCard label="Avg latency" value={`${avgLatency}ms`} sub="per case" />
        <StatCard
          label="Total cost"
          value={totalCost > 0 ? `$${totalCost.toFixed(3)}` : "$0"}
          sub="estimated"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Pass rate over time</h2>
          <PassRateChart runs={runs} />
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-300 mb-3">Avg latency per run</h2>
          <LatencyChart runs={runs} />
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:w-1/2">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Cost per run</h2>
        <CostChart runs={runs} />
      </div>

      {/* Runs table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-4">All runs</h2>
        <RunsTable runs={runs} />
      </div>
    </div>
  );
}
