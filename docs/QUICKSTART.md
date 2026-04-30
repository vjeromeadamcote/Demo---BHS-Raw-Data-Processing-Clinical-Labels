# Quickstart

## Run locally (current behaviour)

Backend + built frontend served together on port 8080:

```bash
cd /home/jupyter/repos/biomarker-explorer
# 1. Backend venv & deps
/opt/conda/bin/python -m venv backend/.venv
backend/.venv/bin/pip install -e 'backend[dev]'

# 2. Frontend deps & build
cd frontend && npm install && npm run build && cd ..

# 3. Start backend (serves API + built SPA)
cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080
```

## Open in browser (via Workbench proxy)

The app is at:
```
https://<this-app-uuid>.workbench-app.verily.com/proxy/8080/
```

Get your app UUID from:
```bash
wb app list --format=json | python3 -c 'import json,sys; [print(a["proxyUrl"]) for a in json.load(sys.stdin) if a["status"] == "RUNNING"]'
```

## Dev loop (hot reload)

Two terminals:

```bash
# backend (auto reload on .py changes)
cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8080

# frontend (hot module reload)
cd frontend && npm run dev  # serves on :5173; proxies /api to :8080
```

## Smoke tests

```bash
cd backend && .venv/bin/pytest tests/ -q
```

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `USE_DEMO_TABLES` | `true` | Route sensor tables to clustered demo materialization in `biomarker_app.*_demo` |
| `BQ_MAX_BYTES_BILLED` | 2 TB (demo) / 50 GB (prod) | Hard cost cap on every BQ query |
| `APP_ENV` | `dev` | `dev` enables permissive CORS |

## Endpoints

- `GET /` — SPA (React)
- `GET /api/health`
- `GET /api/subjects?limit=&sex=&min_age=&max_age=&min_wear=`
- `GET /api/subjects/{usubjid}` — detail + per-modality presence
- `GET /api/signals/{usubjid}?day_min=&day_max=&modalities=PULSE&modalities=STEP&...&target_points=`
