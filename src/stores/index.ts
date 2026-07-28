import type { ResultsStore } from "./types.js";
import { LocalResultsStore } from "./local.js";
import { S3ResultsStore } from "./s3.js";
import { GCSResultsStore } from "./gcs.js";
import { parseBucketUri } from "./uri.js";

export type { ResultsStore } from "./types.js";

// `location` is either a local directory path or an `s3://bucket/prefix` /
// `gs://bucket/prefix` URI (also accepted: a full object URI when called
// from loadResult, since the "prefix" component is only ever used as a
// directory root for save/list — load() re-parses whatever id it's given).
export function makeResultsStore(location: string): ResultsStore {
  if (location.startsWith("s3://")) {
    const { bucket, prefix } = parseBucketUri(location, "s3://");
    return new S3ResultsStore(bucket, prefix);
  }
  if (location.startsWith("gs://")) {
    const { bucket, prefix } = parseBucketUri(location, "gs://");
    return new GCSResultsStore(bucket, prefix);
  }
  return new LocalResultsStore(location);
}
