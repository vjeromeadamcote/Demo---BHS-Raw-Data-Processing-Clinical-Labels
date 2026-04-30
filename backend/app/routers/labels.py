"""User-saved window labels, persisted to `biomarker_app.labels`.

Table is created on first use (idempotent). Reads are scoped to a USUBJID;
writes record the Workbench user email (from the WORKBENCH_USER_EMAIL env var or
the X-Forwarded-User header injected by the proxy).
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query

from ..schemas.labels import Label, LabelIn, LabelList, LabelOptions
from ..services import bq

log = logging.getLogger(__name__)
router = APIRouter()


_DDL = """
CREATE TABLE IF NOT EXISTS {labels} (
  label_id STRING NOT NULL,
  usubjid STRING NOT NULL,
  study_day_start FLOAT64 NOT NULL,
  study_day_end FLOAT64 NOT NULL,
  label STRING NOT NULL,
  custom_label STRING,
  notes STRING,
  user_email STRING,
  created_at TIMESTAMP NOT NULL
)
CLUSTER BY usubjid
"""


_schema_ensured = False


def _ensure_table() -> None:
    global _schema_ensured
    if _schema_ensured:
        return
    sql = _DDL.format(labels=bq.app_fq("labels"))
    bq.run_query(sql, cache=False)
    _schema_ensured = True


def _user_email(forwarded: str | None) -> str | None:
    return forwarded or os.getenv("WORKBENCH_USER_EMAIL") or None


@router.get("/options", response_model=LabelOptions)
def options() -> LabelOptions:
    return LabelOptions()


@router.get("/{usubjid}", response_model=LabelList)
def list_labels(
    usubjid: str,
    day_min: float | None = Query(None),
    day_max: float | None = Query(None),
) -> LabelList:
    _ensure_table()
    sql = f"""
    SELECT
      label_id,
      usubjid,
      study_day_start,
      study_day_end,
      label,
      custom_label,
      notes,
      user_email,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
    FROM {bq.app_fq('labels')}
    WHERE usubjid = @usubjid
      AND (@day_min IS NULL OR study_day_end   >= @day_min)
      AND (@day_max IS NULL OR study_day_start <= @day_max)
    ORDER BY study_day_start
    """
    df = bq.run_query(
        sql,
        {
            "usubjid": usubjid,
            "day_min": ("FLOAT64", day_min),
            "day_max": ("FLOAT64", day_max),
        },
        cache=False,
    )
    df = df.where(df.notna(), None)
    items = [Label(**r) for r in df.to_dict(orient="records")]
    return LabelList(items=items)


@router.post("", response_model=Label)
def create_label(
    body: LabelIn,
    x_forwarded_user: str | None = Header(default=None),
) -> Label:
    if body.study_day_end < body.study_day_start:
        raise HTTPException(422, "study_day_end must be >= study_day_start")
    if body.label == "custom" and not body.custom_label:
        raise HTTPException(422, "custom_label required when label='custom'")
    _ensure_table()
    label_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    user_email = _user_email(x_forwarded_user)
    sql = f"""
    INSERT INTO {bq.app_fq('labels')}
    (label_id, usubjid, study_day_start, study_day_end, label, custom_label,
     notes, user_email, created_at)
    VALUES (@label_id, @usubjid, @day_start, @day_end, @label, @custom_label,
            @notes, @user_email, @created_at)
    """
    bq.run_query(
        sql,
        {
            "label_id": label_id,
            "usubjid": body.usubjid,
            "day_start": ("FLOAT64", body.study_day_start),
            "day_end": ("FLOAT64", body.study_day_end),
            "label": body.label,
            "custom_label": body.custom_label,
            "notes": body.notes,
            "user_email": user_email,
            "created_at": ("TIMESTAMP", created_at),
        },
        cache=False,
    )
    return Label(
        label_id=label_id,
        usubjid=body.usubjid,
        study_day_start=body.study_day_start,
        study_day_end=body.study_day_end,
        label=body.label,
        custom_label=body.custom_label,
        notes=body.notes,
        user_email=user_email,
        created_at=created_at.isoformat().replace("+00:00", "Z"),
    )


@router.delete("/{label_id}")
def delete_label(label_id: str) -> dict:
    _ensure_table()
    sql = f"DELETE FROM {bq.app_fq('labels')} WHERE label_id = @label_id"
    bq.run_query(sql, {"label_id": label_id}, cache=False)
    return {"deleted": label_id}
