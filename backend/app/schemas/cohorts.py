from pydantic import BaseModel, Field


class CohortFilter(BaseModel):
    sex: str | None = None  # 'Male' | 'Female'
    min_age: int | None = None
    max_age: int | None = None
    race: str | None = None
    min_wear: float | None = None


class CohortRollupRequest(BaseModel):
    filters: CohortFilter = Field(default_factory=CohortFilter)
    feature: str
    stratifier: str  # 'sex' | 'age_bin' | 'race'


class StratumStats(BaseModel):
    label: str
    n: int
    mean: float | None = None
    sd: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    min: float | None = None
    max: float | None = None


class CohortRollupResponse(BaseModel):
    feature: str
    feature_label: str
    feature_unit: str | None = None
    stratifier: str
    n_subjects: int
    groups: list[StratumStats]


class CohortFeatureMeta(BaseModel):
    id: str
    label: str
    unit: str | None = None
    description: str
    modality: str


class CohortCatalog(BaseModel):
    features: list[CohortFeatureMeta]
    stratifiers: list[dict]


class PerSubjectRequest(BaseModel):
    filters: CohortFilter = Field(default_factory=CohortFilter)
    feature_x: str                        # feature id — x value (or the only value)
    feature_y: str | None = None          # optional y value for scatter
    stratifier: str | None = None         # optional grouping label for color / strip x


class PerSubjectPoint(BaseModel):
    usubjid: str
    sex: str | None = None
    age_at_enrollment: int | None = None
    race: str | None = None
    stratum: str | None = None
    x: float | None = None
    y: float | None = None


class PerSubjectResponse(BaseModel):
    feature_x: str
    feature_x_label: str
    feature_x_unit: str | None = None
    feature_y: str | None = None
    feature_y_label: str | None = None
    feature_y_unit: str | None = None
    stratifier: str | None = None
    n: int
    points: list[PerSubjectPoint]
