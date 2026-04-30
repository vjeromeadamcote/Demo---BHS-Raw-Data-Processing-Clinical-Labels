from pydantic import BaseModel, Field

from .cohorts import CohortFilter


# ── Cohorts ──────────────────────────────────────────────────────────────────


class SavedCohortIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    filters: CohortFilter = Field(default_factory=CohortFilter)


class SavedCohort(BaseModel):
    cohort_id: str
    name: str
    description: str | None = None
    filter_json: str
    member_count: int
    user_email: str | None = None
    created_at: str


class SavedCohortDetail(SavedCohort):
    members: list[str] = Field(default_factory=list)


class SavedCohortList(BaseModel):
    items: list[SavedCohort]


# ── Feature runs ─────────────────────────────────────────────────────────────


class SaveFeatureRunIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    usubjid: str
    day_min: int
    day_max: int
    window_day_start: float | None = None
    window_day_end: float | None = None
    feature_ids: list[str] = Field(min_length=1, max_length=50)


class FeatureRunSummary(BaseModel):
    run_id: str
    name: str | None = None
    description: str | None = None
    usubjid: str
    study_day_start: float | None = None
    study_day_end: float | None = None
    n_features: int
    n_rows: int
    user_email: str | None = None
    created_at: str


class FeatureRunList(BaseModel):
    items: list[FeatureRunSummary]


class FeatureRunValue(BaseModel):
    feature_id: str
    value_key: str
    value: float | None = None


class FeatureRunDetail(FeatureRunSummary):
    values: list[FeatureRunValue] = Field(default_factory=list)
    params_json: str | None = None
    gcs_paths: list[str] = Field(default_factory=list)


# ── Feature sets ─────────────────────────────────────────────────────────────


class FeatureSetIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    feature_ids: list[str] = Field(min_length=1, max_length=50)
    params_json: str | None = None


class FeatureSet(BaseModel):
    feature_set_id: str
    name: str
    description: str | None = None
    feature_ids: list[str]
    params_json: str | None = None
    user_email: str | None = None
    created_at: str


class FeatureSetList(BaseModel):
    items: list[FeatureSet]
