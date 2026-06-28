import { useState, useEffect } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { BenchmarkSummary, BenchmarkReport, CalibrationPair } from "../types";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function useBenchmarks() {
  const [summaries, setSummaries] = useState<BenchmarkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BenchmarkSummary[]>("/api/benchmarks")
      .then(setSummaries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { summaries, loading, error };
}

function useBenchmarkReport(id: string | null) {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setReport(null); return; }
    setLoading(true);
    apiFetch<BenchmarkReport>(`/api/benchmarks/${id}`)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [id]);

  return { report, loading };
}

function AccuracyBadge({ value }: { value: number }) {
  const pct = (value * 100).toFixed(1);
  const color =
    value >= 0.8 ? "text-green-400" : value >= 0.5 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-semibold ${color}`}>{pct}%</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function CalibrationChart({ pairs }: { pairs: CalibrationPair[] }) {
  const data = pairs.map((p) => ({
    confidence: p.confidence,
    outcome: p.passed ? 100 : 0,
    name: p.task_id,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          type="number"
          dataKey="confidence"
          domain={[0, 100]}
          label={{ value: "Confidence (%)", position: "insideBottom", offset: -4, fill: "#9ca3af", fontSize: 11 }}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="outcome"
          domain={[-10, 110]}
          ticks={[0, 100]}
          tickFormatter={(v: number) => (v === 0 ? "Fail" : "Pass")}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0].payload as { name: string; confidence: number; outcome: number };
            return (
              <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs text-gray-200">
                <div className="font-semibold">{d.name}</div>
                <div>Confidence: {d.confidence}%</div>
                <div>Outcome: {d.outcome === 100 ? "Pass" : "Fail"}</div>
              </div>
            );
          }}
        />
        <ReferenceLine
          x={50}
          stroke="#6b7280"
          strokeDasharray="4 4"
          label={{ value: "50%", fill: "#6b7280", fontSize: 10 }}
        />
        <Scatter data={data} fill="#60a5fa" opacity={0.85} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function TaskRow({ task }: { task: BenchmarkReport["tasks"][0] }) {
  const [expanded, setExpanded] = useState(false);
  const icon = task.passed ? "✅" : "❌";
  const conf = task.confidence !== undefined ? `${task.confidence}%` : "—";

  return (
    <>
      <tr
        className="border-t border-gray-700 hover:bg-gray-750 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-3 py-2 text-xs font-mono text-gray-300">{task.task_id}</td>
        <td className="px-3 py-2 text-xs text-gray-400">{task.category.replace(/_/g, " ")}</td>
        <td className="px-3 py-2 text-xs text-gray-400 capitalize">{task.difficulty}</td>
        <td className="px-3 py-2 text-xs text-gray-400">{task.grader_type}</td>
        <td className="px-3 py-2 text-sm">{icon}</td>
        <td className="px-3 py-2 text-xs text-gray-400">{(task.latency_ms / 1000).toFixed(2)}s</td>
        <td className="px-3 py-2 text-xs text-gray-400">{conf}</td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-700 bg-gray-850">
          <td colSpan={7} className="px-4 py-3">
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-gray-500 uppercase tracking-wider">Question</span>
                <p className="text-gray-300 mt-1 whitespace-pre-wrap">{task.question.trim()}</p>
              </div>
              <div className="flex gap-6">
                <div className="flex-1">
                  <span className="text-gray-500 uppercase tracking-wider">Reference answer</span>
                  <p className="text-green-400 mt-1 font-mono whitespace-pre-wrap">{task.reference_answer.trim()}</p>
                </div>
                <div className="flex-1">
                  <span className="text-gray-500 uppercase tracking-wider">Model answer</span>
                  <p className="text-gray-200 mt-1 font-mono whitespace-pre-wrap">{task.model_answer.trim()}</p>
                </div>
              </div>
              {task.grader_results.map((g, i) => (
                <div key={i}>
                  {g.reasoning && (
                    <div>
                      <span className="text-gray-500 uppercase tracking-wider">Judge reasoning</span>
                      <p className="text-gray-400 mt-1">{g.reasoning}</p>
                    </div>
                  )}
                  {g.detail && (
                    <div>
                      <span className="text-gray-500 uppercase tracking-wider">Detail</span>
                      <p className="text-gray-400 mt-1">{g.detail}</p>
                    </div>
                  )}
                  {g.error && (
                    <p className="text-red-400">{g.error}</p>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ReportDetail({ report }: { report: BenchmarkReport }) {
  const passed = report.tasks.filter((t) => t.passed).length;
  const durSec = (report.duration_ms / 1000).toFixed(1);
  const bs = report.calibration?.brier_score;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">
            {report.benchmark_name}
            <span className="text-gray-500 text-sm font-normal ml-2">v{report.benchmark_version}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {report.model} · {report.provider} · {report.timestamp.slice(0, 16).replace("T", " ")} · run {report.run_id.slice(0, 8)}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Accuracy"
          value={`${(report.accuracy * 100).toFixed(1)}%`}
          sub={`${passed}/${report.total_tasks} tasks`}
        />
        <StatCard label="Avg latency" value={`${(report.mean_latency_ms / 1000).toFixed(2)}s`} sub="per task" />
        <StatCard label="Est. cost" value={`$${report.estimated_cost_usd.toFixed(5)}`} sub="total" />
        <StatCard
          label="Brier score"
          value={bs !== undefined && bs !== null ? bs.toFixed(4) : "—"}
          sub={report.calibration?.interpretation ?? "no llm_judge tasks"}
        />
      </div>

      {/* Category & difficulty */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">By category</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left pb-1">Category</th>
                <th className="text-right pb-1">Passed</th>
                <th className="text-right pb-1">Rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.by_category).sort().map(([cat, m]) => (
                <tr key={cat} className="border-t border-gray-700">
                  <td className="py-1.5 text-gray-300">{cat.replace(/_/g, " ")}</td>
                  <td className="py-1.5 text-right text-gray-400">{m.passed}/{m.total}</td>
                  <td className="py-1.5 text-right"><AccuracyBadge value={m.pass_rate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">By difficulty</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left pb-1">Difficulty</th>
                <th className="text-right pb-1">Passed</th>
                <th className="text-right pb-1">Rate</th>
              </tr>
            </thead>
            <tbody>
              {(["easy", "medium", "hard"] as const).map((diff) => {
                const m = report.by_difficulty[diff];
                if (!m) return null;
                return (
                  <tr key={diff} className="border-t border-gray-700">
                    <td className="py-1.5 capitalize text-gray-300">{diff}</td>
                    <td className="py-1.5 text-right text-gray-400">{m.passed}/{m.total}</td>
                    <td className="py-1.5 text-right"><AccuracyBadge value={m.pass_rate} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calibration chart */}
      {report.calibration && report.calibration.pairs.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-1">Calibration</h3>
          <p className="text-xs text-gray-500 mb-3">
            Brier score: <span className="text-gray-300">{bs?.toFixed(4)}</span> —{" "}
            {report.calibration.interpretation} · {report.calibration.n_samples} samples
            <span className="ml-2 text-gray-600">(lower = better; 0.25 = random guessing)</span>
          </p>
          <CalibrationChart pairs={report.calibration.pairs} />
        </div>
      )}

      {/* Regression */}
      {report.regression && (
        <div className={`rounded-lg border p-4 ${report.regression.threshold_exceeded ? "border-red-700 bg-red-900/20" : "border-gray-700 bg-gray-800"}`}>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Regression vs {report.regression.previous_timestamp.slice(0, 10)}
          </h3>
          <div className="flex gap-6 text-xs text-gray-400">
            <span>
              Accuracy:{" "}
              <span className={report.regression.accuracy_delta >= 0 ? "text-green-400" : "text-red-400"}>
                {report.regression.accuracy_delta >= 0 ? "+" : ""}
                {(report.regression.accuracy_delta * 100).toFixed(1)}%
              </span>
            </span>
          </div>
          {report.regression.regressed_tasks.length > 0 && (
            <p className="text-xs text-red-400 mt-1">
              Regressions: {report.regression.regressed_tasks.join(", ")}
            </p>
          )}
          {report.regression.improved_tasks.length > 0 && (
            <p className="text-xs text-green-400 mt-1">
              Improvements: {report.regression.improved_tasks.join(", ")}
            </p>
          )}
          {report.regression.threshold_exceeded && (
            <p className="text-xs text-red-300 font-semibold mt-2">
              ⚠ Accuracy dropped beyond threshold — review recommended.
            </p>
          )}
        </div>
      )}

      {/* Duration */}
      <p className="text-xs text-gray-600">Total run duration: {durSec}s</p>

      {/* Task table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-medium text-gray-300">Per-task breakdown</h3>
          <p className="text-xs text-gray-500 mt-0.5">Click a row to expand the model's answer</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-750">
              <tr className="text-xs text-gray-500">
                <th className="text-left px-3 py-2">Task</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2">Difficulty</th>
                <th className="text-left px-3 py-2">Grader</th>
                <th className="text-left px-3 py-2">Pass</th>
                <th className="text-left px-3 py-2">Latency</th>
                <th className="text-left px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {report.tasks.map((t) => (
                <TaskRow key={t.task_id} task={t} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Benchmarks() {
  const { summaries, loading, error } = useBenchmarks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { report, loading: reportLoading } = useBenchmarkReport(selectedId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-900/30 border border-red-700 p-4 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Benchmarks</h1>
        <p className="text-sm text-gray-500 mt-1">Domain benchmark run history and calibration</p>
      </div>

      {summaries.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No benchmark reports found. Run{" "}
          <code className="bg-gray-800 px-1 rounded">evals benchmark run financial-reasoning</code>{" "}
          to generate your first report.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Run list */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Run history</h2>
            {summaries.map((s) => (
              <button
                key={s.run_id}
                onClick={() => setSelectedId(s.run_id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === s.run_id
                    ? "border-blue-500 bg-blue-900/20"
                    : "border-gray-700 bg-gray-800 hover:border-gray-500"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-200 truncate">{s.benchmark_name}</span>
                  <AccuracyBadge value={s.accuracy} />
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {s.model} · {s.timestamp.slice(0, 10)}
                </div>
                {s.brier_score !== null && (
                  <div className="text-xs text-gray-600 mt-0.5">
                    Brier: {s.brier_score.toFixed(4)}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Report detail */}
          <div className="lg:col-span-2">
            {!selectedId && (
              <div className="text-gray-600 text-sm mt-8 text-center">
                Select a run to view the full report
              </div>
            )}
            {selectedId && reportLoading && (
              <div className="text-gray-500 text-sm">Loading report…</div>
            )}
            {selectedId && !reportLoading && report && (
              <ReportDetail report={report} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
