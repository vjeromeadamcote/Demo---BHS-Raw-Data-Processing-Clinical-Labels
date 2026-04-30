from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..config import get_settings
from ..schemas.subjects import (
    DaySummary,
    DaySummaryResponse,
    SubjectDetail,
    SubjectListResponse,
    SubjectSummary,
)
from ..services import bq

router = APIRouter()


def _subject_universe_filter() -> str:
    """Return a SQL fragment restricting to the demo-subject universe if in demo mode."""
    s = get_settings()
    if s.use_demo_tables:
        return (
            f"AND dm.USUBJID IN (SELECT USUBJID FROM {bq.app_fq('demo_subjects')})"
        )
    return ""


_LIST_SQL_TEMPLATE = """
WITH wear AS (
  SELECT
    USUBJID,
    AVG(wear_fraction) AS wear_fraction_avg,
    COUNT(*) AS n_wear_segments,
    MIN(CAST(start_study_day AS INT64)) AS study_day_min,
    MAX(CAST(end_study_day AS INT64)) AS study_day_max
  FROM {ann}
  GROUP BY USUBJID
)
SELECT
  dm.USUBJID AS usubjid,
  dm.SUBJID AS subjid,
  dm.age_at_enrollment,
  dm.SEX AS sex,
  dm.RACE AS race,
  dm.hispanic_ancestry,
  wear.wear_fraction_avg,
  wear.n_wear_segments,
  wear.study_day_min,
  wear.study_day_max
FROM {dm} dm
LEFT JOIN wear USING (USUBJID)
WHERE (@sex IS NULL OR dm.SEX = @sex)
  AND (@min_age IS NULL OR dm.age_at_enrollment >= @min_age)
  AND (@max_age IS NULL OR dm.age_at_enrollment <= @max_age)
  AND (@min_wear IS NULL OR wear.wear_fraction_avg >= @min_wear)
  {universe_filter}
ORDER BY wear.wear_fraction_avg DESC NULLS LAST, dm.USUBJID
LIMIT @limit OFFSET @offset
"""


@router.get("", response_model=SubjectListResponse)
def list_subjects(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sex: str | None = Query(None, pattern="^(Male|Female|M|F)$"),
    min_age: int | None = Query(None, ge=0, le=120),
    max_age: int | None = Query(None, ge=0, le=120),
    min_wear: float | None = Query(None, ge=0, le=1),
) -> SubjectListResponse:
    sql = _LIST_SQL_TEMPLATE.format(
        dm=bq.fq("screener", "DM"),
        ann=bq.fq("sensordata", "ANNOTATIONS"),
        universe_filter=_subject_universe_filter(),
    )
    params = {
        "limit": int(limit),
        "offset": int(offset),
        "sex": sex,  # str or None (NULL)
        "min_age": ("INT64", min_age),
        "max_age": ("INT64", max_age),
        "min_wear": ("FLOAT64", min_wear),
    }
    df = bq.run_query(sql, params)
    records = df.where(df.notna(), None).to_dict(orient="records")
    items = [SubjectSummary(**r) for r in records]
    return SubjectListResponse(items=items, total=len(items), limit=limit, offset=offset)


_DETAIL_SQL = """
WITH wear AS (
  SELECT
    USUBJID,
    AVG(wear_fraction) AS wear_fraction_avg,
    COUNT(*) AS n_wear_segments,
    MIN(CAST(start_study_day AS INT64)) AS study_day_min,
    MAX(CAST(end_study_day AS INT64)) AS study_day_max
  FROM {ann}
  WHERE USUBJID = @usubjid
  GROUP BY USUBJID
),
modality_presence AS (
  SELECT 'PULSE'  AS modality, (SELECT 1 FROM {pulse}   WHERE USUBJID = @usubjid LIMIT 1) AS present UNION ALL
  SELECT 'STEP',   (SELECT 1 FROM {step}   WHERE USUBJID = @usubjid LIMIT 1) UNION ALL
  SELECT 'HEMET',  (SELECT 1 FROM {hemet}  WHERE USUBJID = @usubjid LIMIT 1) UNION ALL
  SELECT 'AMCLASS',(SELECT 1 FROM {amcls}  WHERE USUBJID = @usubjid LIMIT 1) UNION ALL
  SELECT 'SLPMET', (SELECT 1 FROM {slpmet} WHERE USUBJID = @usubjid LIMIT 1) UNION ALL
  SELECT 'SLPSTG', (SELECT 1 FROM {slpstg} WHERE USUBJID = @usubjid LIMIT 1) UNION ALL
  SELECT 'SLPTIM', (SELECT 1 FROM {slptim} WHERE USUBJID = @usubjid LIMIT 1)
)
SELECT
  dm.USUBJID AS usubjid,
  dm.SUBJID AS subjid,
  dm.age_at_enrollment,
  dm.SEX AS sex,
  dm.RACE AS race,
  dm.hispanic_ancestry,
  wear.wear_fraction_avg,
  wear.n_wear_segments,
  wear.study_day_min,
  wear.study_day_max,
  ARRAY(SELECT AS STRUCT modality, (present IS NOT NULL) AS present FROM modality_presence) AS modalities
FROM {dm} dm
LEFT JOIN wear USING (USUBJID)
WHERE dm.USUBJID = @usubjid
LIMIT 1
"""


@router.get("/{usubjid}", response_model=SubjectDetail)
def get_subject(usubjid: str) -> SubjectDetail:
    sql = _DETAIL_SQL.format(
        dm=bq.fq("screener", "DM"),
        ann=bq.fq("sensordata", "ANNOTATIONS"),
        pulse=bq.fq("sensordata", "PULSE"),
        step=bq.fq("sensordata", "STEP"),
        hemet=bq.fq("sensordata", "HEMET"),
        amcls=bq.fq("sensordata", "AMCLASS"),
        slpmet=bq.fq("sensordata", "SLPMET"),
        slpstg=bq.fq("sensordata", "SLPSTG"),
        slptim=bq.fq("sensordata", "SLPTIM"),
    )
    df = bq.run_query(sql, {"usubjid": usubjid})
    if df.empty:
        raise HTTPException(404, f"USUBJID {usubjid} not found")
    row = df.where(df.notna(), None).iloc[0].to_dict()
    modalities_arr = row.pop("modalities")
    if modalities_arr is None or len(modalities_arr) == 0:
        modalities = {}
    else:
        modalities = {m["modality"]: bool(m["present"]) for m in modalities_arr}
    return SubjectDetail(**row, modalities=modalities)


_DAY_SUMMARY_SQL = """
WITH bounds AS (
  SELECT
    COALESCE(@day_min, MIN(CAST(start_study_day AS INT64))) AS day_min,
    COALESCE(@day_max, MAX(CAST(end_study_day   AS INT64))) AS day_max
  FROM {ann}
  WHERE USUBJID = @usubjid
),
days AS (
  SELECT day AS study_day
  FROM bounds, UNNEST(GENERATE_ARRAY(day_min, day_max)) AS day
),
wear_per_day AS (
  SELECT
    CAST(start_study_day AS INT64) AS study_day,
    AVG(wear_fraction) AS wear_fraction
  FROM {ann}
  WHERE USUBJID = @usubjid
  GROUP BY study_day
),
step_per_day AS (
  SELECT study_day_int AS study_day, SUM(step_count) AS step_total
  FROM {step}
  WHERE USUBJID = @usubjid
  GROUP BY study_day_int
),
amclass_per_day AS (
  SELECT study_day_int AS study_day, COUNT(DISTINCT class_label) AS amclass_n_classes
  FROM {amcls}
  WHERE USUBJID = @usubjid
  GROUP BY study_day_int
),
pulse_per_day AS (
  SELECT study_day_int AS study_day, COUNT(*) AS pulse_n
  FROM {pulse}
  WHERE USUBJID = @usubjid
  GROUP BY study_day_int
),
sleep_per_day AS (
  SELECT DISTINCT study_day_int AS study_day
  FROM {slpstg}
  WHERE USUBJID = @usubjid
)
SELECT
  d.study_day,
  w.wear_fraction,
  s.step_total,
  a.amclass_n_classes,
  p.pulse_n,
  (sl.study_day IS NOT NULL) AS sleep_present,
  (
    0.4 * IFNULL(w.wear_fraction, 0.0)
    + 0.3 * LEAST(IFNULL(s.step_total, 0.0) / 10000.0, 1.0)
    + 0.2 * LEAST(IFNULL(CAST(a.amclass_n_classes AS FLOAT64), 0.0) / 3.0, 1.0)
    + 0.1 * IF(sl.study_day IS NOT NULL, 1.0, 0.0)
  ) AS score
FROM days d
LEFT JOIN wear_per_day    w USING (study_day)
LEFT JOIN step_per_day    s USING (study_day)
LEFT JOIN amclass_per_day a USING (study_day)
LEFT JOIN pulse_per_day   p USING (study_day)
LEFT JOIN sleep_per_day   sl USING (study_day)
ORDER BY d.study_day
"""


@router.get("/{usubjid}/day-summary", response_model=DaySummaryResponse)
def day_summary(
    usubjid: str,
    day_min: int | None = Query(None, description="Inclusive study_day lower bound"),
    day_max: int | None = Query(None, description="Inclusive study_day upper bound"),
) -> DaySummaryResponse:
    sql = _DAY_SUMMARY_SQL.format(
        ann=bq.fq("sensordata", "ANNOTATIONS"),
        step=bq.fq("sensordata", "STEP"),
        amcls=bq.fq("sensordata", "AMCLASS"),
        pulse=bq.fq("sensordata", "PULSE"),
        slpstg=bq.fq("sensordata", "SLPSTG"),
    )
    df = bq.run_query(
        sql,
        {
            "usubjid": usubjid,
            "day_min": ("INT64", day_min),
            "day_max": ("INT64", day_max),
        },
    )
    if df.empty:
        raise HTTPException(404, f"No data for USUBJID {usubjid}")
    df = df.where(df.notna(), None)
    days = [
        DaySummary(
            study_day=int(r["study_day"]),
            wear_fraction=(float(r["wear_fraction"]) if r["wear_fraction"] is not None else None),
            step_total=(float(r["step_total"]) if r["step_total"] is not None else None),
            amclass_n_classes=(int(r["amclass_n_classes"]) if r["amclass_n_classes"] is not None else None),
            pulse_n=(int(r["pulse_n"]) if r["pulse_n"] is not None else None),
            sleep_present=bool(r["sleep_present"]),
            score=float(r["score"] or 0.0),
        )
        for r in df.to_dict(orient="records")
    ]
    return DaySummaryResponse(
        usubjid=usubjid,
        day_min=int(days[0].study_day),
        day_max=int(days[-1].study_day),
        days=days,
    )
