import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import { RunsTable } from "../../src/components/RunsTable";
import { makeRunSummary } from "../fixtures";

function renderTable(props: Partial<ComponentProps<typeof RunsTable>> = {}) {
  const runs = props.runs ?? [makeRunSummary()];
  return render(
    <MemoryRouter>
      <RunsTable runs={runs} {...props} />
    </MemoryRouter>
  );
}

describe("RunsTable", () => {
  it("shows an empty state when there are no runs", () => {
    renderTable({ runs: [] });
    expect(screen.getByText(/No eval runs found/)).toBeInTheDocument();
  });

  it("renders one row per run with pass rate and cost", () => {
    renderTable({
      runs: [makeRunSummary({ suite_name: "My Suite", pass_rate: 0.75, total_cost_usd: 0.0012 })],
    });

    expect(screen.getByText("My Suite")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("$0.0012")).toBeInTheDocument();
  });

  it("shows a checkbox per row in selectable mode and calls onToggleSelect", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderTable({
      runs: [makeRunSummary({ id: "run-1" })],
      selectable: true,
      selectedIds: [],
      onToggleSelect,
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(onToggleSelect).toHaveBeenCalledWith("run-1");
  });

  it("reflects selectedIds as checked", () => {
    renderTable({
      runs: [makeRunSummary({ id: "run-1" })],
      selectable: true,
      selectedIds: ["run-1"],
    });

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("does not render View/Compare action buttons in selectable mode", () => {
    renderTable({ runs: [makeRunSummary()], selectable: true, selectedIds: [] });
    expect(screen.queryByText("View")).not.toBeInTheDocument();
    expect(screen.queryByText("Compare")).not.toBeInTheDocument();
  });

  it("renders View/Compare action buttons in the default (non-selectable) mode", () => {
    renderTable({ runs: [makeRunSummary()] });
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Compare")).toBeInTheDocument();
  });
});
