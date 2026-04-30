"""Smoke tests against live BigQuery.

These make real BQ calls and will be skipped if the demo dataset isn't materialized.
"""
from __future__ import annotations

import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import bq

client = TestClient(app)


def _demo_ready() -> bool:
    try:
        sql = f"SELECT COUNT(*) AS n FROM {bq.app_fq('demo_subjects')}"
        df = bq.run_query(sql, cache=False)
        return not df.empty and int(df["n"].iloc[0]) > 0
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    os.getenv("SKIP_LIVE_BQ") == "1" or not _demo_ready(),
    reason="demo_subjects not materialized or live BQ disabled",
)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_list_subjects():
    r = client.get("/api/subjects?limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] > 0
    assert len(body["items"]) == body["total"]
    first = body["items"][0]
    for k in ("usubjid", "sex", "age_at_enrollment"):
        assert k in first


def test_subject_detail():
    r = client.get("/api/subjects?limit=1")
    usubjid = r.json()["items"][0]["usubjid"]
    r = client.get(f"/api/subjects/{usubjid}")
    assert r.status_code == 200
    body = r.json()
    assert body["usubjid"] == usubjid
    assert "modalities" in body


def test_signals_one_day():
    r = client.get("/api/subjects?limit=1")
    usubjid = r.json()["items"][0]["usubjid"]
    r = client.get(
        f"/api/signals/{usubjid}",
        params=[
            ("day_min", 30),
            ("day_max", 30),
            ("modalities", "PULSE"),
            ("modalities", "STEP"),
            ("modalities", "HEMET"),
            ("modalities", "AMCLASS"),
            ("modalities", "SLPSTG"),
            ("modalities", "ANNOTATIONS"),
            ("target_points", 2000),
        ],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["usubjid"] == usubjid
    mods = {s["modality"] for s in body["series"]}
    assert {"PULSE", "STEP", "HEMET", "AMCLASS", "SLPSTG", "ANNOTATIONS"} == mods


def test_signals_range_guard():
    r = client.get(
        "/api/signals/XYZ",
        params=[("day_min", 0), ("day_max", 5000), ("modalities", "PULSE")],
    )
    assert r.status_code == 422
