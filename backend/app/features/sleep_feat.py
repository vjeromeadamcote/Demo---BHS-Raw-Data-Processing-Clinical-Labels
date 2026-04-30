"""Sleep features from SLPSTG (stage transitions) and SLPMET (daily metrics)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def stage_fractions(df: pd.DataFrame) -> dict[str, float]:
    """Fraction of samples per sleep stage. Use SLPSTG rows within the window."""
    if df.empty or "label" not in df.columns:
        return {}
    labels = df["label"].dropna().astype(str).to_numpy()
    if labels.size == 0:
        return {}
    uniq, counts = np.unique(labels, return_counts=True)
    n = counts.sum()
    return {f"pct_{u.lower()}": float(c) / float(n) for u, c in zip(uniq, counts)}


def sleep_metrics_daily(slpmet_df: pd.DataFrame) -> dict[str, float | None]:
    """Average daily sleep metrics across the window (from SLPMET)."""
    if slpmet_df.empty:
        return {"sleep_efficiency": None, "total_sleep_time_min": None, "n_nights": 0}
    # The SLPMET response uses `value` for sleep_efficiency; total_sleep_time is unavailable
    # at this layer. The router-level code already projects what we need.
    eff = slpmet_df["value"].dropna().to_numpy(dtype=float)
    return {
        "sleep_efficiency": float(np.mean(eff)) if eff.size else None,
        "n_nights": int(eff.size),
    }
