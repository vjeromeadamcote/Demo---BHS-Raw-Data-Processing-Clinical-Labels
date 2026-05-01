"""Heart-rate features computed from the PULSE time-series."""
from __future__ import annotations

import numpy as np
import pandas as pd


def hr_summary(df: pd.DataFrame) -> dict[str, float | None]:
    """df columns: t_ms, value (bpm)."""
    v = df["value"].dropna().to_numpy(dtype=float)
    if v.size < 5:
        return {"mean": None, "median": None, "sd": None, "cv": None, "min": None, "max": None}
    mean = float(np.mean(v))
    sd = float(np.std(v, ddof=1)) if v.size > 1 else 0.0
    return {
        "mean": mean,
        "median": float(np.median(v)),
        "sd": sd,
        "cv": (sd / mean) if mean > 0 else None,
        "min": float(np.min(v)),
        "max": float(np.max(v)),
    }


def hrv_from_hemet(df: pd.DataFrame) -> dict[str, float | None]:
    """HRV metrics from the HEMET table.

    HEMET provides daily resting heart rate (rhr), rmssd_mean, and sdnn_index.
    This function extracts and averages the HRV metrics across the window.
    """
    if df.empty or len(df) == 0:
        return {"rmssd_mean": None, "sdnn_index": None, "rhr_mean": None, "n_days": 0}

    # Extract the columns
    rmssd = df["rmssd_mean"].dropna()
    sdnn = df["sdnn_index"].dropna()
    rhr = df["value"].dropna()  # rhr is stored in the 'value' column

    return {
        "rmssd_mean": float(rmssd.mean()) if len(rmssd) > 0 else None,
        "sdnn_index": float(sdnn.mean()) if len(sdnn) > 0 else None,
        "rhr_mean": float(rhr.mean()) if len(rhr) > 0 else None,
        "n_days": int(len(df)),
    }
