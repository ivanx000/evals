# Benchmark Report Storage

`evals benchmark run <name>`, `evals benchmark list`, and `evals dashboard`
read and write benchmark reports through a `reports_dir` value — the same
kind of local-path-or-cloud-URI setting `results_dir` uses for eval run
results (see [results-storage.md](./results-storage.md)). By default it's a
local directory, but it can also point at an S3 or GCS bucket, for the same
reasons: a durable CI baseline, or a shared report history for the team.

## Configuring a backend

Set `reports_dir` in `.evalrc.json` (or pass `--report-dir` to `evals
benchmark run`/`evals benchmark list`, `--reports-dir` to `evals dashboard`)
to one of:

| Form | Backend |
|---|---|
| `./reports` (default) | Local filesystem |
| `s3://bucket-name/optional/prefix` | Amazon S3 |
| `gs://bucket-name/optional/prefix` | Google Cloud Storage |

```json
{
  "results_dir": "s3://my-team-evals/ci-results",
  "reports_dir": "s3://my-team-evals/ci-reports"
}
```

`results_dir` and `reports_dir` are independent settings — a remote
`results_dir` does not imply a remote `reports_dir`, and vice versa. Both
default to a local directory if omitted.

Credentials and optional-dependency behavior (`@aws-sdk/client-s3` /
`@google-cloud/storage` as lazy-loaded peer deps, clear errors on missing
credentials/buckets) are identical to `results_dir` — see
[results-storage.md](./results-storage.md#credentials) for the full writeup.

## How reports nest

Unlike eval results (a flat directory of files), benchmark reports nest
under a per-benchmark-name subdirectory: `reports_dir/<slugified-benchmark-
name>/<timestamp>-<model>.json` (plus a `.md` sibling — see below). This
mirrors what `saveBenchmarkReportJson` always did for the local store; the
same nesting now applies to the S3/GCS key layout too, with the slugified
benchmark name as a path segment between the configured prefix and the
filename.

## Interface

`BenchmarkReportStore` (`src/stores/benchmark/types.ts`) is deliberately a
small extension of the plain `ResultsStore` shape:

```ts
interface BenchmarkReportStore {
  save(report: BenchmarkReport): Promise<string>;
  saveMarkdown(report: BenchmarkReport, markdown: string): Promise<string>;
  list(benchmarkName?: string): Promise<string[]>;
  load(id: string): Promise<BenchmarkReport>;
}
```

Two differences from `ResultsStore`, both driven by how benchmark reports
are actually consumed:

- **`list()` takes an optional `benchmarkName`.** Regression detection
  (`findPreviousReport` in `src/benchmark.ts`) only ever needs one
  benchmark's history, every time a benchmark runs. Scoping the listing to
  that benchmark's subdirectory/prefix means it costs one filtered `List`
  call, not a scan of every report the team has ever saved. `evals benchmark
  list --benchmark <name>` and the dashboard's `/api/benchmarks?benchmark=`
  filter use the same parameter to the same end.
- **`saveMarkdown()`.** The Markdown report
  (`generateMarkdownReport`/`saveBenchmarkReportMarkdown` in
  `src/benchmark-reporter.ts`) is a human-facing summary — nothing in the
  dashboard or regression detection reads it back, only the JSON report is
  ever loaded programmatically. It's persisted through the same store
  (so it lands next to the JSON report, on whichever backend is configured)
  rather than skipped for remote backends, since a team using
  `s3://.../ci-reports` presumably wants the readable summary there too, not
  only on whichever CI runner happened to produce it.

Implemented by `LocalBenchmarkStore`, `S3BenchmarkStore`, `GCSBenchmarkStore`
(`src/stores/benchmark/{local,s3,gcs}.ts`), dispatched by
`makeBenchmarkStore(reportsDir)` in `src/stores/benchmark/index.ts` — same
scheme-based dispatch as `makeResultsStore`, sharing its `parseBucketUri`
helper (`src/stores/uri.ts`). The S3/GCS implementations reuse the lazy SDK
loaders and error formatters (`loadAwsSdk`/`formatS3Error`,
`loadGcsSdk`/`formatGcsError`) exported from `src/stores/s3.ts` and
`src/stores/gcs.ts`, so credential/bucket error messages read identically
regardless of whether they came from a results or a reports call.

`findPreviousReport`, `listBenchmarkReports`, and `saveBenchmarkReportJson`
in `src/benchmark.ts` are async wrappers around the store, the same way
`saveResult`/`listResults`/`loadResult` in `src/runner.ts` wrap
`ResultsStore`. Malformed or unreadable individual reports are skipped
(logged nowhere, matching the project's fail-gracefully convention) rather
than aborting the whole listing or regression check.

## Dashboard

`evals dashboard`'s benchmark endpoints (`GET /api/benchmarks`,
`GET /api/benchmarks/:id`) resolve their reports directory from, in order:
an explicit `--reports-dir` flag, `reports_dir` in `.evalrc.json`, or —
only when `results_dir` is a local path — a `reports/` sibling directory
next to it. If `results_dir` is remote (`s3://`/`gs://`) and no
`--reports-dir`/`reports_dir` was given, the sibling-directory guess is
skipped (it would otherwise resolve to a nonsensical local path) and the
plain `./reports` default is used instead.
