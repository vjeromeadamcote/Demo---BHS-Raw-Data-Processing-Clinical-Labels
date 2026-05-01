"""Walking Suite Measures (WSM) daily aggregates for visualization."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services import bq
from ..features.step_feat import (
    calculate_cadence_from_stepcount,
    identify_walking_bouts,
    calculate_bout_features,
    calculate_daily_step_features,
)

router = APIRouter()


class WSMDailyPoint(BaseModel):
    study_day: int
    total_steps: float
    ambulatory_minutes: float | None
    top_15min_cadence_sps: float | None
    top_30min_cadence_sps: float | None
    top_60min_cadence_sps: float | None


class WSMDailyResponse(BaseModel):
    usubjid: str
    study_day_min: int
    study_day_max: int
    daily_metrics: list[WSMDailyPoint]


@router.get("/{usubjid}", response_model=WSMDailyResponse)
def get_wsm_daily(
    usubjid: str,
    day_min: int = Query(..., description="Inclusive study_day_int lower bound"),
    day_max: int = Query(..., description="Inclusive study_day_int upper bound"),
) -> WSMDailyResponse:
    """Compute daily WSM metrics for visualization."""
    if day_max < day_min:
        raise HTTPException(422, "day_max must be >= day_min")
    if day_max - day_min > 365:
        raise HTTPException(422, "Range limited to 365 study_days per request")

    # Fetch STEP data for the range
    sql = f"""
    SELECT study_day_int, milliseconds_from_midnight_utc AS ms,
           step_count AS value, step_interval
    FROM {bq.fq('sensordata', 'STEP')}
    WHERE USUBJID = @usubjid AND study_day_int BETWEEN @day_min AND @day_max
    ORDER BY study_day_int, ms
    """
    params = {
        "usubjid": usubjid,
        "day_min": ("INT64", int(day_min)),
        "day_max": ("INT64", int(day_max)),
    }
    df = bq.run_query(sql, params)

    if df.empty:
        return WSMDailyResponse(
            usubjid=usubjid,
            study_day_min=day_min,
            study_day_max=day_max,
            daily_metrics=[],
        )

    # Compute metrics per day
    daily_metrics: list[WSMDailyPoint] = []
    for study_day in range(day_min, day_max + 1):
        day_df = df[df["study_day_int"] == study_day].copy()

        if len(day_df) == 0:
            # No data for this day
            daily_metrics.append(
                WSMDailyPoint(
                    study_day=study_day,
                    total_steps=0.0,
                    ambulatory_minutes=None,
                    top_15min_cadence_sps=None,
                    top_30min_cadence_sps=None,
                    top_60min_cadence_sps=None,
                )
            )
            continue

        # Filter valid data
        mask = (day_df["value"] > 0) & (day_df["step_interval"] > 0)
        day_df_valid = day_df[mask].copy()

        if len(day_df_valid) < 2:
            daily_metrics.append(
                WSMDailyPoint(
                    study_day=study_day,
                    total_steps=float(day_df["value"].sum()) if len(day_df) > 0 else 0.0,
                    ambulatory_minutes=None,
                    top_15min_cadence_sps=None,
                    top_30min_cadence_sps=None,
                    top_60min_cadence_sps=None,
                )
            )
            continue

        # Calculate cadence
        day_df_valid["cadence"] = calculate_cadence_from_stepcount(
            day_df_valid["value"].values,
            day_df_valid["step_interval"].values,
        )

        # Identify walking bouts
        day_df_bouts = identify_walking_bouts(day_df_valid)

        # Calculate daily features
        features = calculate_daily_step_features(day_df_bouts)

        daily_metrics.append(
            WSMDailyPoint(
                study_day=study_day,
                total_steps=features["total_steps"],
                ambulatory_minutes=features["ambulatory_minutes"],
                top_15min_cadence_sps=features["top_15min_cadence_sps"],
                top_30min_cadence_sps=features["top_30min_cadence_sps"],
                top_60min_cadence_sps=features["top_60min_cadence_sps"],
            )
        )

    return WSMDailyResponse(
        usubjid=usubjid,
        study_day_min=day_min,
        study_day_max=day_max,
        daily_metrics=daily_metrics,
    )
