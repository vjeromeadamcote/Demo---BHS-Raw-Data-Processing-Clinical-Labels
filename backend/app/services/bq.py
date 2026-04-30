"""BigQuery query helpers with cost guardrails and in-process LRU caching.

All sensor queries MUST be scoped by USUBJID + study_day_int range — PULSE alone
is 119B rows.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
from collections import OrderedDict
from typing import Any, Sequence

import pandas as pd
from google.cloud import bigquery
from google.cloud.bigquery import QueryJobConfig, ScalarQueryParameter, ArrayQueryParameter

from ..config import get_settings

log = logging.getLogger(__name__)

_client: bigquery.Client | None = None
_client_lock = threading.Lock()


def client() -> bigquery.Client:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = bigquery.Client(project=get_settings().app_project)
    return _client


class _LRU:
    def __init__(self, max_items: int):
        self.max = max_items
        self.store: OrderedDict[str, pd.DataFrame] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key: str) -> pd.DataFrame | None:
        with self.lock:
            if key in self.store:
                self.store.move_to_end(key)
                return self.store[key]
            return None

    def put(self, key: str, val: pd.DataFrame) -> None:
        with self.lock:
            self.store[key] = val
            self.store.move_to_end(key)
            while len(self.store) > self.max:
                self.store.popitem(last=False)


_cache = _LRU(get_settings().cache_max_items)


def _cache_key(sql: str, params: dict[str, Any]) -> str:
    h = hashlib.sha256()
    h.update(sql.encode())
    h.update(json.dumps(params, sort_keys=True, default=str).encode())
    return h.hexdigest()


def _to_qp(params: dict[str, Any]) -> list:
    """Convert a dict of params to BigQuery query parameters.

    Values may be typed explicitly as a (type, value) tuple, e.g. ("INT64", None)
    to pass a typed NULL. Otherwise the type is inferred from the Python value;
    None is inferred as STRING NULL (use the tuple form for other types).
    """
    out = []
    for k, v in params.items():
        if isinstance(v, tuple) and len(v) == 2 and isinstance(v[0], str):
            bq_type, val = v
            if isinstance(val, list):
                out.append(ArrayQueryParameter(k, bq_type, val))
            else:
                out.append(ScalarQueryParameter(k, bq_type, val))
        elif isinstance(v, list):
            elem = next((x for x in v if x is not None), None)
            if isinstance(elem, bool):
                out.append(ArrayQueryParameter(k, "BOOL", v))
            elif isinstance(elem, int):
                out.append(ArrayQueryParameter(k, "INT64", v))
            elif isinstance(elem, float):
                out.append(ArrayQueryParameter(k, "FLOAT64", v))
            else:
                out.append(ArrayQueryParameter(k, "STRING", [str(x) for x in v]))
        elif isinstance(v, bool):
            out.append(ScalarQueryParameter(k, "BOOL", v))
        elif isinstance(v, int):
            out.append(ScalarQueryParameter(k, "INT64", v))
        elif isinstance(v, float):
            out.append(ScalarQueryParameter(k, "FLOAT64", v))
        elif v is None:
            out.append(ScalarQueryParameter(k, "STRING", None))
        else:
            out.append(ScalarQueryParameter(k, "STRING", str(v)))
    return out


def run_query(
    sql: str,
    params: dict[str, Any] | None = None,
    *,
    cache: bool = True,
    max_bytes_billed: int | None = None,
) -> pd.DataFrame:
    """Run a parameterized BQ query with cost cap + LRU cache. Returns a pandas DataFrame."""
    params = params or {}
    key = _cache_key(sql, params) if cache else None
    if key is not None:
        hit = _cache.get(key)
        if hit is not None:
            log.debug("bq cache hit %s", key[:8])
            return hit

    cfg = QueryJobConfig(
        query_parameters=_to_qp(params),
        maximum_bytes_billed=max_bytes_billed or get_settings().max_bytes_billed,
        use_query_cache=True,
    )
    log.info("bq query start params=%s bytes<=%d", list(params.keys()), cfg.maximum_bytes_billed)
    df = client().query(sql, job_config=cfg).result().to_dataframe(create_bqstorage_client=False)
    log.info("bq query done rows=%d", len(df))
    if key is not None:
        _cache.put(key, df)
    return df


def clear_cache() -> None:
    _cache.store.clear()


SENSOR_TABLES = {"PULSE", "STEP", "HEMET", "AMCLASS", "SLPSTG", "SLPMET", "SLPTIM", "ANNOTATIONS"}


def fq(dataset: str, table: str) -> str:
    """Fully-qualified BHS table reference.

    When `use_demo_tables` is set, sensor tables are redirected to the clustered
    biomarker_app demo materializations (e.g. sensordata.PULSE → biomarker_app.pulse_demo).
    Demographics/CRF/analysis tables always read from source.
    """
    s = get_settings()
    if s.use_demo_tables and dataset == s.bhs_sensordata_dataset and table in SENSOR_TABLES:
        return f"`{s.app_project}.{s.app_dataset}.{table.lower()}{s.demo_table_suffix}`"
    return f"`{s.bhs_project}.{dataset}.{table}`"


def app_fq(table: str) -> str:
    """Fully-qualified app-owned table reference (biomarker_app dataset)."""
    s = get_settings()
    return f"`{s.app_project}.{s.app_dataset}.{table}`"
