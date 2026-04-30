"""Step-count features from the STEP time-series."""
from __future__ import annotations

import numpy as np
import pandas as pd


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


def cadence(df: pd.DataFrame) -> dict[str, float | None]:
    """Approximate mean cadence in steps/min using event timestamps.

    Cadence = 60000 / median inter-event interval within active bursts.
    """
    t = df["t_ms"].to_numpy(dtype=float)
    v = df["value"].to_numpy(dtype=float)
    mask = v > 0
    ta = t[mask]
    if ta.size < 4:
        return {"cadence_spm": None, "n_events": int(ta.size)}
    dt = np.diff(ta)
    # Drop large gaps (>5 s) — treat as between-bout pauses
    dt = dt[(dt > 0) & (dt < 5_000)]
    if dt.size == 0:
        return {"cadence_spm": None, "n_events": int(ta.size)}
    median_ms = float(np.median(dt))
    return {
        "cadence_spm": 60_000.0 / median_ms if median_ms > 0 else None,
        "n_events": int(ta.size),
    }
