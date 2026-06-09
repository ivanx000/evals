import { useState } from "react";
import type { CaseResult } from "../types";

interface Props {
  caseResult: CaseResult;
}

function GraderChip({ type, passed, score, error }: { type: string; passed: boolean; score?: number; error?: string }) {
  const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium";
  const color = error
    ? "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
    : passed
    ? "bg-green-900/50 text-green-400 border border-green-700"
    : "bg-red-900/50 text-red-400 border border-red-700";
  return (
    <span className={`${base} ${color}`} title={error}>
      {passed ? "✓" : "✗"} {type}
      {score !== undefined && ` (${score}/5)`}
    </span>
  );
}

export function CaseRow({ caseResult: c }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`mt-0.5 text-lg leading-none ${c.passed ? "text-green-400" : "text-red-400"}`}>
          {c.passed ? "✓" : "✗"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-gray-200">{c.case_id}</span>
            {c.cached && (
              <span className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400">cached</span>
            )}
            <span className="px-1.5 py-0.5 bg-gray-800 rounded text-xs font-mono text-blue-400">
              {c.latency_ms}ms
            </span>
            {c.cost_usd !== undefined && c.cost_usd > 0 && (
              <span className="text-xs text-gray-500">${c.cost_usd.toFixed(5)}</span>
            )}
          </div>
          <p className="text-gray-400 text-xs mt-1 truncate">{c.prompt}</p>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {c.grader_results.map((g, i) => (
              <GraderChip key={i} type={g.criteria_type} passed={g.passed} score={g.score} error={g.error} />
            ))}
          </div>
        </div>
        <span className="text-gray-600 text-xs mt-0.5 shrink-0">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700 space-y-3 pt-3">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Prompt</div>
            <pre className="text-sm text-gray-300 bg-gray-900 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
              {c.prompt}
            </pre>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Output</div>
            {c.error ? (
              <pre className="text-sm text-red-400 bg-gray-900 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                Error: {c.error}
              </pre>
            ) : (
              <pre className="text-sm text-gray-300 bg-gray-900 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
                {c.output || "(empty)"}
              </pre>
            )}
          </div>
          {c.grader_results.some((g) => g.reasoning) && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Judge reasoning</div>
              {c.grader_results
                .filter((g) => g.reasoning)
                .map((g, i) => (
                  <div key={i} className="bg-gray-900 rounded p-3 text-sm text-gray-300 mb-2">
                    <span className="text-gray-500 text-xs">{g.criteria_type} — score {g.score}/5</span>
                    <p className="mt-1">{g.reasoning}</p>
                  </div>
                ))}
            </div>
          )}
          {c.input_tokens !== undefined && (
            <div className="flex gap-4 text-xs text-gray-500">
              <span>Input tokens: {c.input_tokens}</span>
              <span>Output tokens: {c.output_tokens}</span>
              {c.cost_usd !== undefined && <span>Cost: ${c.cost_usd.toFixed(6)}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
