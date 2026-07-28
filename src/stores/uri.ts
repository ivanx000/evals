// Shared by both the eval-results store (./index.ts) and the benchmark-report
// store (./benchmark/index.ts) — both dispatch on the same s3://, gs:// scheme
// convention and split the same "bucket + optional key prefix" shape out of it.
export function parseBucketUri(location: string, scheme: string): { bucket: string; prefix: string } {
  const rest = location.slice(scheme.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return { bucket: rest, prefix: "" };
  return { bucket: rest.slice(0, slash), prefix: rest.slice(slash + 1) };
}
