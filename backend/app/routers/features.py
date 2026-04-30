from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Header, HTTPException

from ..features.registry import all_features, get as get_feature
from ..schemas.features import (
    FeatureCatalog,
    FeatureComputeRequest,
    FeatureComputeResponse,
    FeatureMeta,
    FeatureResult,
)
from ..schemas.saved import (
    FeatureRunDetail,
    FeatureRunList,
    FeatureRunSummary,
    FeatureRunValue,
    SaveFeatureRunIn,
)
from ..services import bq, gcs, persistence

log = logging.getLogger(__name__)
router = APIRouter()


@router.get("/catalog", response_model=FeatureCatalog)
def catalog() -> FeatureCatalog:
    return FeatureCatalog(
        items=[
            FeatureMeta(
                id=f.id,
                label=f.label,
                group=f.group,
                modality=f.modality,
                description=f.description,
            )
            for f in all_features()
        ]
    )


# Modality-specific loaders. Keep these thin — they reuse the clustered demo tables.
def _load_pulse(usubjid: str, day_min: int, day_max: int) -> pd.DataFrame:
    # For features, we want ~1Hz effective sampling. Bucket to 1000 ms.
    sql = f"""
    SELECT
      study_day_int,
      DIV(milliseconds_from_midnight_utc, 1000) * 1000 AS ms,
      AVG(pulse_rate) AS value
    FROM {bq.fq('sensordata', 'PULSE')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    GROUP BY study_day_int, ms
    ORDER BY study_day_int, ms
    """
    return bq.run_query(
        sql, {"usubjid": usubjid, "day_min": ("INT64", day_min), "day_max": ("INT64", day_max)}
    )


def _load_step(usubjid: str, day_min: int, day_max: int) -> pd.DataFrame:
    sql = f"""
    SELECT study_day_int, milliseconds_from_midnight_utc AS ms, step_count AS value
    FROM {bq.fq('sensordata', 'STEP')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, ms
    """
    return bq.run_query(
        sql, {"usubjid": usubjid, "day_min": ("INT64", day_min), "day_max": ("INT64", day_max)}
    )


def _load_amclass(usubjid: str, day_min: int, day_max: int) -> pd.DataFrame:
    sql = f"""
    SELECT study_day_int, milliseconds_from_midnight_utc AS ms, class_label AS label
    FROM {bq.fq('sensordata', 'AMCLASS')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, ms
    """
    return bq.run_query(
        sql, {"usubjid": usubjid, "day_min": ("INT64", day_min), "day_max": ("INT64", day_max)}
    )


def _load_slpstg(usubjid: str, day_min: int, day_max: int) -> pd.DataFrame:
    sql = f"""
    SELECT study_day_int, milliseconds_from_midnight_utc AS ms, stage AS label
    FROM {bq.fq('sensordata', 'SLPSTG')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, ms
    """
    return bq.run_query(
        sql, {"usubjid": usubjid, "day_min": ("INT64", day_min), "day_max": ("INT64", day_max)}
    )


def _load_slpmet(usubjid: str, day_min: int, day_max: int) -> pd.DataFrame:
    sql = f"""
    SELECT CAST(study_day AS INT64) AS study_day_int, 0 AS ms, sleep_efficiency AS value
    FROM {bq.fq('sensordata', 'SLPMET')}
    WHERE USUBJID = @usubjid
      AND CAST(study_day AS INT64) BETWEEN @day_min AND @day_max
    ORDER BY study_day_int
    """
    return bq.run_query(
        sql, {"usubjid": usubjid, "day_min": ("INT64", day_min), "day_max": ("INT64", day_max)}
    )


def _load_hemet(usubjid: str, day_min: int, day_max: int) -> pd.DataFrame:
    sql = f"""
    SELECT study_day_int, 0 AS ms, rhr AS value, rmssd_mean, sdnn_index
    FROM {bq.fq('sensordata', 'HEMET')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int
    """
    return bq.run_query(
        sql, {"usubjid": usubjid, "day_min": ("INT64", day_min), "day_max": ("INT64", day_max)}
    )


_LOADERS = {
    "PULSE": _load_pulse,
    "STEP": _load_step,
    "AMCLASS": _load_amclass,
    "SLPSTG": _load_slpstg,
    "SLPMET": _load_slpmet,
    "HEMET": _load_hemet,
}


def _clip_window(df: pd.DataFrame, window_start: float | None, window_end: float | None) -> pd.DataFrame:
    """Clip rows to fractional-day window. `study_day + ms/86_400_000` is the "day time."""
    if window_start is None or window_end is None:
        return df
    if df.empty:
        return df
    day_time = df["study_day_int"].astype(float) + (df["ms"].astype(float) / 86_400_000.0)
    return df.loc[(day_time >= window_start) & (day_time <= window_end)].copy()


def _to_feature_df(df: pd.DataFrame) -> pd.DataFrame:
    """Standardize column names: add `t_ms` column combining study_day + ms."""
    if df.empty:
        return df
    df = df.copy()
    df["t_ms"] = df["study_day_int"].astype("int64") * 86_400_000 + df["ms"].astype("int64")
    return df


@router.post("/compute", response_model=FeatureComputeResponse)
def compute(req: FeatureComputeRequest) -> FeatureComputeResponse:
    # Validate feature ids up front.
    defs = []
    for fid in req.feature_ids:
        fdef = get_feature(fid)
        if fdef is None:
            raise HTTPException(400, f"Unknown feature id {fid!r}")
        defs.append(fdef)

    # Load each required modality once, sharing across features.
    needed = {d.modality for d in defs}
    loaded: dict[str, pd.DataFrame] = {}
    for modality in needed:
        loader = _LOADERS.get(modality)
        if loader is None:
            raise HTTPException(500, f"No loader for modality {modality!r}")
        raw = loader(req.usubjid, req.day_min, req.day_max)
        clipped = _clip_window(raw, req.window_day_start, req.window_day_end)
        loaded[modality] = _to_feature_df(clipped)

    # Fill defaults for window bounds in the response.
    win_start = req.window_day_start if req.window_day_start is not None else float(req.day_min)
    win_end = req.window_day_end if req.window_day_end is not None else float(req.day_max) + 1.0

    results: list[FeatureResult] = []
    for d in defs:
        df = loaded[d.modality]
        try:
            raw_values = d.fn(df)
            # Coerce numpy types to plain Python for Pydantic.
            values: dict[str, float | int | None] = {}
            for k, v in raw_values.items():
                if v is None:
                    values[k] = None
                elif isinstance(v, bool):
                    values[k] = int(v)
                elif isinstance(v, (int,)):
                    values[k] = int(v)
                else:
                    try:
                        fv = float(v)
                        values[k] = fv if fv == fv else None  # NaN → None
                    except (TypeError, ValueError):
                        values[k] = None
            results.append(
                FeatureResult(
                    feature_id=d.id,
                    modality=d.modality,
                    label=d.label,
                    values=values,
                    n_source_points=int(len(df)),
                )
            )
        except Exception as e:
            log.exception("feature %s failed", d.id)
            results.append(
                FeatureResult(
                    feature_id=d.id,
                    modality=d.modality,
                    label=d.label,
                    values={},
                    n_source_points=int(len(df)),
                    error=f"{type(e).__name__}: {e}",
                )
            )

    return FeatureComputeResponse(
        usubjid=req.usubjid,
        window_day_start=win_start,
        window_day_end=win_end,
        results=results,
    )


# ─── Save / list feature runs ────────────────────────────────────────────────


@router.post("/save", response_model=FeatureRunSummary)
def save_run(
    req: SaveFeatureRunIn,
    x_forwarded_user: str | None = Header(default=None),
) -> FeatureRunSummary:
    # Recompute so the persisted values reflect the current code / algorithm.
    compute_req = FeatureComputeRequest(
        usubjid=req.usubjid,
        day_min=req.day_min,
        day_max=req.day_max,
        window_day_start=req.window_day_start,
        window_day_end=req.window_day_end,
        feature_ids=req.feature_ids,
    )
    resp = compute(compute_req)

    persistence.ensure_table("features")
    persistence.ensure_table("exports")

    run_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    user_email = persistence.user_email(x_forwarded_user)
    params = {
        "window_day_start": req.window_day_start,
        "window_day_end": req.window_day_end,
        "day_min": req.day_min,
        "day_max": req.day_max,
    }
    params_json = json.dumps(params)

    # Flatten all (feature_id, value_key, value) tuples into one INSERT.
    rows: list[dict] = []
    for r in resp.results:
        if r.error:
            continue
        for vk, v in r.values.items():
            rows.append({
                "feature_id": r.feature_id,
                "value_key": vk,
                "value": None if v is None else float(v),
            })
    if not rows:
        raise HTTPException(422, "No feature values produced — cannot save empty run")

    values_sql = ", ".join(
        f"(@run_id, @fid_{i}, @u, @ds, @de, @vk_{i}, @v_{i}, @algv, @p, @user, @ts, @name, @desc)"
        for i in range(len(rows))
    )
    ins_params: dict = {
        "run_id": run_id,
        "u": req.usubjid,
        "ds": ("FLOAT64", resp.window_day_start),
        "de": ("FLOAT64", resp.window_day_end),
        "algv": "v1",
        "p": params_json,
        "user": user_email,
        "ts": ("TIMESTAMP", created_at),
        "name": req.name,
        "desc": req.description,
    }
    for i, r in enumerate(rows):
        ins_params[f"fid_{i}"] = r["feature_id"]
        ins_params[f"vk_{i}"] = r["value_key"]
        ins_params[f"v_{i}"] = ("FLOAT64", r["value"])
    bq.run_query(
        f"""
        INSERT INTO {bq.app_fq('features')}
        (run_id, feature_id, usubjid, study_day_start, study_day_end, value_key,
         value, algorithm_version, params_json, user_email, created_at,
         run_name, run_description)
        VALUES {values_sql}
        """,
        ins_params,
        cache=False,
    )

    # Also write a Parquet with the full compute response for notebook-ready export.
    df = pd.DataFrame([{
        "run_id": run_id,
        "usubjid": req.usubjid,
        "feature_id": r["feature_id"],
        "value_key": r["value_key"],
        "value": r["value"],
        "study_day_start": resp.window_day_start,
        "study_day_end": resp.window_day_end,
    } for r in rows])
    key = f"feature_runs/{run_id}/values.parquet"
    try:
        gs_uri, size = gcs.write_parquet(key, df)
        bq.run_query(
            f"""
            INSERT INTO {bq.app_fq('exports')}
            (export_id, kind, gcs_path, format, row_count, size_bytes,
             params_json, source_ids, user_email, created_at)
            VALUES (@eid, 'feature_run', @path, 'parquet', @rc, @sz,
                    @p, @src, @user, @ts)
            """,
            {
                "eid": str(uuid.uuid4()),
                "path": gs_uri,
                "rc": ("INT64", len(df)),
                "sz": ("INT64", size),
                "p": params_json,
                "src": json.dumps({"run_id": run_id}),
                "user": user_email,
                "ts": ("TIMESTAMP", created_at),
            },
            cache=False,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("GCS export failed for run %s: %s", run_id, e)

    return FeatureRunSummary(
        run_id=run_id,
        name=req.name,
        description=req.description,
        usubjid=req.usubjid,
        study_day_start=resp.window_day_start,
        study_day_end=resp.window_day_end,
        n_features=len({r["feature_id"] for r in rows}),
        n_rows=len(rows),
        user_email=user_email,
        created_at=created_at.isoformat().replace("+00:00", "Z"),
    )


@router.get("/runs", response_model=FeatureRunList)
def list_runs(usubjid: str | None = None, limit: int = 200) -> FeatureRunList:
    persistence.ensure_table("features")
    sql = f"""
    SELECT
      run_id,
      ANY_VALUE(run_name) AS name,
      ANY_VALUE(run_description) AS description,
      ANY_VALUE(usubjid) AS usubjid,
      ANY_VALUE(study_day_start) AS study_day_start,
      ANY_VALUE(study_day_end) AS study_day_end,
      COUNT(DISTINCT feature_id) AS n_features,
      COUNT(*) AS n_rows,
      ANY_VALUE(user_email) AS user_email,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', MAX(created_at), 'UTC') AS created_at
    FROM {bq.app_fq('features')}
    WHERE (@usubjid IS NULL OR usubjid = @usubjid)
    GROUP BY run_id
    ORDER BY created_at DESC
    LIMIT @lim
    """
    df = bq.run_query(
        sql,
        {"usubjid": usubjid, "lim": ("INT64", int(limit))},
        cache=False,
    )
    df = df.where(df.notna(), None)
    return FeatureRunList(
        items=[FeatureRunSummary(**r) for r in df.to_dict(orient="records")]
    )


@router.get("/runs/{run_id}", response_model=FeatureRunDetail)
def get_run(run_id: str) -> FeatureRunDetail:
    persistence.ensure_table("features")
    persistence.ensure_table("exports")
    sql = f"""
    SELECT
      run_id, feature_id, usubjid, study_day_start, study_day_end,
      value_key, value, params_json, user_email, run_name, run_description,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
    FROM {bq.app_fq('features')}
    WHERE run_id = @rid
    ORDER BY feature_id, value_key
    """
    df = bq.run_query(sql, {"rid": run_id}, cache=False)
    if df.empty:
        raise HTTPException(404, "Feature run not found")
    df = df.where(df.notna(), None)
    first = df.iloc[0]
    values = [
        FeatureRunValue(
            feature_id=r["feature_id"],
            value_key=r["value_key"],
            value=r["value"],
        )
        for r in df.to_dict(orient="records")
    ]
    # Look up any GCS exports for this run.
    paths_df = bq.run_query(
        f"""
        SELECT gcs_path FROM {bq.app_fq('exports')}
        WHERE JSON_EXTRACT_SCALAR(source_ids, '$.run_id') = @rid
        """,
        {"rid": run_id},
        cache=False,
    )
    return FeatureRunDetail(
        run_id=run_id,
        name=first["run_name"],
        description=first["run_description"],
        usubjid=first["usubjid"],
        study_day_start=first["study_day_start"],
        study_day_end=first["study_day_end"],
        n_features=len({v.feature_id for v in values}),
        n_rows=len(values),
        user_email=first["user_email"],
        created_at=first["created_at"],
        values=values,
        params_json=first["params_json"],
        gcs_paths=[str(p) for p in paths_df["gcs_path"].tolist()],
    )


@router.delete("/runs/{run_id}")
def delete_run(run_id: str) -> dict:
    persistence.ensure_table("features")
    bq.run_query(
        f"DELETE FROM {bq.app_fq('features')} WHERE run_id = @rid",
        {"rid": run_id},
        cache=False,
    )
    return {"deleted": run_id}
