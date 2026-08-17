import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostChart } from "../../src/components/CostChart";
import { makeRunSummary } from "../fixtures";

describe("CostChart", () => {
  it("shows a placeholder when no run has any cost", () => {
    render(<CostChart runs={[makeRunSummary({ total_cost_usd: 0 })]} />);
    expect(screen.getByText(/No cost data/)).toBeInTheDocument();
  });

  it("renders without crashing when runs have cost data", () => {
    const runs = [makeRunSummary({ total_cost_usd: 0.01 }), makeRunSummary({ id: "run-2", total_cost_usd: 0.02 })];
    const { container } = render(<CostChart runs={runs} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
});
