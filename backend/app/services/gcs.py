"""Thin wrapper around google-cloud-storage for the export bucket."""
from __future__ import annotations

import io
import logging
import threading
from datetime import timedelta

import pandas as pd
from google.cloud import storage

from ..config import get_settings

log = logging.getLogger(__name__)

_client: storage.Client | None = None
_lock = threading.Lock()


def client() -> storage.Client:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = storage.Client(project=get_settings().app_project)
    return _client


def bucket() -> storage.Bucket:
    return client().bucket(get_settings().export_bucket)


def gs_path(key: str) -> str:
    return f"gs://{get_settings().export_bucket}/{key}"


def write_parquet(key: str, df: pd.DataFrame) -> tuple[str, int]:
    """Write a DataFrame as Parquet. Returns (gs_path, size_bytes)."""
    buf = io.BytesIO()
    df.to_parquet(buf, index=False, engine="pyarrow")
    data = buf.getvalue()
    blob = bucket().blob(key)
    blob.upload_from_string(data, content_type="application/vnd.apache.parquet")
    log.info("wrote gs://%s/%s (%d bytes, %d rows)", blob.bucket.name, key, len(data), len(df))
    return gs_path(key), len(data)


def write_csv(key: str, df: pd.DataFrame) -> tuple[str, int]:
    """Write a DataFrame as CSV. Returns (gs_path, size_bytes)."""
    data = df.to_csv(index=False).encode("utf-8")
    blob = bucket().blob(key)
    blob.upload_from_string(data, content_type="text/csv; charset=utf-8")
    log.info("wrote gs://%s/%s (%d bytes, %d rows)", blob.bucket.name, key, len(data), len(df))
    return gs_path(key), len(data)


def delete(key: str) -> None:
    try:
        bucket().blob(key).delete()
    except Exception as e:  # noqa: BLE001
        log.warning("gcs delete failed for %s: %s", key, e)


def signed_url(key: str, seconds: int = 3600) -> str:
    return bucket().blob(key).generate_signed_url(
        version="v4",
        expiration=timedelta(seconds=seconds),
        method="GET",
    )
