import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/providers/retry.js";

function statusError(status: number, message = "error"): Error {
  return Object.assign(new Error(message), { status });
}

describe("withRetry", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns the result immediately on success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Retryable status codes ──────────────────────────────────────────────────

  it.each([429, 500, 502, 503])(
    "retries and eventually succeeds after a %i error",
    async (status) => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(statusError(status))
        .mockResolvedValueOnce("ok");
      const result = await withRetry(fn, 3, 1);
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    }
  );

  it("retries up to maxRetries times then throws the last error", async () => {
    const err = statusError(500, "persistent failure");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 2, 1)).rejects.toThrow("persistent failure");
    // initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ── Retryable network errors (identified by message) ────────────────────────

  it.each(["ECONNRESET", "ETIMEDOUT", "fetch failed", "some network issue"])(
    "retries on network errors matching %s",
    async (message) => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error(message))
        .mockResolvedValueOnce("ok");
      const result = await withRetry(fn, 3, 1);
      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    }
  );

  // ── Non-retryable errors ─────────────────────────────────────────────────────

  it("does not retry on 401", async () => {
    const err = statusError(401, "unauthorized");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 1)).rejects.toThrow("unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a non-retryable status code (e.g. 400)", async () => {
    const err = statusError(400, "bad request");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 1)).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on a generic error with no status and no recognized message", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(fn, 3, 1)).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Backoff behavior ─────────────────────────────────────────────────────────

  it("applies exponential backoff with jitter within expected bounds", async () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(statusError(500))
      .mockRejectedValueOnce(statusError(500))
      .mockResolvedValueOnce("ok");

    const baseDelayMs = 100;
    await withRetry(fn, 3, baseDelayMs);

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1] as number);
    expect(delays).toHaveLength(2);
    // attempt 0: base * 2^0 * [0.5, 1.0] = [50, 100]
    expect(delays[0]).toBeGreaterThanOrEqual(baseDelayMs * 0.5);
    expect(delays[0]).toBeLessThanOrEqual(baseDelayMs);
    // attempt 1: base * 2^1 * [0.5, 1.0] = [100, 200]
    expect(delays[1]).toBeGreaterThanOrEqual(baseDelayMs);
    expect(delays[1]).toBeLessThanOrEqual(baseDelayMs * 2);

    setTimeoutSpy.mockRestore();
  });

  it("defaults to maxRetries=3 and baseDelayMs=1000 when not specified", async () => {
    const err = statusError(500, "always fails");
    const fn = vi.fn().mockRejectedValue(err);
    // Use a spy to avoid actually waiting on the real 1s+ backoff delays.
    vi.spyOn(global, "setTimeout").mockImplementation(((cb: () => void) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await expect(withRetry(fn)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries

    vi.restoreAllMocks();
  });
});
