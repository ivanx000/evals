import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PassRateChart } from "../../src/components/PassRateChart";
import { makeRunSummary } from "../fixtures";

describe("PassRateChart", () => {
  it("shows a placeholder when there is no data", () => {
    render(<PassRateChart runs={[]} />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });

  it("renders one line per distinct model without crashing", () => {
    const runs = [
      makeRunSummary({ models: ["claude-haiku-4-5"] }),
      makeRunSummary({ id: "run-2", models: ["claude-sonnet-4-6"] }),
    ];
    const { container } = render(<PassRateChart runs={runs} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
});
