# Digital Biomarker Explorer

A Verily Workbench custom app for exploring BHS (Baseline Health Study) sensor
data end-to-end: **signal → feature → cohort**, with window labeling, saved
cohorts, saved feature runs, and GCS exports ready to drop into a notebook.

![Pages: Subjects · Signal Explorer · Feature Lab · Cohort Insights · My Work]

## What it does

- **Subject Browser** — filterable list of 102 stratified demo subjects with
  data-quality wear-fraction bars.
- **Signal Explorer** — stacked, zoom-linked Plotly panels for PULSE, STEP,
  HEMET (HRV), AMCLASS (activity class), SLPSTG (sleep stages), ANNOTATIONS
  (wear). A composite "day navigator" heatmap jumps you to days with the most
  activity, best wear, or best sleep. Drag to select a window; save as a
  labeled annotation; launch into Feature Lab with one click.
- **Feature Lab** — compute a curated catalog of 12 scipy-based features
  (HR summary, HRV approx, PSD bands, step cadence, activity-class fractions,
  sleep metrics) over any subject + window. Save runs to BigQuery +
  GCS Parquet; save a selection as a reusable Feature Set.
- **Cohort Insights** — two views:
  - *Stratified distribution* with per-subject strip dots, Welch's t-test,
    and Cohen's d between the top two groups.
  - *Feature × feature scatter* with Pearson correlation, colored by a
    stratifier.
  Stratifiers include demographics (sex, age bin, race) **and clinical scores**
  (PHQ-9 depression severity, GAD-7 anxiety severity, 10-year ASCVD CV risk).
  Named cohorts persist in BigQuery with a materialized member list.
- **My Work** — everything saved across sessions: cohorts, feature runs,
  feature sets, and GCS exports with one-click signed-URL downloads.

## Architecture

```
React SPA (Vite / Tailwind / Plotly)  ──HTTPS──▶  Workbench proxy at :8080
                                                   │
                                                   ▼
                                      FastAPI + uvicorn
                                       │               │
                               reads   │               │   writes
                                       ▼               ▼
                     wb-spotless-eggplant-4340.*    biomarker_app.{labels,
                     (BHS sensor + clinical tables)   cohorts, cohort_members,
                                                      features, feature_sets,
                                                      exports}  +  GCS bucket
                                                      biomarker-app-exports-*
```

- All data stays in the workspace project.
- Bulky artifacts (feature Parquet, filtered subject lists) land in GCS; the
  `exports` BigQuery table indexes every path with provenance.
- 102 demo subjects were materialized into `biomarker_app.*_demo` tables
  clustered by `(USUBJID, study_day_int)` — single-subject queries scan MBs,
  not TBs.

## Deploy as a Workbench custom app

The repo is a ready-to-run Workbench custom app:

- `.devcontainer.json` at the repo root
- `docker-compose.yaml` with `container_name: application-server` and the
  `app-network` external network
- Multi-stage `Dockerfile` that builds the React SPA and serves it from
  FastAPI on port 8080

### Create the app in Workbench

In the Workbench UI, create a custom app pointing at this repo:
- **Repository:** `https://github.com/myoungcha-verily/DBM-explorer.git`
- **Branch:** `main`
- **Folder:** `.`

Once the app is **RUNNING**, open it at:

```
https://workbench.verily.com/app/<APP_UUID>/proxy/8080/
```

Get your app UUID:

```bash
wb app list --format=json | jq -r '.[] | select(.status == "RUNNING") | .id' | head -1
```

## Local development

Two terminals (hot reload on both):

```bash
# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -e .[dev]
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload

# Frontend
cd frontend
npm install
npm run dev   # Vite dev server on :5173, proxies /api to :8080
```

For a production-like local run:

```bash
cd frontend && npm run build && cd ..
cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Or fully containerized (matches the Workbench deploy):

```bash
docker network create app-network
docker compose up --build
# → http://localhost:8080
```

## Project layout

```
.
├── .devcontainer.json           Workbench devcontainer pointer
├── docker-compose.yaml          container_name: application-server
├── Dockerfile                   multi-stage: node build + python runtime
├── devcontainer-template.json   app metadata
├── backend/                     FastAPI + BigQuery
│   ├── app/
│   │   ├── main.py              entrypoint; serves SPA + /api/*
│   │   ├── routers/             subjects, signals, features, cohorts,
│   │   │                        labels, feature_sets, exports
│   │   ├── services/            bq.py, gcs.py, persistence.py
│   │   ├── features/            curated feature registry (scipy/numpy)
│   │   └── schemas/             Pydantic models
│   └── tests/                   pytest smoke tests against live BQ
├── frontend/                    React + Vite + TS + Plotly + Tailwind
│   ├── src/
│   │   ├── pages/               SubjectBrowser · SignalExplorer · FeatureLab
│   │   │                        · CohortInsights · SavedWork
│   │   ├── components/          PlotlyChart, SignalPanel, DayNavigator,
│   │   │                        AnnotationSidebar, SaveDialog, InfoTip,
│   │   │                        HelpPanel, ErrorBoundary
│   │   └── api/                 typed clients + TanStack Query hooks
│   └── public/                  favicon.svg, plotly.min.js (UMD)
└── docs/QUICKSTART.md
```

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `USE_DEMO_TABLES` | `true` | Route sensor reads to clustered `biomarker_app.*_demo` |
| `BQ_MAX_BYTES_BILLED` | 2 TB (demo) / 50 GB (prod) | Cost guardrail on every BQ query |
| `APP_ENV` | `dev` | Toggles permissive CORS |
| `WORKBENCH_USER_EMAIL` | forwarded by Workbench | Identity for every write |
| `WORKBENCH_biomarker_app_exports` | the GCS bucket name | Override export bucket |

## BigQuery tables the app creates

All idempotent (`CREATE TABLE IF NOT EXISTS`) under
`<workspace>.biomarker_app`:

| Table | Purpose |
|---|---|
| `labels` | User-saved window labels (walking / sleep / artifact / custom). |
| `cohorts` | Saved cohort definitions (filter JSON + metadata). |
| `cohort_members` | Materialized USUBJID list per cohort. |
| `features` | Every saved Feature Lab run (one row per metric). |
| `feature_sets` | Named reusable feature bundles. |
| `exports` | GCS artifact index (path + format + rows + bytes). |

## License

Internal. Confidential (BHS data).
