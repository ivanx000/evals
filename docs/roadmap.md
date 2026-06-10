# Roadmap

## Phase 1 — Core CLI ✅
- YAML-defined eval suites
- `eval run` command with model override, filter, timeout, concurrency
- Built-in graders: `exact_match`, `contains`, `max_words`, `regex`, `llm_judge`
- Anthropic and OpenAI providers
- Semantic cache (`.eval-cache/`)
- Auto-save results to `./results/`
- `eval report` command
- `eval compare` multi-model comparison

## Phase 2 — Dashboard ✅
- `eval dashboard` spins up an Express + React app
- Overview page: pass rate chart, cost/latency charts, runs table
- Run detail page: per-case breakdown
- Compare page: side-by-side model output comparison
- REST API: `/api/runs`, `/api/runs/:id`, `/api/compare`

## Phase 3 — Deeper Eval Capabilities ✅
- **Dataset support** — `.jsonl` streaming with `{{variable}}` template substitution; `dataset_limit` and `dataset_sample`; `--dataset` CLI override
- **Multi-turn evals** — `turns: [{role, content}]` case type; intermediate null turns filled by provider; last null turn evaluated
- **Regression detection** — `eval diff <baseline> <candidate>`; per-grader comparison; exit code 1 on regression; `--format json`; Regressions tab in dashboard
- **Custom grader plugins** — auto-discovery from `graders/` folder; `.js`/`.mjs` files; conflict detection; graceful failure isolation

## Phase 4 — Future Ideas
- Streaming output support
- Batch API support for cost savings
- Fine-grained retry budgets per case
- Remote result storage (S3, GCS)
- GitHub Actions integration example
- YAML templating / suite inheritance
