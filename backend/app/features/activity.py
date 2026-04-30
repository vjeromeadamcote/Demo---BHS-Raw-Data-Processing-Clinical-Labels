"""Activity-class features from AMCLASS."""
from __future__ import annotations

import numpy as np
import pandas as pd


def class_fractions(df: pd.DataFrame) -> dict[str, float]:
    """Fraction of samples in each observed activity class."""
    if df.empty or "label" not in df.columns:
        return {}
    labels = df["label"].dropna().astype(str).to_numpy()
    if labels.size == 0:
        return {}
    uniq, counts = np.unique(labels, return_counts=True)
    n = counts.sum()
    return {f"pct_{u.lower()}": float(c) / float(n) for u, c in zip(uniq, counts)}


def transitions(df: pd.DataFrame) -> dict[str, int]:
    """Number of class transitions in the window + number of distinct classes."""
    if df.empty or "label" not in df.columns:
        return {"n_transitions": 0, "n_classes": 0}
    labels = df["label"].dropna().astype(str).to_numpy()
    if labels.size < 2:
        return {"n_transitions": 0, "n_classes": int(np.unique(labels).size)}
    return {
        "n_transitions": int(np.sum(labels[1:] != labels[:-1])),
        "n_classes": int(np.unique(labels).size),
    }
