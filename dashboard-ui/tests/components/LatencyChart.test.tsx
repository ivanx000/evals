import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LatencyChart } from "../../src/components/LatencyChart";
import { makeRunSummary } from "../fixtures";

describe("LatencyChart", () => {
  it("shows a placeholder when there is no data", () => {
    render(<LatencyChart runs={[]} />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
  });

  it("renders without crashing when runs are present", () => {
    const { container } = render(<LatencyChart runs={[makeRunSummary()]} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
});
