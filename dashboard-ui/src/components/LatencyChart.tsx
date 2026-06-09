import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RunSummary } from "../types";

interface Props {
  runs: RunSummary[];
}

export function LatencyChart({ runs }: Props) {
  const data = runs
    .slice(0, 10)
    .map((r) => ({
      label: `${r.suite_name.slice(0, 12)} (${r.models[0] ?? "?"})`,
      latency: r.avg_latency_ms,
    }))
    .reverse();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="label"
          tick={{ fill: "#9ca3af", fontSize: 10 }}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          tickFormatter={(v) => `${v}ms`}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
          labelStyle={{ color: "#e5e7eb" }}
          formatter={(val: number) => [`${val}ms`, "Avg latency"]}
        />
        <Bar dataKey="latency" fill="#60a5fa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
