from pydantic import BaseModel, Field


class SignalPoint(BaseModel):
    t_ms: int = Field(..., description="UTC ms from epoch (derived from study_day + ms_from_midnight)")
    study_day: float | None = None
    value: float | None = None
    label: str | None = None  # categorical modalities


class SignalSeries(BaseModel):
    modality: str
    usubjid: str
    study_day_min: int
    study_day_max: int
    downsampled_from: int | None = None
    points: list[SignalPoint]
    units: str | None = None
    extra_values: dict[str, list[float | None]] | None = None  # for multi-channel (HEMET)


class SignalsResponse(BaseModel):
    usubjid: str
    study_day_min: int
    study_day_max: int
    series: list[SignalSeries]
