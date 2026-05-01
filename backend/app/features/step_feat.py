"""Step-count features from the STEP time-series."""
from __future__ import annotations

import numpy as np
import pandas as pd

# Constants for cadence calculation (aligned with WSM validation)
MS_TO_SEC = 0.001  # Milliseconds to seconds conversion
BOUT_CADENCE_THRESHOLD = 1.0  # steps/second - minimum cadence to consider valid
CADENCE_DOUBLING_THRESHOLD = 3.5  # steps/second - threshold for resonant doubling correction


def step_summary(df: pd.DataFrame) -> dict[str, float | None]:
    """df: t_ms, value=step_count at that timestamp."""
    v = df["value"].dropna().to_numpy(dtype=float)
    if v.size == 0:
        return {"total_steps": 0.0, "active_events": 0, "mean_event_size": None, "max_event": None}
    active = v[v > 0]
    return {
        "total_steps": float(np.sum(v)),
        "active_events": int(active.size),
        "mean_event_size": float(active.mean()) if active.size else None,
        "max_event": float(active.max()) if active.size else None,
    }


def calculate_cadence_from_stepcount(
    step_count: np.ndarray,
    step_interval: np.ndarray,
    bout_cadence_threshold: float = BOUT_CADENCE_THRESHOLD,
    cadence_doubling_threshold: float = CADENCE_DOUBLING_THRESHOLD,
) -> np.ndarray:
    """Calculates cadence from step counts and corresponding step intervals.

    Args:
        step_count: Array of step count values.
        step_interval: Array of time intervals in milliseconds associated with
            step count values. step_interval must be the same length as step
            count.
        bout_cadence_threshold: Cadence threshold below which returned values
            are NaN.
        cadence_doubling_threshold: Upper limit on steps/second.

    Returns:
        Array of cadence values the same length as step_count and step_interval.
    """
    # Calculate cadence as steps/second.
    cadence = step_count / (step_interval * MS_TO_SEC)
    cadence[cadence < bout_cadence_threshold] = np.nan

    # Correct resonant doubling of cadence.
    cadence[cadence >= cadence_doubling_threshold] /= 2

    return cadence


def cadence(df: pd.DataFrame) -> dict[str, float | None]:
    """Calculate mean cadence using step_interval from the STEP table.

    Uses validated WSM cadence calculation: cadence = step_count / (step_interval * MS_TO_SEC)
    Applies bout threshold filtering and resonant doubling correction.
    """
    if "step_interval" not in df.columns:
        return {"cadence_spm": None, "cadence_mean_sps": None, "n_events": 0, "error": "step_interval column missing"}

    step_count = df["value"].to_numpy(dtype=float)
    step_interval = df["step_interval"].to_numpy(dtype=float)

    # Filter out zero or invalid values
    mask = (step_count > 0) & (step_interval > 0)
    step_count = step_count[mask]
    step_interval = step_interval[mask]

    if step_count.size < 2:
        return {"cadence_spm": None, "cadence_mean_sps": None, "n_events": int(step_count.size)}

    # Calculate cadence using validated WSM method
    cadence_sps = calculate_cadence_from_stepcount(step_count, step_interval)

    # Filter out NaN values
    valid_cadence = cadence_sps[~np.isnan(cadence_sps)]

    if valid_cadence.size == 0:
        return {"cadence_spm": None, "cadence_mean_sps": None, "n_events": int(step_count.size)}

    # Return mean cadence in both steps/second and steps/minute
    mean_sps = float(np.mean(valid_cadence))
    return {
        "cadence_spm": mean_sps * 60.0,  # Convert to steps per minute
        "cadence_mean_sps": mean_sps,  # Also return steps per second
        "n_events": int(step_count.size),
        "n_valid_events": int(valid_cadence.size),
    }
