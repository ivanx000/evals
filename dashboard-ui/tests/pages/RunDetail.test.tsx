import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RunDetail } from "../../src/pages/RunDetail";
import { mockFetchOnce, mockFetchError } from "../helpers/mockFetch";
import { makeRunResult, makeCaseResult } from "../fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRunDetail(id = "run-1") {
  return render(
    <MemoryRouter initialEntries={[`/runs/${id}`]}>
      <Routes>
        <Route path="/runs/:id" element={<RunDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RunDetail page", () => {
  it("shows a loading state before the run arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderRunDetail();
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("shows an error message when the run fails to load", async () => {
    mockFetchError("run not found", 404);
    renderRunDetail();
    await waitFor(() => expect(screen.getByText("run not found")).toBeInTheDocument());
  });

  it("renders the header stats and every case once loaded", async () => {
    const run = makeRunResult({
      suite_name: "Summarization quality",
      cases: [
        makeCaseResult({ case_id: "case-pass", passed: true }),
        makeCaseResult({ case_id: "case-fail", passed: false }),
      ],
    });
    mockFetchOnce(run);
    renderRunDetail();

    await waitFor(() => expect(screen.getByText("Summarization quality")).toBeInTheDocument());
    expect(screen.getByText("case-pass")).toBeInTheDocument();
    expect(screen.getByText("case-fail")).toBeInTheDocument();
    expect(screen.getByText("2 shown")).toBeInTheDocument();
  });

  it("filters cases with the pass/fail toggle", async () => {
    const user = userEvent.setup();
    const run = makeRunResult({
      cases: [
        makeCaseResult({ case_id: "case-pass", passed: true }),
        makeCaseResult({ case_id: "case-fail", passed: false }),
      ],
    });
    mockFetchOnce(run);
    renderRunDetail();

    await waitFor(() => expect(screen.getByText("case-pass")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "fail" }));

    expect(screen.queryByText("case-pass")).not.toBeInTheDocument();
    expect(screen.getByText("case-fail")).toBeInTheDocument();
    expect(screen.getByText("1 shown")).toBeInTheDocument();
  });

  it("filters cases by the search box across case_id and prompt", async () => {
    const user = userEvent.setup();
    const run = makeRunResult({
      cases: [
        makeCaseResult({ case_id: "alpha", prompt: "Summarize the report" }),
        makeCaseResult({ case_id: "beta", prompt: "Translate the memo" }),
      ],
    });
    mockFetchOnce(run);
    renderRunDetail();

    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Search cases…"), "translate");

    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("shows an empty state when the filters exclude every case", async () => {
    const user = userEvent.setup();
    const run = makeRunResult({ cases: [makeCaseResult({ passed: true })] });
    mockFetchOnce(run);
    renderRunDetail();

    await waitFor(() => screen.getByRole("button", { name: "fail" }));
    await user.click(screen.getByRole("button", { name: "fail" }));

    expect(screen.getByText("No cases match the filter.")).toBeInTheDocument();
  });

  it("shows a Batch badge and batch cost when the run came from the Batch API", async () => {
    const run = makeRunResult({ batch_id: "batch-123", batch_cost_usd: 0.005 });
    mockFetchOnce(run);
    renderRunDetail();

    await waitFor(() => expect(screen.getByText("Batch")).toBeInTheDocument());
    expect(screen.getByText("batch-123")).toBeInTheDocument();
  });
});
