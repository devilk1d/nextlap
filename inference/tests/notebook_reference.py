"""Verbatim copy of the notebook (v7) cells that turn raw laps into model inputs.

Kept only as the reference for `test_parity.py`; the API uses `app/pipeline.py`.
Plotting and printing lines are removed; everything else is unchanged.
"""

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from app.pipeline import REQUIRED, SEQ_KEY, STINT_KEY

CFG = {"train_all_drivers": True, "train_pool": "all", "min_valid_tel": 0.9, "restart_laps": 2,
       "max_window": 5, "gap_cap": 10, "dirty_air_gap": 1.0}
EVAL = set()


def run(raw, all_features):
    # cell 7
    raw = raw.sort_values(["race", "Driver", "LapNumber"]).reset_index(drop=True)
    # cell 14
    raw["green"] = raw.TrackStatus.fillna("1").astype(str).eq("1")
    grp = raw.groupby(["race", "Driver"])
    prev_ok = [grp.green.shift(k).fillna(True).astype(bool) for k in range(1, CFG["restart_laps"] + 1)]
    raw["after_flag"] = ~np.logical_and.reduce(prev_ok)

    # cell 24
    def keep(df, mask, label):
        return df[mask]

    d = raw.copy()
    if not CFG["train_all_drivers"]:
        d = keep(d, d.InTop10, "Top-10 drivers only")
    if CFG["train_pool"] == "eval":
        d = keep(d, d.CircuitShortName.isin(EVAL), "Study circuits only")
    wet_races = d.loc[d.Compound.isin(["INTERMEDIATE", "WET"]), "race"].unique()
    d = keep(d, ~d.race.isin(wet_races), "Races with wet tyres")
    d = keep(d, d.Rainfall == 0, "Laps with rainfall")
    d = keep(d, d.IsAccurate & ~d.Deleted & d.LapTime_sec.notna(), "Inaccurate/deleted (incl. in/out laps, lap 1)")
    d = keep(d, d.green, "Yellow flag, SC, VSC, red flag")
    d = keep(d, ~d.after_flag, f"{CFG['restart_laps']} laps after a flag (restart)")
    d = keep(d, d.LapNumber > 2, "Second lap (start effect)")
    d = keep(d, d.LapNumber < d.TotalLaps, "Final lap")
    d = keep(d, d.Tel_ValidFrac >= CFG["min_valid_tel"], "Telemetry validity below threshold")
    d = keep(d, (d.Tel_SpeedMax > 0) & (d.Tel_SpeedMin > 0), "Zero-valued telemetry")
    d = keep(d, (d.Tel_SpanSec - d.LapTime_sec).abs() <= 1, "Telemetry misaligned with lap time")
    d = keep(d, d[REQUIRED].notna().all(axis=1), "Missing feature values")
    d = keep(d, d.LapTime_sec <= 1.07 * d.groupby("race").LapTime_sec.transform("median"), "Above 107% of race median")
    d = d.sort_values(STINT_KEY + ["LapNumber"]).reset_index(drop=True)
    delta = d.LapTime_sec - d.groupby("race").LapTime_sec.transform("median")
    trend = delta.groupby([d.race, d.Driver, d.Stint]).transform(lambda s: s.rolling(5, center=True, min_periods=3).median())
    d = keep(d, (delta - trend).abs() <= 3, "More than 3 s off the stint trend").reset_index(drop=True)

    # cell 32
    d["segment"] = d.groupby(STINT_KEY).LapNumber.transform(lambda s: s.diff().ne(1).cumsum())

    # cell 34
    ok_lap = raw.IsAccurate & raw.green & ~raw.Deleted
    prev_ok_lap = ok_lap.groupby([raw.race, raw.Driver]).shift(1).fillna(False).astype(bool)
    change = (raw.LapTime_sec - raw.groupby(["race", "Driver"]).LapTime_sec.shift(1)).where(ok_lap & prev_ok_lap)
    field = raw[["race", "Driver", "LapNumber", "LapEndTime_sec"]].assign(change=change.where(change.abs() < 3))
    field = field.sort_values(["race", "LapNumber", "LapEndTime_sec"])
    by_lap = field.groupby(["race", "LapNumber"]).change
    field["FieldDelta"] = by_lap.transform(lambda s: s.expanding().median().shift(1)).fillna(0.0)
    field["FieldN"] = by_lap.transform(lambda s: s.notna().cumsum().shift(1)).fillna(0).clip(upper=10)
    d = d.merge(field[["race", "Driver", "LapNumber", "FieldDelta", "FieldN"]], on=["race", "Driver", "LapNumber"], how="left", validate="one_to_one")

    # cell 35
    d["RaceProgress"] = d.LapNumber / d.TotalLaps
    d["GapAhead_cap"] = d.GapAhead_sec.clip(upper=CFG["gap_cap"])
    d["GapBehind_cap"] = d.GapBehind_sec.clip(upper=CFG["gap_cap"])
    d["DirtyAir"] = (d.GapAhead_sec < CFG["dirty_air_gap"]).astype(float)
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
        other = ref.rename(columns={"Driver": col, "LapNumber": "nb_lap", "LapTime_sec": "nb_lt", "LapEndTime_sec": "nb_t"}).sort_values("nb_t")
        left = q.dropna(subset=[col, "LapEndTime_sec"]).sort_values("LapEndTime_sec")
        m = pd.merge_asof(left, other, left_on="LapEndTime_sec", right_on="nb_t", by=["race", col],
                          direction="backward", allow_exact_matches=False)
        return m.set_index("_row").reindex(np.arange(len(q)))

    ahead, behind = neighbour_last_lap("DriverAhead"), neighbour_last_lap("DriverBehind")
    d["AheadLapped"] = (ahead.nb_lap.to_numpy() < d.LapNumber.to_numpy()).astype(float)
    d["AheadPace"] = np.clip(np.nan_to_num(ahead.nb_lt.to_numpy() - d.LapTime_sec.to_numpy(), nan=0.0), -3, 3)
    d["BehindPace"] = np.clip(np.nan_to_num(behind.nb_lt.to_numpy() - d.LapTime_sec.to_numpy(), nan=0.0), -3, 3)

    # cell 37
    META_COLS = ["race", "Driver", "Stint", "LapNumber"]

    def build_sequences(df, features, window):
        xs, ys, metas = [], [], []
        for _, g in df.groupby(SEQ_KEY, sort=False):
            if len(g) <= window:
                continue
            values = g[features].to_numpy(np.float64)
            xs.append(sliding_window_view(values, window, axis=0)[:-1].transpose(0, 2, 1))
            target = g.iloc[window:]
            ys.append(target.LapTime_sec.to_numpy(np.float64))
            meta_g = target[META_COLS].copy()
            meta_g["InputLastLap"] = g.LapNumber.to_numpy()[window - 1:-1]
            metas.append(meta_g)
        return np.concatenate(xs), np.concatenate(ys), pd.concat(metas, ignore_index=True)

    return build_sequences(d, all_features, CFG["max_window"])
