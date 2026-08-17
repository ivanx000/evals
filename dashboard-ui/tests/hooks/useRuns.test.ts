import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRuns, useRun, useCompare, useDiff } from "../../src/hooks/useRuns";
import { mockFetchOnce, mockFetchError } from "../helpers/mockFetch";
import { makeRunSummary, makeRunResult, makeCompareRow, makeDiffResult } from "../fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRuns", () => {
  it("starts loading and populates runs on success", async () => {
    const runs = [makeRunSummary()];
    mockFetchOnce(runs);

    const { result } = renderHook(() => useRuns());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runs).toEqual(runs);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the server error message on failure", async () => {
    mockFetchError("results dir not found", 500);

    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("results dir not found");
    expect(result.current.runs).toEqual([]);
  });
});

describe("useRun", () => {
  it("fetches a run by id", async () => {
    const run = makeRunResult();
    const fetchMock = mockFetchOnce(run);

    const { result } = renderHook(() => useRun("run-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.run).toEqual(run);
    expect(fetchMock).toHaveBeenCalledWith("/api/runs/run-1");
  });

  it("does not fetch when id is undefined", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useRun(undefined));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useCompare", () => {
  it("does not fetch with fewer than 2 run ids", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCompare(["only-one"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it("fetches compare rows for 2+ run ids", async () => {
    const rows = [makeCompareRow()];
    const fetchMock = mockFetchOnce(rows);

    const { result } = renderHook(() => useCompare(["run-1", "run-2"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.rows).toEqual(rows);
    expect(fetchMock).toHaveBeenCalledWith("/api/compare?runIds=run-1,run-2");
  });
});

describe("useDiff", () => {
  it("does not fetch until both baseline and candidate are set", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDiff("run-1", null));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.diff).toBeNull();
  });

  it("fetches the diff once both ids are present", async () => {
    const diff = makeDiffResult();
    const fetchMock = mockFetchOnce(diff);

    const { result } = renderHook(() => useDiff("run-1", "run-2"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.diff).toEqual(diff);
    expect(fetchMock).toHaveBeenCalledWith("/api/diff?baseline=run-1&candidate=run-2");
  });
});
