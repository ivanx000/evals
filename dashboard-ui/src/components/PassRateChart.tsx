import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { RunSummary } from "../types";

interface Props {
  runs: RunSummary[];
}

const MODEL_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#f472b6", // pink-400
  "#a78bfa", // violet-400
  "#fb923c", // orange-400
  "#facc15", // yellow-400
];

export function PassRateChart({ runs }: Props) {
  const models = [...new Set(runs.flatMap((r) => r.models))];

  const byDate = new Map<string, Record<string, number>>();
  for (const run of [...runs].reverse()) {
    const date = new Date(run.timestamp).toLocaleDateString();
    if (!byDate.has(date)) byDate.set(date, {});
    for (const model of run.models) {
      byDate.get(date)![model] = Math.round(run.pass_rate * 100);
    }
  }

  const data = Array.from(byDate.entries()).map(([date, vals]) => ({
    date,
    ...vals,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
          labelStyle={{ color: "#e5e7eb" }}
          formatter={(val: number) => [`${val}%`, undefined]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
        {models.map((model, i) => (
          <Line
            key={model}
            type="monotone"
            dataKey={model}
            stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
