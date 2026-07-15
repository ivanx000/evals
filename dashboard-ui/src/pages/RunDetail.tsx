import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useRun } from "../hooks/useRuns";
import { CaseRow } from "../components/CaseRow";
import type { CaseResult } from "../types";

type Filter = "all" | "pass" | "fail";

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { run, loading, error } = useRun(id);
  const [filter, setFilter] = useState<Filter>("all");
  const [graderFilter, setGraderFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const graderTypes = useMemo(() => {
    if (!run) return [];
    const types = new Set<string>();
    run.cases.forEach((c) => c.grader_results.forEach((g) => types.add(g.criteria_type)));
    return [...types];
  }, [run]);

  const filtered = useMemo(() => {
    if (!run) return [];
    let cases: CaseResult[] = run.cases;
    if (filter === "pass") cases = cases.filter((c) => c.passed);
    if (filter === "fail") cases = cases.filter((c) => !c.passed);
    if (graderFilter !== "all") {
      cases = cases.filter((c) =>
        c.grader_results.some((g) => g.criteria_type === graderFilter)
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      cases = cases.filter(
        (c) => c.case_id.toLowerCase().includes(q) || c.prompt.toLowerCase().includes(q)
      );
    }
    return cases;
  }, [run, filter, graderFilter, search]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>;
  }

  if (error || !run) {
    return (
      <div className="rounded-lg bg-red-900/30 border border-red-700 p-4 text-red-400 text-sm">
        {error ?? "Run not found"}
      </div>
    );
  }

  const passRatePct = Math.round(run.pass_rate * 100);
  const avgLatency =
    run.cases.length > 0
      ? Math.round(run.cases.reduce((s, c) => s + c.latency_ms, 0) / run.cases.length)
      : 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link to="/" className="hover:text-gray-300 transition-colors">Overview</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">{run.suite_name}</span>
      </div>

      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-100">{run.suite_name}</h1>
              {run.batch_id && (
                <span className="px-2 py-0.5 text-xs font-medium bg-purple-900/60 text-purple-300 border border-purple-700 rounded-full">
                  Batch
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              {new Date(run.timestamp).toLocaleString()} · {run.model} ({run.provider})
            </div>
          </div>
          <Link
            to={`/compare?runIds=${run.run_id}`}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Compare
          </Link>
        </div>
        {run.batch_id && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 border-t border-gray-700 pt-3">
            <span>
              <span className="text-gray-400 font-medium">Batch ID:</span>{" "}
              <span className="font-mono">{run.batch_id}</span>
            </span>
            {run.batch_cost_usd !== undefined && (
              <span>
                <span className="text-gray-400 font-medium">Batch cost:</span>{" "}
                <span className="font-mono">${run.batch_cost_usd.toFixed(4)}</span>
                <span className="ml-1 text-purple-400">(50% discount applied)</span>
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pass rate</div>
            <div className={`text-xl font-semibold ${passRatePct >= 90 ? "text-green-400" : passRatePct >= 60 ? "text-yellow-400" : "text-red-400"}`}>
              {passRatePct}%
            </div>
            <div className="text-xs text-gray-500">{run.passed}/{run.total} cases</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Avg latency</div>
            <div className="text-xl font-semibold font-mono text-gray-200">{avgLatency}ms</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Est. cost</div>
            <div className="text-xl font-semibold font-mono text-gray-200">
              {run.total_cost_usd > 0 ? `$${run.total_cost_usd.toFixed(4)}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total cases</div>
            <div className="text-xl font-semibold text-gray-200">{run.total}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
          {(["all", "pass", "fail"] as Filter[]).map((f) => (
            <button
              key={f}
              className={`px-3 py-1.5 capitalize transition-colors ${
                filter === f ? "bg-gray-700 text-gray-100" : "text-gray-400 hover:bg-gray-800"
              }`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        {graderTypes.length > 1 && (
          <select
            value={graderFilter}
            onChange={(e) => setGraderFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300"
          >
            <option value="all">All graders</option>
            {graderTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          placeholder="Search cases…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 flex-1 min-w-40"
        />
        <span className="text-xs text-gray-500">{filtered.length} shown</span>
      </div>

      {/* Cases */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">No cases match the filter.</div>
        ) : (
          filtered.map((c) => <CaseRow key={c.case_id} caseResult={c} />)
        )}
      </div>
    </div>
  );
}
