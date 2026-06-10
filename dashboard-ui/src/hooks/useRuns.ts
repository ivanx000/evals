import { useState, useEffect } from "react";
import type { RunSummary, RunResult, CompareRow, DiffResult } from "../types";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function useRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<RunSummary[]>("/api/runs")
      .then(setRuns)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { runs, loading, error };
}

export function useRun(id: string | undefined) {
  const [run, setRun] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    apiFetch<RunResult>(`/api/runs/${id}`)
      .then(setRun)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { run, loading, error };
}

export function useCompare(runIds: string[]) {
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runIds.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<CompareRow[]>(`/api/compare?runIds=${runIds.join(",")}`)
      .then(setRows)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rows, loading, error };
}

export function useDiff(baselineId: string | null, candidateId: string | null) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baselineId || !candidateId) {
      setDiff(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<DiffResult>(`/api/diff?baseline=${baselineId}&candidate=${candidateId}`)
      .then(setDiff)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [baselineId, candidateId]);

  return { diff, loading, error };
}
