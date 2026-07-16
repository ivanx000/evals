# Roadmap

## Phase 1 — Core CLI ✅
- YAML-defined eval suites
- `evals run` command with model override, filter, timeout, concurrency
- Built-in graders: `exact_match`, `contains`, `max_words`, `regex`, `llm_judge`
- Anthropic and OpenAI providers
- Semantic cache (`.eval-cache/`)
- Auto-save results to `./results/`
- `evals report` command
- `evals compare` multi-model comparison

## Phase 2 — Dashboard ✅
- `evals dashboard` spins up an Express + React app
- Overview page: pass rate chart, cost/latency charts, runs table
- Run detail page: per-case breakdown
- Compare page: side-by-side model output comparison
- REST API: `/api/runs`, `/api/runs/:id`, `/api/compare`

## Phase 3 — Deeper Eval Capabilities ✅
- **Dataset support** — `.jsonl` streaming with `{{variable}}` template substitution; `dataset_limit` and `dataset_sample`; `--dataset` CLI override
- **Multi-turn evals** — `turns: [{role, content}]` case type; intermediate null turns filled by provider; last null turn evaluated
- **Regression detection** — `evals diff <baseline> <candidate>`; per-grader comparison; exit code 1 on regression; `--format json`; Regressions tab in dashboard
- **Custom grader plugins** — auto-discovery from `graders/` folder; `.js`/`.mjs` files; conflict detection; graceful failure isolation

## Phase 4 — Production Hardening ✅ (partial)
- **Batch API support** — `evals run --batch` submits all cases to Anthropic Batches API (50% cost reduction, async); polls with exponential backoff until complete
- **Batch resume** — `evals batch <batchId> <suite>` re-attaches to an in-progress or completed batch; recovers from interrupted runs without re-submitting
- **GitHub Actions integration** — `.github/workflows/eval.yml` runs `evals run` on every push/PR; fails the check on any case failure; caches `node_modules`

## Future Ideas
- Streaming output support
- Fine-grained retry budgets per case
- Remote result storage (S3, GCS)
- YAML templating / suite inheritance
