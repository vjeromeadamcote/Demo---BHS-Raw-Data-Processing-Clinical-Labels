"""Feature catalog — metadata + dispatch for the compute endpoint."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd

from . import activity, hr, sleep_feat, spectrogram, step_feat


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
    # ── Spectral
    FeatureDef(
        id="spectral.psd_summary",
        label="PSD summary (peak freq, peak power)",
        group="Spectral",
        modality="PULSE",
        description="Welch PSD summary on uniformly resampled pulse.",
        fn=spectrogram.psd_welch,
    ),
    FeatureDef(
        id="spectral.band_0_02_0_2",
        label="PSD band 0.02–0.2 Hz",
        group="Spectral",
        modality="PULSE",
        description="Mean Welch PSD power in 0.02–0.2 Hz (slow HR trends).",
        fn=lambda df: spectrogram.band_power(df, band=(0.02, 0.2), fs=1.0),
    ),
    FeatureDef(
        id="spectral.band_0_2_0_5",
        label="PSD band 0.2–0.5 Hz",
        group="Spectral",
        modality="PULSE",
        description="Mean Welch PSD power in 0.2–0.5 Hz.",
        fn=lambda df: spectrogram.band_power(df, band=(0.2, 0.5), fs=1.0),
    ),
    # ── Steps
    FeatureDef(
        id="step.summary",
        label="Step summary (total / events / max)",
        group="Steps",
        modality="STEP",
        description="Total steps in the window plus event counts.",
        fn=step_feat.step_summary,
    ),
    FeatureDef(
        id="step.cadence",
        label="Cadence (steps/min, median of inter-event)",
        group="Steps",
        modality="STEP",
        description="Median cadence within bursts of step events.",
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
