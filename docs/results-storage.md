# Results Storage

`evals run`, `evals batch`, `evals report`, and `evals dashboard` all read and
write run results through a `results_dir` value. By default that's a local
directory, but it can also point at an S3 or GCS bucket — useful for CI (a
durable baseline that doesn't depend on `actions/cache` retention limits, see
[ci.md](./ci.md)) or for teams who want a shared results history instead of
everyone's local `./results/`.

## Configuring a backend

Set `results_dir` in `.evalrc.json` (or pass `--results-dir` to `evals
dashboard`) to one of:

| Form | Backend |
|---|---|
| `./results` (default) | Local filesystem |
| `s3://bucket-name/optional/prefix` | Amazon S3 |
| `gs://bucket-name/optional/prefix` | Google Cloud Storage |

```json
{
  "results_dir": "s3://my-team-evals/ci-results"
}
```

No other config is needed — every command that reads or writes results
(`run`, `batch`, `report`, `dashboard`) resolves the backend from this one
value. `evals diff <baseline> <candidate>` also accepts `s3://`/`gs://` URIs
directly as its two file arguments, in addition to local paths.

## Credentials

Auth follows each cloud's standard credential chain — there are no
`evals`-specific auth flags:

- **S3**: environment variables (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  / `AWS_SESSION_TOKEN`), `~/.aws/credentials`, or an attached IAM role.
  Also requires a region — set `AWS_REGION` (or `AWS_DEFAULT_REGION`) if it's
  not otherwise configured.
- **GCS**: Application Default Credentials — set
  `GOOGLE_APPLICATION_CREDENTIALS` to a service account key file, run `gcloud
  auth application-default login`, or rely on the metadata server when
  running on GCP.

A misconfigured bucket or missing credentials produces a clear error message
(missing region, missing credentials, bucket not found, access denied) rather
than a raw SDK stack trace.

## Dependencies are optional

`@aws-sdk/client-s3` and `@google-cloud/storage` are **peer dependencies**,
not regular dependencies — the default `npm install -g evals` doesn't pull
either one in. They're only `import()`-ed lazily, the moment a command
actually needs to talk to `s3://` or `gs://`. If you use a remote
`results_dir` and the corresponding package isn't installed, you'll get:

```
S3 results storage requires the @aws-sdk/client-s3 package.
  Install it with: npm install @aws-sdk/client-s3
```

Install whichever one you need alongside `evals`:

```bash
npm install @aws-sdk/client-s3        # for s3://
npm install @google-cloud/storage     # for gs://
```

## Architecture

Results persistence goes through a `ResultsStore` interface
(`src/stores/types.ts`) — `save(result)`, `list()`, `load(id)` — implemented
by `LocalResultsStore`, `S3ResultsStore`, and `GCSResultsStore`
(`src/stores/local.ts`, `s3.ts`, `gcs.ts`), the same per-backend pattern used
by `src/providers/`. `makeResultsStore(location)` in `src/stores/index.ts`
picks the implementation based on the `results_dir` string's scheme
(`s3://`, `gs://`, otherwise local path). `saveResult`/`listResults`/
`loadResult` in `src/runner.ts` are thin async wrappers around this — `list()`
and `save()` return fully-qualified ids (a local path or an `s3://`/`gs://`
URI), and `load(id)` is self-sufficient: it re-parses the bucket and key out
of the id itself, so an id from one store call always resolves correctly
regardless of which `results_dir` produced it.

Benchmark reports (`reports_dir`, separate from `results_dir`) follow the
same pattern one level down, with a small interface extension for the
per-benchmark-name nesting and the optional Markdown report — see
[benchmark-storage.md](./benchmark-storage.md).
