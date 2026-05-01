from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .routers import cohorts, exports, feature_sets, features, labels, signals, subjects, wsm

settings = get_settings()

app = FastAPI(
    title="Digital Biomarker Explorer",
    version="0.1.0",
    description="BHS sensor data explorer backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.env == "dev" else [],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
app.include_router(features.router, prefix="/api/features", tags=["features"])
app.include_router(cohorts.router, prefix="/api/cohorts", tags=["cohorts"])
app.include_router(labels.router, prefix="/api/labels", tags=["labels"])
app.include_router(feature_sets.router, prefix="/api/feature-sets", tags=["feature-sets"])
app.include_router(exports.router, prefix="/api/exports", tags=["exports"])
app.include_router(wsm.router, prefix="/api/wsm", tags=["wsm"])


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "env": settings.env,
        "bhs_project": settings.bhs_project,
        "app_project": settings.app_project,
        "use_demo_tables": settings.use_demo_tables,
    }


# Serve the built frontend (Vite dist/) at the app root. Static mounts are registered
# LAST so /api/* takes precedence. Using StaticFiles(html=True) makes it serve
# index.html for the root and fall through for asset paths.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(_FRONTEND_DIST), html=True),
        name="frontend",
    )
