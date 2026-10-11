"""Feature pipeline of the training notebook (v7), reproduced for inference.

Every step mirrors a notebook cell so that a lap gets exactly the same input window as in
training. The notebook works on all races at once, but every statistic is computed per race
(medians, flags, track evolution, neighbours), so running it on one race at a time gives the
same result. `tests/test_parity.py` checks this against a verbatim copy of the notebook code.

Note: like the notebook, cleaning uses race-wide statistics (race median, centred stint trend),
so the forecasts are a faithful replay of the study protocol, not a strictly real-time feed.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

SECTORS = ["Sector1Time_sec", "Sector2Time_sec", "Sector3Time_sec"]
SPEED_TRAPS = ["SpeedI1", "SpeedI2", "SpeedFL", "SpeedST"]
TELEMETRY = [
    "Tel_SpeedMax", "Tel_SpeedMin", "Tel_SpeedMean", "Tel_SpeedStd",
    "Tel_ThrottleMean", "Tel_ThrottleStd", "Tel_PctFullThrottle", "Tel_PctCoast",
    "Tel_PctBraking", "Tel_nBrakeZones", "Tel_nGearMode", "Tel_GearMean", "Tel_nGearShifts",
    "Tel_PctDRSOpen", "Tel_nDRSActivations", "Tel_RPMMax", "Tel_RPMMean", "Tel_RPMStd",
    "Tel_PctSlow", "Tel_PctFast", "Tel_AccelP99", "Tel_DecelP01",
]
WEATHER = ["AirTemp", "TrackTemp", "Humidity", "Pressure", "WindSpeed", "WindDirection"]
TRAFFIC = ["GapAhead_sec", "GapBehind_sec"]
REQUIRED = SECTORS + SPEED_TRAPS + TELEMETRY + WEATHER + TRAFFIC + ["TyreLife", "Compound", "Stint"]
STINT_KEY = ["race", "Driver", "Stint"]
SEQ_KEY = STINT_KEY + ["segment"]

# pandas 2.x warns about the fillna downcast used in the notebook; the result is the same.
warnings.filterwarnings("ignore", message="Downcasting object dtype arrays", category=FutureWarning)


@dataclass(frozen=True)
class CleaningConfig:
    restart_laps: int = 2
    min_valid_tel: float = 0.9
    gap_cap: float = 10.0
    dirty_air_gap: float = 1.0


def mark_flags(raw: pd.DataFrame, cfg: CleaningConfig) -> pd.DataFrame:
    """Notebook cell 3.2: green-flag marker and the restart window after any flag."""
    raw = raw.sort_values(["race", "Driver", "LapNumber"]).reset_index(drop=True)
    raw["green"] = raw.TrackStatus.fillna("1").astype(str).eq("1")
    grp = raw.groupby(["race", "Driver"])
    prev_ok = [grp.green.shift(k).fillna(True).astype(bool) for k in range(1, cfg.restart_laps + 1)]
    raw["after_flag"] = ~np.logical_and.reduce(prev_ok)
    return raw


def clean(raw: pd.DataFrame, cfg: CleaningConfig) -> pd.DataFrame:
    """Notebook section 4 (train_all_drivers=True, train_pool='all')."""
    d = raw.copy()
    wet_races = d.loc[d.Compound.isin(["INTERMEDIATE", "WET"]), "race"].unique()
    d = d[~d.race.isin(wet_races)]
    d = d[d.Rainfall == 0]
    d = d[d.IsAccurate & ~d.Deleted & d.LapTime_sec.notna()]
    d = d[d.green]
    d = d[~d.after_flag]
    d = d[d.LapNumber > 2]
    d = d[d.LapNumber < d.TotalLaps]
    d = d[d.Tel_ValidFrac >= cfg.min_valid_tel]
    d = d[(d.Tel_SpeedMax > 0) & (d.Tel_SpeedMin > 0)]
    d = d[(d.Tel_SpanSec - d.LapTime_sec).abs() <= 1]
    d = d[d[REQUIRED].notna().all(axis=1)]
    d = d[d.LapTime_sec <= 1.07 * d.groupby("race").LapTime_sec.transform("median")]

    d = d.sort_values(STINT_KEY + ["LapNumber"]).reset_index(drop=True)
    if d.empty:
        return d.assign(segment=pd.Series(dtype=int))
    delta = d.LapTime_sec - d.groupby("race").LapTime_sec.transform("median")
    trend = delta.groupby([d.race, d.Driver, d.Stint]).transform(
        lambda s: s.rolling(5, center=True, min_periods=3).median())
    d = d[(delta - trend).abs() <= 3].reset_index(drop=True)
    d["segment"] = d.groupby(STINT_KEY).LapNumber.transform(lambda s: s.diff().ne(1).cumsum())
    return d


def field_signal(raw: pd.DataFrame) -> pd.DataFrame:
    """Notebook section 6: track evolution from laps already completed by other drivers."""
    ok_lap = raw.IsAccurate & raw.green & ~raw.Deleted
    prev_ok_lap = ok_lap.groupby([raw.race, raw.Driver]).shift(1).fillna(False).astype(bool)
    change = (raw.LapTime_sec - raw.groupby(["race", "Driver"]).LapTime_sec.shift(1)).where(ok_lap & prev_ok_lap)
    field = raw[["race", "Driver", "LapNumber", "LapEndTime_sec"]].assign(change=change.where(change.abs() < 3))
    field = field.sort_values(["race", "LapNumber", "LapEndTime_sec"])
    by_lap = field.groupby(["race", "LapNumber"]).change
    field["FieldDelta"] = by_lap.transform(lambda s: s.expanding().median().shift(1)).fillna(0.0)
    field["FieldN"] = by_lap.transform(lambda s: s.notna().cumsum().shift(1)).fillna(0).clip(upper=10)
    return field[["race", "Driver", "LapNumber", "FieldDelta", "FieldN"]]


def engineer(d: pd.DataFrame, raw: pd.DataFrame, cfg: CleaningConfig) -> pd.DataFrame:
    """Notebook section 6: derived features on the clean laps."""
    if d.empty:
        return d
    d = d.merge(field_signal(raw), on=["race", "Driver", "LapNumber"], how="left", validate="one_to_one")
    d["RaceProgress"] = d.LapNumber / d.TotalLaps
    d["GapAhead_cap"] = d.GapAhead_sec.clip(upper=cfg.gap_cap)
    d["GapBehind_cap"] = d.GapBehind_sec.clip(upper=cfg.gap_cap)
    d["DirtyAir"] = (d.GapAhead_sec < cfg.dirty_air_gap).astype(float)
    d["FreshTyre"] = d.FreshTyre.astype(float)
    for comp in ["SOFT", "MEDIUM", "HARD"]:
        d[f"Compound_{comp}"] = (d.Compound == comp).astype(float)
    d["WindDir_sin"] = np.sin(np.deg2rad(d.WindDirection))
    d["WindDir_cos"] = np.cos(np.deg2rad(d.WindDirection))
    d["ProxAhead"] = 1 / (d.GapAhead_cap + 0.3)
    d["ProxBehind"] = 1 / (d.GapBehind_cap + 0.3)
    d["VeryClose"] = (d.GapAhead_sec < 0.5).astype(float)
    d["InRange2"] = (d.GapAhead_sec < 2.0).astype(float)

    ref = raw[["race", "Driver", "LapNumber", "LapEndTime_sec", "LapTime_sec"]].dropna(subset=["LapEndTime_sec"])
    q = d[["race", "LapNumber", "LapEndTime_sec", "LapTime_sec", "DriverAhead", "DriverBehind"]].copy()
    q["_row"] = np.arange(len(q))

    def neighbour_last_lap(col):
        other = ref.rename(columns={"Driver": col, "LapNumber": "nb_lap", "LapTime_sec": "nb_lt",
                                    "LapEndTime_sec": "nb_t"}).sort_values("nb_t")
        left = q.dropna(subset=[col, "LapEndTime_sec"]).sort_values("LapEndTime_sec")
        m = pd.merge_asof(left, other, left_on="LapEndTime_sec", right_on="nb_t", by=["race", col],
                          direction="backward", allow_exact_matches=False)
        return m.set_index("_row").reindex(np.arange(len(q)))

    ahead, behind = neighbour_last_lap("DriverAhead"), neighbour_last_lap("DriverBehind")
    d["AheadLapped"] = (ahead.nb_lap.to_numpy() < d.LapNumber.to_numpy()).astype(float)
    d["AheadPace"] = np.clip(np.nan_to_num(ahead.nb_lt.to_numpy() - d.LapTime_sec.to_numpy(), nan=0.0), -3, 3)
    d["BehindPace"] = np.clip(np.nan_to_num(behind.nb_lt.to_numpy() - d.LapTime_sec.to_numpy(), nan=0.0), -3, 3)
    return d


def build_windows(d: pd.DataFrame, features: list[str], window: int, include_open_targets: bool = False):
    """Notebook section 7: consecutive clean laps of one stint → (window, n_features) inputs.

    With `include_open_targets`, the last window of each segment is also returned: its target lap
    (input last lap + 1) was not a clean lap, so it has no notebook counterpart and no metric.
    """
    xs, metas = [], []
    if d.empty:
        return np.zeros((0, window, len(features))), pd.DataFrame()
    for _, g in d.groupby(SEQ_KEY, sort=False):
        n_windows = len(g) - window + (1 if include_open_targets else 0)
        if n_windows <= 0:
            continue
        values = g[features].to_numpy(np.float64)
        xs.append(sliding_window_view(values, window, axis=0)[:n_windows].transpose(0, 2, 1))
        laps = g.LapNumber.to_numpy()
        lap_times = g.LapTime_sec.to_numpy()
        last = laps[window - 1: window - 1 + n_windows]
        actual = np.full(n_windows, np.nan)
        clean_target = np.arange(n_windows) < len(g) - window
        actual[clean_target] = lap_times[window:]
        metas.append(pd.DataFrame({
            "race": g.race.iloc[0], "Driver": g.Driver.iloc[0], "Stint": g.Stint.iloc[0],
            "InputLastLap": last, "LapNumber": last + 1, "y_true": actual, "clean_target": clean_target,
        }))
    if not xs:
        return np.zeros((0, window, len(features))), pd.DataFrame()
    return np.concatenate(xs), pd.concat(metas, ignore_index=True)


def make_windows(raw: pd.DataFrame, features: list[str], window: int, cfg: CleaningConfig,
                 include_open_targets: bool = False):
    """Raw laps (notebook column names) → model input windows and their metadata."""
    raw = mark_flags(raw, cfg)
    d = engineer(clean(raw, cfg), raw, cfg)
    x, meta = build_windows(d, features, window, include_open_targets)
    if len(x):
        ok = ~np.isnan(x).any(axis=(1, 2))
        x, meta = x[ok], meta[ok].reset_index(drop=True)
    return x, meta
