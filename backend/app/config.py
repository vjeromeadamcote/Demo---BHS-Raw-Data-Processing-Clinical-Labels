import os
from functools import lru_cache
from pydantic import BaseModel


class Settings(BaseModel):
    bhs_project: str = "wb-spotless-eggplant-4340"
    bhs_sensordata_dataset: str = "sensordata"
    bhs_screener_dataset: str = "screener"
    bhs_crf_dataset: str = "crf"
    bhs_analysis_dataset: str = "analysis"

    app_project: str = os.getenv("WORKBENCH_GOOGLE_PROJECT", "wb-rapid-apricot-2196")
    app_dataset: str = "biomarker_app"
    export_bucket: str = os.getenv(
        "WORKBENCH_biomarker_app_exports", "biomarker-app-exports-1776418177"
    )

    # Read sensor data from the clustered demo materialization instead of the 18 TB source.
    # Set USE_DEMO_TABLES=false to query the full source (requires raising max_bytes_billed).
    use_demo_tables: bool = os.getenv("USE_DEMO_TABLES", "true").lower() == "true"
    demo_table_suffix: str = "_demo"  # PULSE → pulse_demo, etc.

    # BQ rejects queries whose pre-execution upper bound exceeds this cap, even though
    # clustering prune at scan time makes actual bytes ~100 MB. In demo mode we trust
    # clustering and allow up to the full table size (~2 TB). Outside demo mode we keep
    # a tight 50 GB cap as a cost guardrail against unclustered source scans.
    max_bytes_billed: int = int(
        os.getenv(
            "BQ_MAX_BYTES_BILLED",
            2 * 1024**4 if os.getenv("USE_DEMO_TABLES", "true").lower() == "true" else 50 * 1024**3,
        )
    )

    cache_max_items: int = 512

    env: str = os.getenv("APP_ENV", "dev")


@lru_cache
def get_settings() -> Settings:
    return Settings()
