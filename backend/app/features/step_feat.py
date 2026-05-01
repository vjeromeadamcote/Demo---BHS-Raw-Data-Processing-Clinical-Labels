"""Step-count features from the STEP time-series using Walking Suite Measures."""
from __future__ import annotations

from typing import Dict

import numpy as np
import pandas as pd

# Constants for cadence calculation (aligned with WSM validation)
MS_TO_SEC = 0.001  # Milliseconds to seconds conversion
SEC_TO_MINUTE = 1 / 60  # Seconds to minutes conversion
SEC_TO_HOUR = SEC_TO_MINUTE / 60  # Seconds to hours conversion
MINUTE_TO_SEC = 60  # Minutes to seconds conversion

# Thresholds from Walking Suite Measures
BOUT_CADENCE_THRESHOLD = 0.6  # Lower cadence limit to identify walking bout (steps/sec)
CADENCE_DOUBLING_THRESHOLD = 3.0  # Upper limit on steps/second for resonant doubling correction
BUFFER_SECONDS = 2
MINIMUM_BOUT_DURATION_SEC = 30 - BUFFER_SECONDS  # Minimum bout duration in seconds
MAXIMUM_BOUT_GAP_SEC = 20 + BUFFER_SECONDS  # Maximum gap to bridge bouts in seconds
LONG_BOUT_THRESHOLD_SEC = 120 - BUFFER_SECONDS  # Long bout threshold in seconds
STEP_COUNT_SAMPLE_TIME_SEC = 10  # Time representation for one data point


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


def identify_walking_bouts(
    df: pd.DataFrame,
    cadence_threshold: float = BOUT_CADENCE_THRESHOLD,
    minimum_bout_duration_sec: float = MINIMUM_BOUT_DURATION_SEC,
    maximum_bout_gap_sec: float = MAXIMUM_BOUT_GAP_SEC,
) -> pd.DataFrame:
    """Identifies walking bout periods and assigns block IDs.

    Args:
        df: Dataframe with columns {'cadence', 't_ms'}.
        cadence_threshold: Walking bout cadence threshold criteria.
        minimum_bout_duration_sec: Minimum duration required to seed a bout.
        maximum_bout_gap_sec: Maximum time for which to bridge bout gaps.

    Returns:
        df with additional columns:
            bout_flag: Boolean indicating data row belongs to a defined bout.
            bout_block: Block id for bout periods.
    """
    if len(df) == 0:
        df["bout_flag"] = False
        df["bout_block"] = np.nan
        return df

    df = df.copy().sort_values("t_ms")

    # Assign walking flag according to cadence_threshold
    df["bout_flag"] = df["cadence"] >= cadence_threshold

    # Identify initial blocks based on contiguous representation
    df["bout_block"] = ((df["bout_flag"].shift(1) != df["bout_flag"]).astype(int).cumsum())

    # Find bout window time edges (in milliseconds)
    bout_df = df[df["bout_flag"]].groupby("bout_block")["t_ms"].agg(["min", "max"])

    if len(bout_df) == 0:
        df.loc[~df["bout_flag"], "bout_block"] = np.nan
        return df

    # Calculate bout duration in seconds
    bout_df["duration_sec"] = (bout_df["max"] - bout_df["min"]) / 1000.0

    # Filter bouts based on minimum duration
    filtered_bout_df = bout_df[bout_df["duration_sec"] >= minimum_bout_duration_sec]

    # Remove bout_flag for bouts not meeting criteria
    df.loc[~df["bout_block"].isin(filtered_bout_df.index.values), "bout_flag"] = False

    # Bridge acceptable gaps to form longer bout_blocks
    for count_index in range(len(filtered_bout_df) - 1):
        bout_block_gap_ms = (
            filtered_bout_df.iloc[count_index + 1]["min"]
            - filtered_bout_df.iloc[count_index]["max"]
        )
        if bout_block_gap_ms <= maximum_bout_gap_sec * 1000:  # Convert to ms
            # Join gap
            df.loc[
                df["t_ms"].between(
                    filtered_bout_df.iloc[count_index]["min"],
                    filtered_bout_df.iloc[count_index + 1]["max"],
                ),
                "bout_flag",
            ] = True

    # Reassign bout block IDs
    df["bout_block"] = ((df["bout_flag"].shift(1) != df["bout_flag"]).astype(int).cumsum())
    df.loc[~df["bout_flag"], "bout_block"] = np.nan

    return df


def calculate_bout_features(
    df: pd.DataFrame,
    long_bout_threshold_sec: float = LONG_BOUT_THRESHOLD_SEC,
) -> Dict[str, float]:
    """Calculates bout-based features.

    Args:
        df: Dataframe with columns {'bout_block', 'bout_flag', 't_ms', 'cadence'}.
        long_bout_threshold_sec: Duration required to define a "long-bout".

    Returns:
        Dictionary of bout-based features.
    """
    if df["bout_block"].isna().all():
        return {
            "num_bouts": 0,
            "total_bout_time_sec": 0.0,
            "mean_bout_duration_sec": None,
            "median_bout_duration_sec": None,
            "max_bout_duration_sec": None,
            "num_long_bouts": 0,
            "mean_long_bout_cadence": None,
        }

    # Calculate bout durations
    bout_df = df[~df["bout_block"].isna()].groupby("bout_block")["t_ms"].agg(["min", "max"])
    bout_durations_sec = ((bout_df["max"] - bout_df["min"]) / 1000.0).values

    # Identify long bouts
    long_bout_mask = bout_durations_sec >= long_bout_threshold_sec
    long_bout_blocks = bout_df[long_bout_mask].index.values

    # Calculate long bout cadence
    long_bout_cadence = df[
        df["bout_block"].isin(long_bout_blocks) & (df["cadence"] >= BOUT_CADENCE_THRESHOLD)
    ]["cadence"].values

    return {
        "num_bouts": int(len(bout_durations_sec)),
        "total_bout_time_sec": float(np.sum(bout_durations_sec)),
        "mean_bout_duration_sec": float(np.mean(bout_durations_sec)) if len(bout_durations_sec) > 0 else None,
        "median_bout_duration_sec": float(np.median(bout_durations_sec)) if len(bout_durations_sec) > 0 else None,
        "max_bout_duration_sec": float(np.max(bout_durations_sec)) if len(bout_durations_sec) > 0 else None,
        "num_long_bouts": int(np.sum(long_bout_mask)),
        "mean_long_bout_cadence": float(np.mean(long_bout_cadence)) if len(long_bout_cadence) > 0 else None,
        "num_bouts_30s_1min": int(np.sum((bout_durations_sec >= 30 - BUFFER_SECONDS) & (bout_durations_sec < 60 - BUFFER_SECONDS))),
        "num_bouts_1min": int(np.sum(bout_durations_sec >= 60 - BUFFER_SECONDS)),
        "num_bouts_2min": int(np.sum(bout_durations_sec >= 120 - BUFFER_SECONDS)),
        "num_bouts_5min": int(np.sum(bout_durations_sec >= 300 - BUFFER_SECONDS)),
    }


def calculate_daily_step_features(df: pd.DataFrame) -> Dict[str, float]:
    """Calculates daily step-based aggregate features.

    Args:
        df: Dataframe with columns {'value' (step_count), 'step_interval', 'cadence', 'bout_flag'}.

    Returns:
        Dictionary of daily aggregate features.
    """
    total_steps = float(df["value"].sum())

    # Calculate ambulatory time (time in bouts)
    ambulatory_mask = df["bout_flag"] == True
    ambulatory_minutes = float((df.loc[ambulatory_mask, "step_interval"].sum() * MS_TO_SEC * SEC_TO_MINUTE))

    # Calculate representation time (total data coverage)
    representation_hours = float((df["step_interval"].sum() * MS_TO_SEC * SEC_TO_HOUR))

    # Calculate top N minutes cadence
    valid_cadence = df["cadence"].dropna()
    samples_per_minute = int(60 / STEP_COUNT_SAMPLE_TIME_SEC)

    top_15min_cadence = float(valid_cadence.nlargest(15 * samples_per_minute).mean()) if len(valid_cadence) >= 15 * samples_per_minute else None
    top_30min_cadence = float(valid_cadence.nlargest(30 * samples_per_minute).mean()) if len(valid_cadence) >= 30 * samples_per_minute else None
    top_60min_cadence = float(valid_cadence.nlargest(60 * samples_per_minute).mean()) if len(valid_cadence) >= 60 * samples_per_minute else None

    return {
        "total_steps": total_steps,
        "ambulatory_minutes": ambulatory_minutes,
        "representation_hours": representation_hours,
        "top_15min_cadence_sps": top_15min_cadence,
        "top_30min_cadence_sps": top_30min_cadence,
        "top_60min_cadence_sps": top_60min_cadence,
    }


def walking_suite_features(df: pd.DataFrame) -> dict[str, float | None]:
    """Calculate comprehensive walking suite features.

    Expects df with columns: t_ms, value (step_count), step_interval
    """
    if "step_interval" not in df.columns:
        return {"error": "step_interval column missing"}

    # Filter valid data
    mask = (df["value"] > 0) & (df["step_interval"] > 0)
    df_valid = df[mask].copy()

    if len(df_valid) < 2:
        return {"total_steps": 0.0, "n_samples": 0}

    # Calculate cadence
    df_valid["cadence"] = calculate_cadence_from_stepcount(
        df_valid["value"].values,
        df_valid["step_interval"].values
    )

    # Identify walking bouts
    df_bouts = identify_walking_bouts(df_valid)

    # Calculate bout features
    bout_features = calculate_bout_features(df_bouts)

    # Calculate daily aggregate features
    daily_features = calculate_daily_step_features(df_bouts)

    # Combine all features
    features = {**daily_features, **bout_features}
    features["n_samples"] = int(len(df))
    features["n_valid_samples"] = int(len(df_valid))

    return features


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
