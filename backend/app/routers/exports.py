"""Generic GCS export — upload inline rows as Parquet or CSV and index in BQ."""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Header, HTTPException

from ..schemas.exports import ExportList, ExportRecord, ExportRowsIn, SignedUrl
from ..services import bq, gcs, persistence

log = logging.getLogger(__name__)
router = APIRouter()


_SAFE = re.compile(r"[^a-zA-Z0-9_\-]+")


def _safe_slug(s: str, maxlen: int = 60) -> str:
    s = _SAFE.sub("_", s).strip("_")
    return s[:maxlen] or "export"


@router.post("", response_model=ExportRecord)
def create_export(
    body: ExportRowsIn,
    x_forwarded_user: str | None = Header(default=None),
) -> ExportRecord:
    persistence.ensure_table("exports")
    if not body.rows:
        raise HTTPException(422, "rows must be non-empty")

    created_at = datetime.now(timezone.utc)
    export_id = str(uuid.uuid4())
    user_email = persistence.user_email(x_forwarded_user)
    slug = _safe_slug(body.filename_hint)
    ts = created_at.strftime("%Y%m%dT%H%M%S")
    key = f"{body.kind}/{user_email or 'anon'}/{ts}_{slug}.{body.format}"

    df = pd.DataFrame(body.rows)
    if body.format == "parquet":
        gs_uri, size = gcs.write_parquet(key, df)
    else:
        gs_uri, size = gcs.write_csv(key, df)

    params_json = json.dumps(body.params) if body.params else None
    source_ids = json.dumps(body.source_ids) if body.source_ids else None

    bq.run_query(
        f"""
        INSERT INTO {bq.app_fq('exports')}
        (export_id, kind, gcs_path, format, row_count, size_bytes,
         params_json, source_ids, user_email, created_at)
        VALUES (@eid, @kind, @path, @fmt, @rc, @sz, @p, @src, @user, @ts)
        """,
        {
            "eid": export_id,
            "kind": body.kind,
            "path": gs_uri,
            "fmt": body.format,
            "rc": ("INT64", len(df)),
            "sz": ("INT64", size),
            "p": params_json,
            "src": source_ids,
            "user": user_email,
            "ts": ("TIMESTAMP", created_at),
        },
        cache=False,
    )

    return ExportRecord(
        export_id=export_id,
        kind=body.kind,
        gcs_path=gs_uri,
        format=body.format,
        row_count=len(df),
        size_bytes=size,
        params_json=params_json,
        source_ids=source_ids,
        user_email=user_email,
        created_at=created_at.isoformat().replace("+00:00", "Z"),
    )


@router.get("", response_model=ExportList)
def list_exports(kind: str | None = None, limit: int = 200) -> ExportList:
    persistence.ensure_table("exports")
    sql = f"""
    SELECT
      export_id, kind, gcs_path, format, row_count, size_bytes,
      params_json, source_ids, user_email,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
    FROM {bq.app_fq('exports')}
    WHERE (@kind IS NULL OR kind = @kind)
    ORDER BY created_at DESC
    LIMIT @lim
    """
    df = bq.run_query(
        sql,
        {"kind": kind, "lim": ("INT64", int(limit))},
        cache=False,
    )
    df = df.where(df.notna(), None)
    return ExportList(
        items=[ExportRecord(**r) for r in df.to_dict(orient="records")]
    )


@router.get("/{export_id}/signed-url", response_model=SignedUrl)
def signed_url(export_id: str, expires_in: int = 3600) -> SignedUrl:
    persistence.ensure_table("exports")
    df = bq.run_query(
        f"SELECT export_id, gcs_path FROM {bq.app_fq('exports')} WHERE export_id = @eid",
        {"eid": export_id},
        cache=False,
    )
    if df.empty:
        raise HTTPException(404, "Export not found")
    gs_uri = df.iloc[0]["gcs_path"]
    prefix = f"gs://{gcs.bucket().name}/"
    if not gs_uri.startswith(prefix):
        raise HTTPException(500, "Export path does not match configured bucket")
    key = gs_uri[len(prefix):]
    url = gcs.signed_url(key, seconds=expires_in)
    return SignedUrl(
        export_id=export_id, gcs_path=gs_uri, url=url, expires_in=expires_in
    )
