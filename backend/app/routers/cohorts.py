"""Cohort Insights — filter subjects, pick a subject-level feature, stratify, aggregate.

All aggregation is pushed into a single BigQuery query. The app only ever receives
summary stats (mean/SD/quantiles) per stratum, never per-subject rows.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException

from ..config import get_settings
from ..schemas.cohorts import (
    CohortCatalog,
    CohortFeatureMeta,
    CohortRollupRequest,
    CohortRollupResponse,
    PerSubjectPoint,
    PerSubjectRequest,
    PerSubjectResponse,
    StratumStats,
)
from ..schemas.saved import (
    SavedCohort,
    SavedCohortDetail,
    SavedCohortIn,
    SavedCohortList,
)
from ..services import bq, persistence

log = logging.getLogger(__name__)
router = APIRouter()


@dataclass(frozen=True)
class CohortFeature:
    id: str
    label: str
    modality: str
    description: str
    unit: str | None
    # SQL fragment that yields per-subject `feature_value`. It MUST produce
    # one row per USUBJID with a `feature_value` column. Formatted with
    # placeholders for the `fq()` table refs.
    per_subject_sql: str


FEATURES: list[CohortFeature] = [
    CohortFeature(
        id="mean_daily_steps",
        label="Mean daily steps",
        modality="STEP",
        description="Per-subject mean of daily step totals across the study window.",
        unit="steps/day",
        per_subject_sql="""
          SELECT USUBJID, AVG(day_steps) AS feature_value
          FROM (
            SELECT USUBJID, study_day_int, SUM(step_count) AS day_steps
            FROM {step}
            GROUP BY USUBJID, study_day_int
          )
          GROUP BY USUBJID
        """,
    ),
    CohortFeature(
        id="total_steps",
        label="Total steps in window",
        modality="STEP",
        description="Total step count per subject (sum across all available days).",
        unit="steps",
        per_subject_sql="""
          SELECT USUBJID, SUM(step_count) AS feature_value
          FROM {step}
          GROUP BY USUBJID
        """,
    ),
    CohortFeature(
        id="mean_rhr",
        label="Mean resting heart rate",
        modality="HEMET",
        description="Per-subject average of daily resting HR from HEMET.",
        unit="bpm",
        per_subject_sql="""
          SELECT USUBJID, AVG(rhr) AS feature_value
          FROM {hemet}
          WHERE rhr IS NOT NULL
          GROUP BY USUBJID
        """,
    ),
    CohortFeature(
        id="mean_rmssd",
        label="Mean RMSSD (HRV)",
        modality="HEMET",
        description="Per-subject average of daily RMSSD_mean from HEMET.",
        unit="ms",
        per_subject_sql="""
          SELECT USUBJID, AVG(rmssd_mean) AS feature_value
          FROM {hemet}
          WHERE rmssd_mean IS NOT NULL
          GROUP BY USUBJID
        """,
    ),
    CohortFeature(
        id="mean_sleep_efficiency",
        label="Mean sleep efficiency",
        modality="SLPMET",
        description="Per-subject average sleep_efficiency across nights.",
        unit="fraction",
        per_subject_sql="""
          SELECT USUBJID, AVG(sleep_efficiency) AS feature_value
          FROM {slpmet}
          WHERE sleep_efficiency IS NOT NULL
          GROUP BY USUBJID
        """,
    ),
    CohortFeature(
        id="mean_wear_fraction",
        label="Mean wear fraction",
        modality="ANNOTATIONS",
        description="Per-subject mean wear_fraction across ANNOTATIONS segments.",
        unit="fraction",
        per_subject_sql="""
          SELECT USUBJID, AVG(wear_fraction) AS feature_value
          FROM {ann}
          GROUP BY USUBJID
        """,
    ),
]


FEATURES_BY_ID = {f.id: f for f in FEATURES}


STRATIFIERS = [
    {"id": "sex",         "label": "Sex",                                 "group": "Demographics"},
    {"id": "age_bin",     "label": "Age bin (18–45 / 46–60 / 61–90)",     "group": "Demographics"},
    {"id": "race",        "label": "Race",                                "group": "Demographics"},
    {"id": "phq9a_bin",   "label": "Depression severity (PHQ-9)",         "group": "Clinical"},
    {"id": "gad7_bin",    "label": "Anxiety severity (GAD-7)",            "group": "Clinical"},
    {"id": "ascvd_bin",   "label": "10-yr CV risk (ASCVD)",               "group": "Clinical"},
]


@router.get("/catalog", response_model=CohortCatalog)
def catalog() -> CohortCatalog:
    return CohortCatalog(
        features=[
            CohortFeatureMeta(
                id=f.id,
                label=f.label,
                unit=f.unit,
                description=f.description,
                modality=f.modality,
            )
            for f in FEATURES
        ],
        stratifiers=STRATIFIERS,
    )


def _filter_fragment() -> str:
    """WHERE clause pieces on the filtered subjects CTE. All parameters are bound."""
    s = get_settings()
    demo_clause = ""
    if s.use_demo_tables:
        demo_clause = (
            f" AND USUBJID IN (SELECT USUBJID FROM {bq.app_fq('demo_subjects')})"
        )
    return (
        "WHERE SEX IN ('Male','Female')"
        " AND age_at_enrollment IS NOT NULL"
        " AND (@sex IS NULL OR SEX = @sex)"
        " AND (@min_age IS NULL OR age_at_enrollment >= @min_age)"
        " AND (@max_age IS NULL OR age_at_enrollment <= @max_age)"
        " AND (@race IS NULL OR RACE = @race)"
        f"{demo_clause}"
    )


# Clinical score CTEs, each yielding (USUBJID, bin_label). Latest visit per subject.

_CLINICAL_CTES = {
    "phq9a_bin": """
      latest_phq9a AS (
        SELECT * FROM (
          SELECT
            USUBJID,
            PHQ9_SUM_SCORE,
            ROW_NUMBER() OVER (PARTITION BY USUBJID ORDER BY study_day DESC) AS rn
          FROM {phq9a}
          WHERE PHQ9_SUM_SCORE IS NOT NULL
        ) WHERE rn = 1
      ),
      clinical_bin AS (
        SELECT
          USUBJID,
          CASE
            WHEN PHQ9_SUM_SCORE <  5 THEN '0–4 minimal'
            WHEN PHQ9_SUM_SCORE < 10 THEN '5–9 mild'
            WHEN PHQ9_SUM_SCORE < 15 THEN '10–14 moderate'
            WHEN PHQ9_SUM_SCORE < 20 THEN '15–19 mod. severe'
            ELSE '20–27 severe'
          END AS bin_label
        FROM latest_phq9a
      )
    """,
    "gad7_bin": """
      gad7_totals AS (
        SELECT
          USUBJID, study_day,
          (IFNULL(gad7_1_CODE,0) + IFNULL(gad7_2_CODE,0) + IFNULL(gad7_3_CODE,0)
           + IFNULL(gad7_4_CODE,0) + IFNULL(gad7_5_CODE,0) + IFNULL(gad7_6_CODE,0)
           + IFNULL(gad7_7_CODE,0)) AS total,
          (gad7_1_CODE IS NOT NULL OR gad7_2_CODE IS NOT NULL) AS has_data
        FROM {gad7}
      ),
      latest_gad7 AS (
        SELECT * FROM (
          SELECT USUBJID, total,
            ROW_NUMBER() OVER (PARTITION BY USUBJID ORDER BY study_day DESC) AS rn
          FROM gad7_totals
          WHERE has_data
        ) WHERE rn = 1
      ),
      clinical_bin AS (
        SELECT
          USUBJID,
          CASE
            WHEN total <  5 THEN '0–4 minimal'
            WHEN total < 10 THEN '5–9 mild'
            WHEN total < 15 THEN '10–14 moderate'
            ELSE '15–21 severe'
          END AS bin_label
        FROM latest_gad7
      )
    """,
    "ascvd_bin": """
      latest_ascvd AS (
        SELECT * FROM (
          SELECT USUBJID, score,
            ROW_NUMBER() OVER (PARTITION BY USUBJID ORDER BY study_day DESC) AS rn
          FROM {ascvd}
          WHERE score IS NOT NULL
        ) WHERE rn = 1
      ),
      clinical_bin AS (
        SELECT
          USUBJID,
          CASE
            WHEN score < 0.05  THEN '<5% low'
            WHEN score < 0.075 THEN '5–7.5% borderline'
            WHEN score < 0.20  THEN '7.5–20% intermediate'
            ELSE '≥20% high'
          END AS bin_label
        FROM latest_ascvd
      )
    """,
}


def _stratifier_col(stratifier: str) -> str:
    """SQL fragment returning the stratum label column on `dm_full`.

    For demographic stratifiers this is a direct expression; for clinical
    stratifiers it references the `clinical_bin` CTE JOINed into `dm_full`.
    """
    if stratifier == "sex":
        return "SEX"
    if stratifier == "race":
        return "COALESCE(RACE, 'Unknown')"
    if stratifier == "age_bin":
        return (
            "CASE"
            " WHEN age_at_enrollment BETWEEN 18 AND 45 THEN '18–45'"
            " WHEN age_at_enrollment BETWEEN 46 AND 60 THEN '46–60'"
            " WHEN age_at_enrollment BETWEEN 61 AND 90 THEN '61–90'"
            " ELSE 'other' END"
        )
    if stratifier in _CLINICAL_CTES:
        return "COALESCE(bin_label, 'n/a')"
    raise HTTPException(400, f"Unknown stratifier {stratifier!r}")


def _clinical_cte_sql(stratifier: str | None) -> str:
    """Returns either '' or a comma-prefixed CTE block for the clinical bin."""
    if stratifier is None or stratifier not in _CLINICAL_CTES:
        return ""
    tpl = _CLINICAL_CTES[stratifier]
    return "," + tpl.format(
        phq9a=bq.fq("analysis", "PHQ9A_SCORES"),
        gad7=bq.fq("crf", "GAD7"),
        ascvd=bq.fq("analysis", "ASCVD"),
    )


def _dm_join_clause(stratifier: str | None) -> str:
    if stratifier is not None and stratifier in _CLINICAL_CTES:
        return "LEFT JOIN clinical_bin USING (USUBJID)"
    return ""


def _wear_filter_cte() -> str:
    """CTE joining in per-subject mean wear_fraction for min_wear filtering."""
    return f"""
    wear AS (
      SELECT USUBJID, AVG(wear_fraction) AS wear_fraction_avg
      FROM {bq.fq('sensordata', 'ANNOTATIONS')}
      GROUP BY USUBJID
    )
    """


@router.post("/rollup", response_model=CohortRollupResponse)
def rollup(req: CohortRollupRequest) -> CohortRollupResponse:
    feat = FEATURES_BY_ID.get(req.feature)
    if feat is None:
        raise HTTPException(400, f"Unknown feature {req.feature!r}")

    stratifier_col = _stratifier_col(req.stratifier)

    per_subject = feat.per_subject_sql.format(
        step=bq.fq("sensordata", "STEP"),
        hemet=bq.fq("sensordata", "HEMET"),
        slpmet=bq.fq("sensordata", "SLPMET"),
        ann=bq.fq("sensordata", "ANNOTATIONS"),
    )

    sql = f"""
    WITH
    {_wear_filter_cte()},
    dm AS (
      SELECT USUBJID, SEX, age_at_enrollment, RACE
      FROM {bq.fq('screener', 'DM')}
      {_filter_fragment()}
    ),
    dm_with_wear AS (
      SELECT dm.*, wear.wear_fraction_avg
      FROM dm
      LEFT JOIN wear USING (USUBJID)
      WHERE (@min_wear IS NULL OR wear.wear_fraction_avg >= @min_wear)
    )
    {_clinical_cte_sql(req.stratifier)}
    ,
    dm_full AS (
      SELECT d.*{', clinical_bin.bin_label' if req.stratifier in _CLINICAL_CTES else ''}
      FROM dm_with_wear d
      {_dm_join_clause(req.stratifier)}
    ),
    per_subject AS (
      {per_subject}
    ),
    joined AS (
      SELECT
        d.USUBJID,
        {stratifier_col} AS stratum,
        ps.feature_value
      FROM dm_full d
      JOIN per_subject ps USING (USUBJID)
      WHERE ps.feature_value IS NOT NULL
    )
    SELECT
      stratum,
      COUNT(*) AS n,
      AVG(feature_value) AS mean,
      STDDEV(feature_value) AS sd,
      APPROX_QUANTILES(feature_value, 100)[OFFSET(25)] AS p25,
      APPROX_QUANTILES(feature_value, 100)[OFFSET(50)] AS p50,
      APPROX_QUANTILES(feature_value, 100)[OFFSET(75)] AS p75,
      MIN(feature_value) AS min,
      MAX(feature_value) AS max
    FROM joined
    GROUP BY stratum
    ORDER BY stratum
    """

    params = {
        "sex": req.filters.sex,
        "min_age": ("INT64", req.filters.min_age),
        "max_age": ("INT64", req.filters.max_age),
        "race": req.filters.race,
        "min_wear": ("FLOAT64", req.filters.min_wear),
    }
    df = bq.run_query(sql, params)
    groups = [
        StratumStats(
            label=str(r["stratum"]) if r["stratum"] is not None else "—",
            n=int(r["n"]),
            mean=float(r["mean"]) if r["mean"] is not None else None,
            sd=float(r["sd"]) if r["sd"] is not None else None,
            p25=float(r["p25"]) if r["p25"] is not None else None,
            p50=float(r["p50"]) if r["p50"] is not None else None,
            p75=float(r["p75"]) if r["p75"] is not None else None,
            min=float(r["min"]) if r["min"] is not None else None,
            max=float(r["max"]) if r["max"] is not None else None,
        )
        for r in df.to_dict(orient="records")
    ]
    n_subjects = sum(g.n for g in groups)
    return CohortRollupResponse(
        feature=feat.id,
        feature_label=feat.label,
        feature_unit=feat.unit,
        stratifier=req.stratifier,
        n_subjects=n_subjects,
        groups=groups,
    )


@router.post("/per-subject", response_model=PerSubjectResponse)
def per_subject(req: PerSubjectRequest) -> PerSubjectResponse:
    """Return one row per subject with {demographics, stratum, x, [y]} — for
    scatter plots and strip-plot overlays. Still driven by the same filters.
    """
    fx = FEATURES_BY_ID.get(req.feature_x)
    if fx is None:
        raise HTTPException(400, f"Unknown feature {req.feature_x!r}")
    fy = FEATURES_BY_ID.get(req.feature_y) if req.feature_y else None
    if req.feature_y and fy is None:
        raise HTTPException(400, f"Unknown feature {req.feature_y!r}")

    def _fmt(sql: str) -> str:
        return sql.format(
            step=bq.fq("sensordata", "STEP"),
            hemet=bq.fq("sensordata", "HEMET"),
            slpmet=bq.fq("sensordata", "SLPMET"),
            ann=bq.fq("sensordata", "ANNOTATIONS"),
        )

    stratifier_col = (
        _stratifier_col(req.stratifier) if req.stratifier else "CAST(NULL AS STRING)"
    )
    y_join = (
        "JOIN per_subject_y py USING (USUBJID)" if fy else ""
    )
    y_select = "py.feature_value AS y," if fy else "NULL AS y,"

    sql = f"""
    WITH
    {_wear_filter_cte()},
    dm AS (
      SELECT USUBJID, SEX, age_at_enrollment, RACE
      FROM {bq.fq('screener', 'DM')}
      {_filter_fragment()}
    ),
    dm_with_wear AS (
      SELECT dm.*, wear.wear_fraction_avg
      FROM dm
      LEFT JOIN wear USING (USUBJID)
      WHERE (@min_wear IS NULL OR wear.wear_fraction_avg >= @min_wear)
    )
    {_clinical_cte_sql(req.stratifier)}
    ,
    dm_full AS (
      SELECT d.*{', clinical_bin.bin_label' if req.stratifier in _CLINICAL_CTES else ''}
      FROM dm_with_wear d
      {_dm_join_clause(req.stratifier)}
    ),
    per_subject_x AS ({_fmt(fx.per_subject_sql)})
    {',per_subject_y AS (' + _fmt(fy.per_subject_sql) + ')' if fy else ''}
    SELECT
      d.USUBJID AS usubjid,
      d.SEX AS sex,
      d.age_at_enrollment,
      d.RACE AS race,
      {stratifier_col} AS stratum,
      px.feature_value AS x,
      {y_select}
      d.wear_fraction_avg
    FROM dm_full d
    JOIN per_subject_x px USING (USUBJID)
    {y_join}
    WHERE px.feature_value IS NOT NULL
    """

    params = {
        "sex": req.filters.sex,
        "min_age": ("INT64", req.filters.min_age),
        "max_age": ("INT64", req.filters.max_age),
        "race": req.filters.race,
        "min_wear": ("FLOAT64", req.filters.min_wear),
    }
    df = bq.run_query(sql, params)
    df = df.where(df.notna(), None)
    points = [
        PerSubjectPoint(
            usubjid=str(r["usubjid"]),
            sex=r["sex"],
            age_at_enrollment=(int(r["age_at_enrollment"]) if r["age_at_enrollment"] is not None else None),
            race=r["race"],
            stratum=(str(r["stratum"]) if r["stratum"] is not None else None),
            x=(float(r["x"]) if r["x"] is not None else None),
            y=(float(r["y"]) if r["y"] is not None else None),
        )
        for r in df.to_dict(orient="records")
    ]
    return PerSubjectResponse(
        feature_x=fx.id,
        feature_x_label=fx.label,
        feature_x_unit=fx.unit,
        feature_y=fy.id if fy else None,
        feature_y_label=fy.label if fy else None,
        feature_y_unit=fy.unit if fy else None,
        stratifier=req.stratifier,
        n=len(points),
        points=points,
    )


# ─── Saved cohorts ───────────────────────────────────────────────────────────


def _filtered_usubjids(filters) -> list[str]:
    """Return the list of USUBJIDs matching `filters` in the current subject universe."""
    sql = f"""
    WITH
    {_wear_filter_cte()}
    SELECT d.USUBJID
    FROM {bq.fq('screener', 'DM')} d
    LEFT JOIN wear USING (USUBJID)
    WHERE d.SEX IN ('Male','Female')
      AND d.age_at_enrollment IS NOT NULL
      AND (@sex IS NULL OR d.SEX = @sex)
      AND (@min_age IS NULL OR d.age_at_enrollment >= @min_age)
      AND (@max_age IS NULL OR d.age_at_enrollment <= @max_age)
      AND (@race IS NULL OR d.RACE = @race)
      AND (@min_wear IS NULL OR wear.wear_fraction_avg >= @min_wear)
      {"AND d.USUBJID IN (SELECT USUBJID FROM " + bq.app_fq("demo_subjects") + ")" if get_settings().use_demo_tables else ""}
    ORDER BY d.USUBJID
    """
    params = {
        "sex": filters.sex,
        "min_age": ("INT64", filters.min_age),
        "max_age": ("INT64", filters.max_age),
        "race": filters.race,
        "min_wear": ("FLOAT64", filters.min_wear),
    }
    df = bq.run_query(sql, params, cache=False)
    return [str(u) for u in df["USUBJID"].tolist()]


@router.post("/save", response_model=SavedCohort)
def save_cohort(
    body: SavedCohortIn,
    x_forwarded_user: str | None = Header(default=None),
) -> SavedCohort:
    persistence.ensure_table("cohorts")
    persistence.ensure_table("cohort_members")

    members = _filtered_usubjids(body.filters)
    if not members:
        raise HTTPException(422, "Filter matches zero subjects — widen filters")

    cohort_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    user_email = persistence.user_email(x_forwarded_user)
    filter_json = body.filters.model_dump_json()

    bq.run_query(
        f"""
        INSERT INTO {bq.app_fq('cohorts')}
        (cohort_id, name, description, filter_json, member_count, user_email, created_at)
        VALUES (@cid, @name, @desc, @filter_json, @n, @user, @ts)
        """,
        {
            "cid": cohort_id,
            "name": body.name,
            "desc": body.description,
            "filter_json": filter_json,
            "n": ("INT64", len(members)),
            "user": user_email,
            "ts": ("TIMESTAMP", created_at),
        },
        cache=False,
    )

    # Bulk insert members. Use VALUES list for ≤ ~10k rows, which fits our 102-subject demo.
    values = ", ".join(f"(@cid, @u{i})" for i in range(len(members)))
    params = {"cid": cohort_id}
    for i, u in enumerate(members):
        params[f"u{i}"] = u
    bq.run_query(
        f"INSERT INTO {bq.app_fq('cohort_members')} (cohort_id, usubjid) VALUES {values}",
        params,
        cache=False,
    )

    return SavedCohort(
        cohort_id=cohort_id,
        name=body.name,
        description=body.description,
        filter_json=filter_json,
        member_count=len(members),
        user_email=user_email,
        created_at=created_at.isoformat().replace("+00:00", "Z"),
    )


@router.get("/saved", response_model=SavedCohortList)
def list_saved_cohorts() -> SavedCohortList:
    persistence.ensure_table("cohorts")
    sql = f"""
    SELECT
      cohort_id, name, description, filter_json, member_count, user_email,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
    FROM {bq.app_fq('cohorts')}
    ORDER BY created_at DESC
    LIMIT 500
    """
    df = bq.run_query(sql, cache=False)
    df = df.where(df.notna(), None)
    return SavedCohortList(items=[SavedCohort(**r) for r in df.to_dict(orient="records")])


@router.get("/saved/{cohort_id}", response_model=SavedCohortDetail)
def get_saved_cohort(cohort_id: str) -> SavedCohortDetail:
    persistence.ensure_table("cohorts")
    persistence.ensure_table("cohort_members")
    meta_df = bq.run_query(
        f"""
        SELECT
          cohort_id, name, description, filter_json, member_count, user_email,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', created_at, 'UTC') AS created_at
        FROM {bq.app_fq('cohorts')}
        WHERE cohort_id = @cid
        """,
        {"cid": cohort_id},
        cache=False,
    )
    if meta_df.empty:
        raise HTTPException(404, "Cohort not found")
    meta = meta_df.where(meta_df.notna(), None).iloc[0].to_dict()
    mem_df = bq.run_query(
        f"SELECT usubjid FROM {bq.app_fq('cohort_members')} WHERE cohort_id = @cid ORDER BY usubjid",
        {"cid": cohort_id},
        cache=False,
    )
    members = [str(u) for u in mem_df["usubjid"].tolist()]
    return SavedCohortDetail(**meta, members=members)


@router.delete("/saved/{cohort_id}")
def delete_saved_cohort(cohort_id: str) -> dict:
    persistence.ensure_table("cohorts")
    persistence.ensure_table("cohort_members")
    bq.run_query(
        f"DELETE FROM {bq.app_fq('cohort_members')} WHERE cohort_id = @cid",
        {"cid": cohort_id},
        cache=False,
    )
    bq.run_query(
        f"DELETE FROM {bq.app_fq('cohorts')} WHERE cohort_id = @cid",
        {"cid": cohort_id},
        cache=False,
    )
    return {"deleted": cohort_id}
