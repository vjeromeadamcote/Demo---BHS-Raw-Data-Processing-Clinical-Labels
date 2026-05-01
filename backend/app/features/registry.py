"""Feature catalog — metadata + dispatch for the compute endpoint."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd

from . import activity, hr, sleep_feat, step_feat


@dataclass(frozen=True)
class FeatureDef:
    id: str                                 # stable machine id
    label: str                              # UI label
    group: str                              # UI group header
    modality: str                           # required source modality (PULSE/STEP/HEMET/AMCLASS/SLPSTG/SLPMET)
    description: str
    fn: Callable[[pd.DataFrame], dict]      # returns a dict of sub-metric → value


# Registry. Order matters for UI ordering inside each group.
FEATURES: list[FeatureDef] = [
    # ── Heart rate
    FeatureDef(
        id="hr.summary",
        label="HR summary (mean / median / SD / CV)",
        group="Heart rate",
        modality="PULSE",
        description="Aggregate statistics of the pulse rate series.",
        fn=hr.hr_summary,
    ),
    FeatureDef(
        id="hr.hrv_approx",
        label="HRV (RMSSD / SDNN from HEMET)",
        group="Heart rate",
        modality="HEMET",
        description=(
            "RMSSD and SDNN index from the HEMET table. "
            "Daily HRV metrics averaged across the selected window."
        ),
        fn=hr.hrv_from_hemet,
    ),
    # ── Steps
    FeatureDef(
        id="step.walking_suite",
        label="Walking Suite Measures (comprehensive step features)",
        group="Steps",
        modality="STEP",
        description=(
            "Comprehensive walking features from validated Walking Suite Measures: "
            "daily step counts, ambulatory time, bout analysis (counts, durations), "
            "top cadence windows (15/30/60min), and long bout metrics. "
            "Uses validated cadence calculation with bout detection and resonant doubling correction."
        ),
        fn=step_feat.walking_suite_features,
    ),
    FeatureDef(
        id="step.cadence",
        label="Cadence (validated WSM calculation)",
        group="Steps",
        modality="STEP",
        description=(
            "Mean cadence using validated WSM method: step_count / (step_interval * MS_TO_SEC). "
            "Applies bout threshold filtering (>0.6 steps/sec) and resonant doubling correction (≥3.0 steps/sec ÷ 2)."
        ),
        fn=step_feat.cadence,
    ),
    # ── Activity class
    FeatureDef(
        id="activity.fractions",
        label="Activity class fractions",
        group="Activity",
        modality="AMCLASS",
        description="Fraction of window per activity class.",
        fn=activity.class_fractions,
    ),
    FeatureDef(
        id="activity.transitions",
        label="Activity class transitions",
        group="Activity",
        modality="AMCLASS",
        description="Number of class transitions and distinct classes.",
        fn=activity.transitions,
    ),
    # ── Sleep
    FeatureDef(
        id="sleep.stage_fractions",
        label="Sleep stage fractions",
        group="Sleep",
        modality="SLPSTG",
        description="Fraction of samples per sleep stage.",
        fn=sleep_feat.stage_fractions,
    ),
    FeatureDef(
        id="sleep.metrics",
        label="Sleep metrics (efficiency, n nights)",
        group="Sleep",
        modality="SLPMET",
        description="Daily sleep metrics averaged across the window.",
        fn=sleep_feat.sleep_metrics_daily,
    ),
]


_BY_ID: dict[str, FeatureDef] = {f.id: f for f in FEATURES}


def get(feature_id: str) -> FeatureDef | None:
    return _BY_ID.get(feature_id)


def all_features() -> list[FeatureDef]:
    return list(FEATURES)
