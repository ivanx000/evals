import { vi } from "vitest";

// Mocking strategy: the dashboard's API surface is a handful of plain GET
// endpoints returning JSON (see docs/dashboard.md "REST API"). That doesn't
// warrant MSW's request-interception machinery — stubbing `global.fetch`
// directly at the boundary each hook already funnels through (`apiFetch` in
// useRuns.ts / Benchmarks.tsx) is simpler and just as accurate. Revisit if
// the UI ever needs to assert on request headers/bodies or simulate
// multi-step network sequences that outgrow a queue of canned responses.

export function mockFetchOnce(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok,
    status,
    statusText: "Error",
    json: async () => data,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function mockFetchError(message: string, status = 500) {
  return mockFetchOnce({ error: message }, { ok: false, status });
}

export function mockFetchSequence(responses: Array<{ data: unknown; ok?: boolean; status?: number }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    const ok = r.ok ?? true;
    fetchMock.mockResolvedValueOnce({
      ok,
      status: r.status ?? (ok ? 200 : 500),
      statusText: "Error",
      json: async () => r.data,
    } as Response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
