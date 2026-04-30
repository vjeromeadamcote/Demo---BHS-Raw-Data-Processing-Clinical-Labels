"""CRUD helpers for the biomarker_app saved-work tables.

All tables are created idempotently on first use. User identity comes from the
WORKBENCH_USER_EMAIL env var (local) or the X-Forwarded-User header (behind the
Workbench proxy).
"""
from __future__ import annotations

import logging
import os
import threading

from . import bq

log = logging.getLogger(__name__)

# ── DDL ──────────────────────────────────────────────────────────────────────

_DDL = {
    "features": """
        CREATE TABLE IF NOT EXISTS {t} (
          run_id STRING NOT NULL,
          feature_id STRING NOT NULL,
          usubjid STRING NOT NULL,
          study_day_start FLOAT64,
          study_day_end FLOAT64,
          value_key STRING NOT NULL,
          value FLOAT64,
          algorithm_version STRING,
          params_json STRING,
          user_email STRING,
          created_at TIMESTAMP NOT NULL,
          run_name STRING,
          run_description STRING
        )
        CLUSTER BY usubjid, feature_id
    """,
    "cohorts": """
        CREATE TABLE IF NOT EXISTS {t} (
          cohort_id STRING NOT NULL,
          name STRING NOT NULL,
          description STRING,
          filter_json STRING NOT NULL,
          member_count INT64 NOT NULL,
          user_email STRING,
          created_at TIMESTAMP NOT NULL
        )
        CLUSTER BY user_email, cohort_id
    """,
    "cohort_members": """
        CREATE TABLE IF NOT EXISTS {t} (
          cohort_id STRING NOT NULL,
          usubjid STRING NOT NULL
        )
        CLUSTER BY cohort_id
    """,
    "feature_sets": """
        CREATE TABLE IF NOT EXISTS {t} (
          feature_set_id STRING NOT NULL,
          name STRING NOT NULL,
          description STRING,
          feature_ids STRING NOT NULL,
          params_json STRING,
          user_email STRING,
          created_at TIMESTAMP NOT NULL
        )
        CLUSTER BY user_email
    """,
    "exports": """
        CREATE TABLE IF NOT EXISTS {t} (
          export_id STRING NOT NULL,
          kind STRING NOT NULL,
          gcs_path STRING NOT NULL,
          format STRING NOT NULL,
          row_count INT64,
          size_bytes INT64,
          params_json STRING,
          source_ids STRING,
          user_email STRING,
          created_at TIMESTAMP NOT NULL
        )
        CLUSTER BY user_email, kind
    """,
}

_ensured: set[str] = set()
_ensure_lock = threading.Lock()


def ensure_table(table: str) -> None:
    with _ensure_lock:
        if table in _ensured:
            return
        ddl = _DDL.get(table)
        if ddl is None:
            raise ValueError(f"No DDL for {table!r}")
        bq.run_query(ddl.format(t=bq.app_fq(table)), cache=False)
        _ensured.add(table)


def ensure_all() -> None:
    for t in _DDL:
        ensure_table(t)


def user_email(forwarded: str | None = None) -> str | None:
    return forwarded or os.getenv("WORKBENCH_USER_EMAIL") or None
