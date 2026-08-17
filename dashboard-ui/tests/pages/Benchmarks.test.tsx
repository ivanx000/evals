import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Benchmarks } from "../../src/pages/Benchmarks";
import { mockFetchOnce, mockFetchError, mockFetchSequence } from "../helpers/mockFetch";
import { makeBenchmarkSummary, makeBenchmarkReport } from "../fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Benchmarks page", () => {
  it("shows a loading state before summaries arrive", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Benchmarks />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("shows the error banner when the request fails", async () => {
    mockFetchError("reports dir not found");
    render(<Benchmarks />);
    await waitFor(() => expect(screen.getByText("reports dir not found")).toBeInTheDocument());
  });

  it("shows the empty state with a hint command when there are no reports", async () => {
    mockFetchOnce([]);
    render(<Benchmarks />);
    await waitFor(() => expect(screen.getByText(/No benchmark reports found/)).toBeInTheDocument());
    expect(screen.getByText(/evals benchmark run financial-reasoning/)).toBeInTheDocument();
  });

  it("lists run history and prompts to select a run", async () => {
    mockFetchOnce([makeBenchmarkSummary({ benchmark_name: "financial-reasoning" })]);
    render(<Benchmarks />);

    await waitFor(() => expect(screen.getByText("financial-reasoning")).toBeInTheDocument());
    expect(screen.getByText("Select a run to view the full report")).toBeInTheDocument();
  });

  it("loads and renders the full report when a run is selected", async () => {
    const user = userEvent.setup();
    const summary = makeBenchmarkSummary({ run_id: "bench-run-1", benchmark_name: "financial-reasoning" });
    const report = makeBenchmarkReport({ run_id: "bench-run-1" });
    mockFetchSequence([{ data: [summary] }, { data: report }]);

    render(<Benchmarks />);

    await waitFor(() => screen.getByText("financial-reasoning"));
    await user.click(screen.getByText("financial-reasoning"));

    await waitFor(() => expect(screen.getByText("task-1")).toBeInTheDocument());
    expect(screen.getByText("task-2")).toBeInTheDocument();
    // "50.0%" shows up in several places (run-history badge, stat card, category/difficulty rows).
    expect(screen.getAllByText("50.0%").length).toBeGreaterThan(0);
  });

  it("expands a task row to show the question and answers on click", async () => {
    const user = userEvent.setup();
    const summary = makeBenchmarkSummary({ run_id: "bench-run-1" });
    const report = makeBenchmarkReport({ run_id: "bench-run-1" });
    mockFetchSequence([{ data: [summary] }, { data: report }]);

    render(<Benchmarks />);
    await waitFor(() => screen.getByText(summary.benchmark_name));
    await user.click(screen.getByText(summary.benchmark_name));
    await waitFor(() => screen.getByText("task-1"));

    await user.click(screen.getByText("task-1"));

    expect(screen.getByText("What is 2+2?")).toBeInTheDocument();
  });
});
