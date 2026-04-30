from pydantic import BaseModel, Field


class SubjectSummary(BaseModel):
    usubjid: str
    subjid: str | None = None
    age_at_enrollment: int | None = None
    sex: str | None = None
    race: str | None = None
    hispanic_ancestry: str | None = None
    wear_fraction_avg: float | None = Field(
        None, description="Mean ANNOTATIONS.wear_fraction across segments; 0..1"
    )
    n_wear_segments: int | None = None
    study_day_min: int | None = None
    study_day_max: int | None = None


class SubjectListResponse(BaseModel):
    items: list[SubjectSummary]
    total: int
    limit: int
    offset: int


class SubjectDetail(SubjectSummary):
    modalities: dict[str, bool] = Field(
        default_factory=dict,
        description="Per-modality presence flag (PULSE/STEP/HEMET/AMCLASS/SLPMET/SLPSTG/SLPTIM)",
    )


class DaySummary(BaseModel):
    study_day: int
    wear_fraction: float | None = None
    step_total: float | None = None
    amclass_n_classes: int | None = None
    pulse_n: int | None = None
    sleep_present: bool = False
    score: float = 0.0


class DaySummaryResponse(BaseModel):
    usubjid: str
    day_min: int
    day_max: int
    days: list[DaySummary]
