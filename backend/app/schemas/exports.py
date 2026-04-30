from pydantic import BaseModel, Field


class ExportRowsIn(BaseModel):
    kind: str = Field(
        pattern="^(labels|subjects|cohort_rollup|feature_run|scatter|other)$"
    )
    filename_hint: str                               # "subjects_filtered" etc.
    format: str = Field(pattern="^(csv|parquet)$")
    rows: list[dict]                                 # inline rows; server uploads to GCS
    source_ids: dict | None = None                   # {cohort_id, run_id, ...}
    params: dict | None = None


class ExportRecord(BaseModel):
    export_id: str
    kind: str
    gcs_path: str
    format: str
    row_count: int | None = None
    size_bytes: int | None = None
    params_json: str | None = None
    source_ids: str | None = None
    user_email: str | None = None
    created_at: str


class ExportList(BaseModel):
    items: list[ExportRecord]


class SignedUrl(BaseModel):
    export_id: str
    gcs_path: str
    url: str
    expires_in: int
