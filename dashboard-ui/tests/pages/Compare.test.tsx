import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Compare } from "../../src/pages/Compare";
import { mockFetchOnce, mockFetchSequence } from "../helpers/mockFetch";
import { makeRunSummary, makeCompareRow, makeDiffResult } from "../fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCompare(initialEntry = "/compare") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Compare />
    </MemoryRouter>
  );
}

describe("Compare page", () => {
  it("prompts to select at least 2 runs when none are selected", async () => {
    mockFetchOnce([makeRunSummary()]);
    renderCompare();

    await waitFor(() => expect(screen.getByText(/Select at least 2 runs/)).toBeInTheDocument());
  });

  it("prompts for one more run when exactly 1 is selected", async () => {
    const user = userEvent.setup();
    mockFetchOnce([makeRunSummary({ id: "run-1" })]);
    renderCompare();

    await waitFor(() => screen.getByRole("checkbox"));
    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByText(/Select one more run to compare/)).toBeInTheDocument();
  });

  it("preselects runs from the runIds query param and loads the compare table", async () => {
    const runs = [
      makeRunSummary({ id: "run-1", suite_name: "Suite" }),
      makeRunSummary({ id: "run-2", suite_name: "Suite" }),
    ];
    const rows = [makeCompareRow()];
    mockFetchSequence([{ data: runs }, { data: rows }]);

    renderCompare("/compare?runIds=run-1,run-2");

    await waitFor(() => expect(screen.getByText("Side-by-side (2 runs)")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/disagree/)).toBeInTheDocument());
  });

  it("switches to the Regressions tab and renders the diff", async () => {
    const user = userEvent.setup();
    const runs = [
      makeRunSummary({ id: "run-1", suite_name: "Suite" }),
      makeRunSummary({ id: "run-2", suite_name: "Suite" }),
    ];
    const rows = [makeCompareRow()];
    const diff = makeDiffResult();
    mockFetchSequence([{ data: runs }, { data: rows }, { data: diff }]);

    renderCompare("/compare?runIds=run-1,run-2");

    await waitFor(() => expect(screen.getByText("Regressions")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Regressions" }));

    await waitFor(() => expect(screen.getByText(/❌ Regressions/)).toBeInTheDocument());
    expect(screen.getByText("Regressions: 1")).toBeInTheDocument();
  });

  it("shows the no-regressions message when the diff is clean", async () => {
    const user = userEvent.setup();
    const runs = [
      makeRunSummary({ id: "run-1", suite_name: "Suite" }),
      makeRunSummary({ id: "run-2", suite_name: "Suite" }),
    ];
    const rows = [makeCompareRow()];
    const diff = makeDiffResult({ regressions: [], improvements: [] });
    mockFetchSequence([{ data: runs }, { data: rows }, { data: diff }]);

    renderCompare("/compare?runIds=run-1,run-2");

    await waitFor(() => screen.getByText("Regressions"));
    await user.click(screen.getByRole("button", { name: "Regressions" }));

    await waitFor(() =>
      expect(screen.getByText("No regressions or improvements found.")).toBeInTheDocument()
    );
  });
});
