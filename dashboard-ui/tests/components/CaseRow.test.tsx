import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseRow } from "../../src/components/CaseRow";
import { makeCaseResult } from "../fixtures";

describe("CaseRow", () => {
  it("renders the collapsed summary with grader chips", () => {
    const c = makeCaseResult({
      case_id: "case-42",
      grader_results: [{ criteria_type: "exact_match", passed: true }],
    });
    render(<CaseRow caseResult={c} />);

    expect(screen.getByText("case-42")).toBeInTheDocument();
    expect(screen.getByText("900ms")).toBeInTheDocument();
    expect(screen.getByText(/exact_match/)).toBeInTheDocument();
    // Detail panel is collapsed by default
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
  });

  it("expands to show prompt and output on click", async () => {
    const user = userEvent.setup();
    const c = makeCaseResult({ prompt: "What is 2+2?", output: "4" });
    render(<CaseRow caseResult={c} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getAllByText("What is 2+2?").length).toBeGreaterThan(0);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows the error message instead of output when the case errored", async () => {
    const user = userEvent.setup();
    const c = makeCaseResult({ error: "timeout after 30s" });
    render(<CaseRow caseResult={c} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText(/Error: timeout after 30s/)).toBeInTheDocument();
  });

  it("renders a cached badge when the case result was served from cache", () => {
    const c = makeCaseResult({ cached: true });
    render(<CaseRow caseResult={c} />);

    expect(screen.getByText("cached")).toBeInTheDocument();
  });
});
