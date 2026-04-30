from pydantic import BaseModel, Field


# Coarse label taxonomy — expand by just adding more strings.
DEFAULT_LABEL_OPTIONS = [
    "walking",
    "running",
    "rest",
    "sleep",
    "stress",
    "artifact",
    "custom",
]


class LabelIn(BaseModel):
    usubjid: str
    study_day_start: float
    study_day_end: float
    label: str = Field(pattern="^(walking|running|rest|sleep|stress|artifact|custom)$")
    custom_label: str | None = None
    notes: str | None = None


class Label(LabelIn):
    label_id: str
    user_email: str | None = None
    created_at: str  # ISO 8601


class LabelList(BaseModel):
    items: list[Label]


class LabelOptions(BaseModel):
    options: list[str] = Field(default_factory=lambda: list(DEFAULT_LABEL_OPTIONS))
