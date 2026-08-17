import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Overview } from "../../src/pages/Overview";
import { mockFetchOnce, mockFetchError } from "../helpers/mockFetch";
import { makeRunSummary } from "../fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderOverview() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>
  );
}

describe("Overview page", () => {
  it("shows a loading state before the runs arrive", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderOverview();
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("shows the error banner when the request fails", async () => {
    mockFetchError("results dir not found");
    renderOverview();
    await waitFor(() => expect(screen.getByText("results dir not found")).toBeInTheDocument());
  });

  it("shows zeroed-out stats and the runs-table empty state with no runs", async () => {
    mockFetchOnce([]);
    renderOverview();

    await waitFor(() => expect(screen.getByText("Total runs")).toBeInTheDocument());
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/No eval runs found/)).toBeInTheDocument();
  });

  it("aggregates stats and renders the runs table when runs exist", async () => {
    const runs = [
      makeRunSummary({ id: "run-1", suite_name: "Suite A", total: 4, passed: 3, avg_latency_ms: 1000, total_cost_usd: 0.01 }),
      makeRunSummary({ id: "run-2", suite_name: "Suite B", total: 4, passed: 4, avg_latency_ms: 2000, total_cost_usd: 0.02 }),
    ];
    mockFetchOnce(runs);
    renderOverview();

    await waitFor(() => expect(screen.getByText("Suite A")).toBeInTheDocument());
    expect(screen.getByText("Suite B")).toBeInTheDocument();
    // total: 7 passed / 8 total = 88% (rounded)
    expect(screen.getByText("88%")).toBeInTheDocument();
    // avg latency: (1000 + 2000) / 2 = 1500ms
    expect(screen.getByText("1500ms")).toBeInTheDocument();
    // total cost: 0.03
    expect(screen.getByText("$0.030")).toBeInTheDocument();
  });
});
