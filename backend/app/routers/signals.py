"""Multimodal time-series fetch for a single USUBJID across a study_day range.

Key performance rules:
- Every query filters USUBJID AND study_day_int range — never full-scan.
- For wide windows we downsample server-side via time-bucket AVG in SQL.
- Millisecond-from-midnight-UTC is converted to an epoch-ms `t_ms` on the server.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..schemas.signals import SignalPoint, SignalSeries, SignalsResponse
from ..services import bq

router = APIRouter()

MODALITIES = {"PULSE", "STEP", "HEMET", "AMCLASS", "SLPSTG", "SLPMET", "ANNOTATIONS"}

# Max raw points returned per modality before we bucket-downsample.
RAW_POINT_CAP = 5000

# Per-modality SQL builders. Each returns (sql, params_extra) given
# usubjid/day_min/day_max/target_points. All use parameterized queries.


def _pulse_sql() -> str:
    # Bucket-average PULSE to @bucket_ms ms-wide bins. Caller chooses bucket size
    # to keep output <= target_points. Parameterized simply so BQ clustering prunes.
    return f"""
    SELECT
      study_day_int,
      DIV(milliseconds_from_midnight_utc, @bucket_ms) * @bucket_ms
        AS milliseconds_from_midnight_utc,
      AVG(pulse_rate) AS value,
      AVG(confidence) AS confidence,
      COUNT(*) AS raw_per_bucket
    FROM {bq.fq('sensordata', 'PULSE')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    GROUP BY study_day_int, milliseconds_from_midnight_utc
    ORDER BY study_day_int, milliseconds_from_midnight_utc
    LIMIT @hard_cap
    """


def _step_sql() -> str:
    return f"""
    SELECT
      study_day_int,
      milliseconds_from_midnight_utc,
      step_count AS value,
      step_interval
    FROM {bq.fq('sensordata', 'STEP')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, milliseconds_from_midnight_utc
    LIMIT @hard_cap
    """


def _hemet_sql() -> str:
    return f"""
    SELECT
      study_day_int,
      CAST(0 AS INT64) AS milliseconds_from_midnight_utc,
      rhr,
      rmssd_mean,
      sdnn_index
    FROM {bq.fq('sensordata', 'HEMET')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int
    LIMIT @hard_cap
    """


def _amclass_sql() -> str:
    return f"""
    SELECT
      study_day_int,
      milliseconds_from_midnight_utc,
      class_label AS label,
      confidence
    FROM {bq.fq('sensordata', 'AMCLASS')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, milliseconds_from_midnight_utc
    LIMIT @hard_cap
    """


def _slpstg_sql() -> str:
    return f"""
    SELECT
      study_day_int,
      milliseconds_from_midnight_utc,
      stage AS label,
      duration_millis,
      confidence
    FROM {bq.fq('sensordata', 'SLPSTG')}
    WHERE USUBJID = @usubjid
      AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, milliseconds_from_midnight_utc
    LIMIT @hard_cap
    """


def _slpmet_sql() -> str:
    return f"""
    SELECT
      CAST(study_day AS INT64) AS study_day_int,
      CAST(0 AS INT64) AS milliseconds_from_midnight_utc,
      total_sleep_time,
      sleep_efficiency,
      num_awakenings,
      waso_time,
      rem,
      light
    FROM {bq.fq('sensordata', 'SLPMET')}
    WHERE USUBJID = @usubjid
      AND CAST(study_day AS INT64) BETWEEN @day_min AND @day_max
    ORDER BY study_day_int
    LIMIT @hard_cap
    """


def _annotations_sql() -> str:
    return f"""
    SELECT
      CAST(start_study_day AS INT64) AS study_day_int,
      CAST(0 AS INT64) AS milliseconds_from_midnight_utc,
      wear_fraction AS value,
      end_study_day
    FROM {bq.fq('sensordata', 'ANNOTATIONS')}
    WHERE USUBJID = @usubjid
      AND CAST(start_study_day AS INT64) BETWEEN @day_min AND @day_max
    ORDER BY study_day_int
    LIMIT @hard_cap
    """


def _day_ms_to_epoch_ms(study_day: int, ms_from_midnight: int) -> int:
    # study_day is days since enrollment; to keep the frontend's x-axis consistent
    # and study-agnostic, we return "virtual epoch-ms" = study_day*86400000 + ms_from_midnight.
    # The client labels the axis as study-time, not calendar-time.
    return int(study_day) * 86_400_000 + int(ms_from_midnight)


def _fetch_modality(
    modality: str, usubjid: str, day_min: int, day_max: int, target_points: int
) -> SignalSeries:
    params = {
        "usubjid": usubjid,
        "day_min": ("INT64", int(day_min)),
        "day_max": ("INT64", int(day_max)),
        "hard_cap": ("INT64", RAW_POINT_CAP * 4),
    }
    if modality == "PULSE":
        # Pick bucket size so N buckets <= target_points.
        range_ms = max(1, (day_max - day_min + 1)) * 86_400_000
        bucket_ms = max(1000, range_ms // max(1, target_points))
        pulse_params = {**params, "bucket_ms": ("INT64", int(bucket_ms))}
        df = bq.run_query(_pulse_sql(), pulse_params)
        raw_n = int(df["raw_per_bucket"].sum()) if not df.empty else 0
        points = [
            SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], r["milliseconds_from_midnight_utc"]),
                study_day=float(r["study_day_int"]),
                value=float(r["value"]) if r["value"] is not None else None,
            )
            for r in df.to_dict(orient="records")
        ]
        return SignalSeries(
            modality="PULSE",
            usubjid=usubjid,
            study_day_min=day_min,
            study_day_max=day_max,
            points=points,
            units="bpm",
            downsampled_from=raw_n if raw_n > len(points) else None,
        )
    if modality == "STEP":
        df = bq.run_query(_step_sql(), params)
        points = [
            SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], r["milliseconds_from_midnight_utc"]),
                study_day=float(r["study_day_int"]),
                value=float(r["value"]) if r["value"] is not None else None,
            )
            for r in df.to_dict(orient="records")
        ]
        return SignalSeries(
            modality="STEP", usubjid=usubjid, study_day_min=day_min,
            study_day_max=day_max, points=points, units="steps",
        )
    if modality == "HEMET":
        df = bq.run_query(_hemet_sql(), params)
        points: list[SignalPoint] = []
        extra = {"rmssd_mean": [], "sdnn_index": []}
        for r in df.to_dict(orient="records"):
            points.append(SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], 0),
                study_day=float(r["study_day_int"]),
                value=float(r["rhr"]) if r["rhr"] is not None else None,
            ))
            extra["rmssd_mean"].append(float(r["rmssd_mean"]) if r["rmssd_mean"] is not None else None)
            extra["sdnn_index"].append(float(r["sdnn_index"]) if r["sdnn_index"] is not None else None)
        return SignalSeries(
            modality="HEMET", usubjid=usubjid, study_day_min=day_min, study_day_max=day_max,
            points=points, units="bpm / ms", extra_values=extra,
        )
    if modality == "AMCLASS":
        df = bq.run_query(_amclass_sql(), params)
        points = [
            SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], r["milliseconds_from_midnight_utc"]),
                study_day=float(r["study_day_int"]),
                label=r["label"],
            )
            for r in df.to_dict(orient="records")
        ]
        return SignalSeries(
            modality="AMCLASS", usubjid=usubjid, study_day_min=day_min,
            study_day_max=day_max, points=points,
        )
    if modality == "SLPSTG":
        df = bq.run_query(_slpstg_sql(), params)
        points = [
            SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], r["milliseconds_from_midnight_utc"]),
                study_day=float(r["study_day_int"]),
                label=r["label"],
            )
            for r in df.to_dict(orient="records")
        ]
        return SignalSeries(
            modality="SLPSTG", usubjid=usubjid, study_day_min=day_min,
            study_day_max=day_max, points=points,
        )
    if modality == "SLPMET":
        df = bq.run_query(_slpmet_sql(), params)
        points = [
            SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], 0),
                study_day=float(r["study_day_int"]),
                value=float(r["sleep_efficiency"]) if r["sleep_efficiency"] is not None else None,
            )
            for r in df.to_dict(orient="records")
        ]
        return SignalSeries(
            modality="SLPMET", usubjid=usubjid, study_day_min=day_min,
            study_day_max=day_max, points=points, units="fraction",
        )
    if modality == "ANNOTATIONS":
        df = bq.run_query(_annotations_sql(), params)
        points = [
            SignalPoint(
                t_ms=_day_ms_to_epoch_ms(r["study_day_int"], 0),
                study_day=float(r["study_day_int"]),
                value=float(r["value"]) if r["value"] is not None else None,
            )
            for r in df.to_dict(orient="records")
        ]
        return SignalSeries(
            modality="ANNOTATIONS", usubjid=usubjid, study_day_min=day_min,
            study_day_max=day_max, points=points, units="wear_fraction",
        )
    raise HTTPException(400, f"Unknown modality {modality!r}")


@router.get("/{usubjid}", response_model=SignalsResponse)
def get_signals(
    usubjid: str,
    day_min: int = Query(..., description="Inclusive study_day_int lower bound"),
    day_max: int = Query(..., description="Inclusive study_day_int upper bound"),
    modalities: list[str] = Query(
        default=["PULSE", "STEP", "HEMET", "AMCLASS", "SLPSTG", "ANNOTATIONS"],
        description="Which modality tables to fetch",
    ),
    target_points: int = Query(RAW_POINT_CAP, ge=100, le=20_000),
) -> SignalsResponse:
    if day_max < day_min:
        raise HTTPException(422, "day_max must be >= day_min")
    if day_max - day_min > 365:
        raise HTTPException(422, "Range limited to 365 study_days per request")
    bad = [m for m in modalities if m not in MODALITIES]
    if bad:
        raise HTTPException(400, f"Unknown modalities: {bad}")

    series = [
        _fetch_modality(m, usubjid, day_min, day_max, target_points)
        for m in modalities
    ]
    return SignalsResponse(
        usubjid=usubjid, study_day_min=day_min, study_day_max=day_max, series=series,
    )
