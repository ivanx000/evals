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

export function CostChart({ runs }: Props) {
  const data = runs
    .filter((r) => r.total_cost_usd > 0)
    .slice(0, 10)
    .map((r) => ({
      label: new Date(r.timestamp).toLocaleDateString(),
      cost: Number(r.total_cost_usd.toFixed(4)),
    }))
    .reverse();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No cost data (cached runs have $0)
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
          labelStyle={{ color: "#e5e7eb" }}
          formatter={(val: number) => [`$${val.toFixed(4)}`, "Cost"]}
        />
        <Bar dataKey="cost" fill="#34d399" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
