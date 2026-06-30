# Dashboard

The `evals dashboard` command spins up a local web app that reads from your `results/` folder and lets you explore eval runs visually.

## Starting the dashboard

```bash
# Production (requires a built UI)
evals dashboard

# With options
evals dashboard --port 8080 --results-dir ./my-results
```

Flags:

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3000` | Port for the Express server |
| `--results-dir` | `./results` | Directory to scan for `*.json` result files |
| `--config` | auto | Path to `.evalrc.json` |

The server opens the browser automatically. Press Ctrl+C to stop.

## Development mode

Run both the Express API and the Vite dev server concurrently:

```bash
npm run dashboard:dev
```

- Vite dev server: `http://localhost:5173` (hot reload)
- Express API: `http://localhost:3000`
- Vite proxies `/api/*` → Express automatically

## Building for production

```bash
cd dashboard-ui && npm run build
```

The compiled app lands in `dashboard-ui/dist/`. The Express server serves it as static files when it exists.

## Pages

### Overview (`/`)

- **Summary cards** — total runs, overall pass rate, average latency, total estimated cost
- **Pass rate chart** — line chart over time, one line per model (Recharts)
- **Latency chart** — bar chart of average latency per run
- **Cost chart** — bar chart of estimated cost per run
- **Runs table** — all runs sorted by date with View / Compare actions

### Run detail (`/runs/:id`)

Drill into a single evals run:

- Header showing suite name, model, provider, pass rate, latency, cost
- Filters: pass/fail toggle, grader type dropdown, free-text search
- Expandable **CaseRow** for each case showing:
  - Full prompt and model output
  - Per-grader result chips (green pass / red fail)
  - LLM judge score (1-5) and reasoning if applicable
  - Token counts and per-case cost

### Compare (`/compare`)

Select 2+ runs from the table, then see a side-by-side **ModelCompareTable**:

- Rows = cases, columns = selected runs/models
- Cells show output snippet, pass/fail, latency
- Rows where models disagree (one passes, one fails) are highlighted in yellow
- Summary row at the bottom shows pass rate per run

## REST API

The Express server exposes three endpoints:

### `GET /api/runs`

Returns all runs as summaries, sorted newest first.

```json
[
  {
    "id": "abc123",
    "timestamp": "2026-01-10T12:00:00Z",
    "suite_name": "Summarization quality",
    "total": 4,
    "passed": 3,
    "failed": 1,
    "pass_rate": 0.75,
    "avg_latency_ms": 1200,
    "total_cost_usd": 0.0012,
    "models": ["claude-haiku-4-5"]
  }
]
```

### `GET /api/runs/:id`

Returns the full `RunResult` JSON for a single result file (all cases included).

### `GET /api/compare?runIds=id1,id2`

Returns cases from multiple runs merged by `case_id`:

```json
[
  {
    "caseName": "summarize-article-1",
    "results": [
      { "runId": "abc123", "model": "claude-haiku-4-5", "output": "...", "passed": true, "latency_ms": 1100 },
      { "runId": "def456", "model": "claude-sonnet-4-6", "output": "...", "passed": true, "latency_ms": 780 }
    ]
  }
]
```

## Architecture

```
src/dashboard/
├── server.ts        # Express app factory + startServer()
├── api.ts           # Route handler functions (loadAllRuns, toSummary, etc.)
├── routes.ts        # Wires /api/* routes onto the Express app
└── start-dev.ts     # Entry point for npm run dashboard:dev

dashboard-ui/
├── src/
│   ├── App.tsx               # BrowserRouter + Nav + Routes
│   ├── types.ts              # Mirror of src/types.ts RunResult shape
│   ├── hooks/useRuns.ts      # useRuns, useRun, useCompare fetch hooks
│   ├── pages/
│   │   ├── Overview.tsx
│   │   ├── RunDetail.tsx
│   │   └── Compare.tsx
│   └── components/
│       ├── PassRateChart.tsx
│       ├── LatencyChart.tsx
│       ├── CostChart.tsx
│       ├── RunsTable.tsx
│       ├── CaseRow.tsx
│       └── ModelCompareTable.tsx
├── vite.config.ts            # Proxies /api → localhost:3000
└── tailwind.config.js        # Dark mode via class strategy
```
