const RETRYABLE_STATUS = new Set([429, 500, 502, 503]);

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e.status !== undefined) return RETRYABLE_STATUS.has(e.status);
  const msg = e.message ?? "";
  return (
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      const jitter = 0.5 + Math.random() * 0.5;
      await sleep(baseDelayMs * Math.pow(2, attempt) * jitter);
    }
  }
  throw lastErr;
}
