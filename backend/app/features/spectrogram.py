"""Spectral features on the PULSE bpm time-series."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import signal as sp_signal


def _resample_uniform(df: pd.DataFrame, fs: float = 1.0) -> tuple[np.ndarray, float]:
    """Uniform-resample (t, value) to sample rate `fs` (Hz). Returns (y, fs)."""
    t = df["t_ms"].to_numpy(dtype=float)
    y = df["value"].to_numpy(dtype=float)
    mask = np.isfinite(y)
    t, y = t[mask], y[mask]
    if t.size < 8:
        return np.array([]), fs
    t0, t1 = float(t[0]), float(t[-1])
    dt = 1000.0 / fs
    n = int(np.floor((t1 - t0) / dt)) + 1
    if n < 8:
        return np.array([]), fs
    grid = t0 + np.arange(n) * dt
    yi = np.interp(grid, t, y)
    yi = yi - np.mean(yi)
    return yi, fs


def psd_welch(df: pd.DataFrame, fs: float = 1.0) -> dict[str, float | None]:
    """Full Welch PSD summary on uniformly resampled PULSE."""
    y, fs = _resample_uniform(df, fs=fs)
    if y.size < 32:
        return {"peak_freq_hz": None, "peak_power_db": None, "n_samples": int(y.size)}
    nperseg = int(min(256, max(8, y.size // 4)))
    f, pxx = sp_signal.welch(y, fs=fs, nperseg=nperseg)
    i = int(np.argmax(pxx))
    return {
        "peak_freq_hz": float(f[i]),
        "peak_power_db": float(10 * np.log10(max(pxx[i], 1e-20))),
        "n_samples": int(y.size),
    }


def band_power(
    df: pd.DataFrame,
    band: tuple[float, float],
    fs: float = 1.0,
) -> dict[str, float | None]:
    """Mean PSD power (linear + dB) within [band_lo, band_hi] Hz."""
    y, fs = _resample_uniform(df, fs=fs)
    if y.size < 32:
        return {"power_linear": None, "power_db": None, "n_samples": int(y.size)}
    nperseg = int(min(256, max(8, y.size // 4)))
    f, pxx = sp_signal.welch(y, fs=fs, nperseg=nperseg)
    lo, hi = band
    mask = (f >= lo) & (f < hi)
    if not mask.any():
        return {"power_linear": 0.0, "power_db": None, "n_samples": int(y.size)}
    p = float(np.mean(pxx[mask]))
    return {
        "power_linear": p,
        "power_db": float(10 * np.log10(max(p, 1e-20))),
        "n_samples": int(y.size),
    }
