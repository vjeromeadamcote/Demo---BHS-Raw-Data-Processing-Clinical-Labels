from pydantic import BaseModel, Field


class FeatureMeta(BaseModel):
    id: str
    label: str
    group: str
    modality: str
    description: str


class FeatureCatalog(BaseModel):
    items: list[FeatureMeta]


class FeatureComputeRequest(BaseModel):
    usubjid: str
    day_min: int
    day_max: int
    # Optional sub-window within the day range (fractional study_day units).
    # If omitted, the full day range is used.
    window_day_start: float | None = None
    window_day_end: float | None = None
    feature_ids: list[str] = Field(min_length=1, max_length=50)


class FeatureResult(BaseModel):
    feature_id: str
    modality: str
    label: str
    values: dict[str, float | int | None]
    n_source_points: int
    error: str | None = None


class FeatureComputeResponse(BaseModel):
    usubjid: str
    window_day_start: float
    window_day_end: float
    results: list[FeatureResult]
