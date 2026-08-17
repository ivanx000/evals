import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelCompareTable } from "../../src/components/ModelCompareTable";
import { makeCompareRow, makeRunSummary } from "../fixtures";

describe("ModelCompareTable", () => {
  it("shows an empty state when there are no shared cases", () => {
    render(<ModelCompareTable rows={[]} runIds={["run-1", "run-2"]} runs={[]} />);
    expect(screen.getByText(/No shared cases between selected runs/)).toBeInTheDocument();
  });

  it("renders a column per run and flags disagreements", () => {
    const runs = [
      makeRunSummary({ id: "run-1", suite_name: "Suite", models: ["claude-haiku-4-5"] }),
      makeRunSummary({ id: "run-2", suite_name: "Suite", models: ["claude-sonnet-4-6"] }),
    ];
    const rows = [makeCompareRow()];

    render(<ModelCompareTable rows={rows} runIds={["run-1", "run-2"]} runs={runs} />);

    expect(screen.getByText(/Suite — claude-haiku-4-5/)).toBeInTheDocument();
    expect(screen.getByText(/Suite — claude-sonnet-4-6/)).toBeInTheDocument();
    // run-1 passed, run-2 failed on this case -> flagged as disagreement
    expect(screen.getByText("disagree")).toBeInTheDocument();
  });

  it("computes a per-run pass rate summary row", () => {
    const rows = [
      makeCompareRow({
        caseName: "case-1",
        results: [
          { runId: "run-1", model: "m1", output: "a", passed: true, latency_ms: 100 },
          { runId: "run-2", model: "m2", output: "b", passed: true, latency_ms: 100 },
        ],
      }),
    ];
    render(<ModelCompareTable rows={rows} runIds={["run-1", "run-2"]} runs={[]} />);

    expect(screen.getByText("Pass rate")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBe(2);
  });
});
