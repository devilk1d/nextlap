"""Split every prediction of the final model into the contribution of seven feature groups.

    # 1) dry run: compute for every dry race, check, save factors_final.csv
    python -m scripts.explain_predictions

    # 2) write to prediction_factors for model_run 'final:LSTM:E' (needs the secret/service-role key)
    SUPABASE_SECRET_KEY=... python -m scripts.explain_predictions --write

What is stored per prediction (seconds, all relative to the same driver's window):

    window_mean_sec  mean lap time of the five input laps (the model predicts a change from this)
    baseline_shift   what the model adds when every group is neutral ("typical drift")
    c_*              Shapley value of each group: how far that group moves the prediction away
                     from the neutral input
    predicted = window_mean_sec + baseline_shift + sum(c_*)           (checked, to 1e-5 s)

A group that is switched off takes a neutral value: features that the model reads relative to the
window go flat (their window mean), the others take the median of that race. Exact Shapley values
over 7 groups need 2^7 = 128 forward passes per window; nothing is retrained.
`ref_*` hold the race medians used as "typical", so the page can say "1.8 s vs 2.8 s typical".
"""

from __future__ import annotations

import argparse
import itertools
import math
import os

import httpx
import numpy as np
import pandas as pd

from app.db import Database, load_env
from app.model import LapTimeModel
from app.pipeline import CleaningConfig, make_windows
from app.service import race_origins

RUN_NAME = "final:LSTM:E"

SPEED_TRAPS = ["SpeedI1", "SpeedI2", "SpeedFL", "SpeedST"]
LAP_TELEMETRY = (
    "SpeedMax SpeedMin SpeedMean SpeedStd ThrottleMean ThrottleStd PctFullThrottle PctCoast PctBraking "
    "nBrakeZones nGearMode GearMean nGearShifts PctDRSOpen nDRSActivations RPMMax RPMMean RPMStd "
    "PctSlow PctFast AccelP99 DecelP01"
).split()

# column of prediction_factors -> model features of that group
GROUPS: dict[str, list[str]] = {
    "c_pace": ["LapTime_sec", "Sector1Time_sec", "Sector2Time_sec", "Sector3Time_sec"],
    "c_progress": ["RaceProgress"],
    "c_telemetry": SPEED_TRAPS + [f"Tel_{name}" for name in LAP_TELEMETRY],
    "c_tyres": ["TyreLife", "FreshTyre", "Compound_SOFT", "Compound_MEDIUM", "Compound_HARD"],
    "c_weather": ["AirTemp", "TrackTemp", "Humidity", "Pressure", "WindSpeed", "WindDir_sin", "WindDir_cos"],
    "c_traffic": ["GapAhead_cap", "GapBehind_cap", "DirtyAir", "ProxAhead", "ProxBehind", "VeryClose",
                  "InRange2", "AheadLapped", "AheadPace", "BehindPace"],
    "c_track": ["FieldDelta", "FieldN"],
}
# races used as typical values on the page
REFS = {"ref_gap_ahead": "GapAhead_cap", "ref_tyre_life": "TyreLife", "ref_track_temp": "TrackTemp"}


def shapley(model: LapTimeModel, x: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict[str, np.ndarray], np.ndarray]:
    """x: (n, window, features) raw windows. Returns window_mean, f(empty), {group: phi}, f(full)."""
    features = model.features
    dynamic = np.array([f in model.config["dynamic_features"] for f in features])
    names = list(GROUPS)
    columns = {g: [features.index(f) for f in GROUPS[g]] for g in names}
    covered = sorted(i for cols in columns.values() for i in cols)
    if covered != list(range(len(features))):
        raise SystemExit("feature groups must cover every model feature exactly once")

    typical = np.median(x[:, -1, :], axis=0)
    flat = x.copy()
    flat[:, :, dynamic] = x[:, :, dynamic].mean(axis=1, keepdims=True)
    flat[:, :, ~dynamic] = typical[~dynamic]

    n = len(names)
    subsets = list(itertools.product([0, 1], repeat=n))
    f = np.empty((len(subsets), len(x)), np.float64)
    base = None
    for i, s in enumerate(subsets):
        variant = flat.copy()
        for g, on in zip(names, s):
            if on:
                variant[:, :, columns[g]] = x[:, :, columns[g]]
        z, base_i = model.normalise(variant)
        if base is None:
            base = base_i
        f[i] = model.forward(z)
    index = {s: i for i, s in enumerate(subsets)}

    phi = {}
    for gi, g in enumerate(names):
        total = np.zeros(len(x))
        for s in subsets:
            if s[gi]:
                continue
            size = sum(s)
            weight = math.factorial(size) * math.factorial(n - size - 1) / math.factorial(n)
            s_with = tuple(1 if j == gi else v for j, v in enumerate(s))
            total += weight * (f[index[s_with]] - f[index[s]])
        phi[g] = total
    return base, f[index[tuple([0] * n)]], phi, f[index[tuple([1] * n)]]


def race_factors(model: LapTimeModel, db: Database, cfg: CleaningConfig, race: dict) -> pd.DataFrame:
    raw = db.race_frame(race)
    x, meta = make_windows(raw, model.features, model.window, cfg, include_open_targets=False)
    if len(x) == 0:
        return pd.DataFrame()
    base, shift, phi, full = shapley(model, x)
    out = pd.DataFrame({
        "race_id": race["race_id"],
        "driver_code": meta["Driver"].to_numpy(),
        "lap_number": meta["LapNumber"].astype(int).to_numpy(),
        "window_mean_sec": base,
        "baseline_shift": shift,
        **{g: phi[g] for g in GROUPS},
    })
    for column, feature in REFS.items():
        out[column] = float(np.median(x[:, -1, model.features.index(feature)]))
    out["predicted_lap_time_sec"] = base + full
    # What the model alone would say, for the cross-check against the stored predictions.
    direct = model.predict(x)
    out["check_predict"] = direct
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="upsert into prediction_factors")
    parser.add_argument("--out", default="factors_final.csv")
    parser.add_argument("--only", type=int, nargs="*", help="race_id(s) to compute, for a quick test")
    parser.add_argument("--from-csv", help="reuse a CSV saved by an earlier run instead of recomputing")
    args = parser.parse_args()
    load_env()

    if args.from_csv:
        allf = pd.read_csv(args.from_csv)
        parts = allf[list(GROUPS)].sum(axis=1)
        split_error = (allf.window_mean_sec + allf.baseline_shift + parts - allf.predicted_lap_time_sec).abs().max()
        print(f"read {len(allf):,} rows from {args.from_csv}; max split error {split_error:.2e} s")
        if split_error > 1e-4:
            raise SystemExit("checks failed, nothing written")
    else:
        model = LapTimeModel.load()
        db = Database()
        cfg = CleaningConfig(gap_cap=model.config["gap_cap"], dirty_air_gap=model.config["dirty_air_gap"])
        races = db.races()
        origins = race_origins(races)

        frames = []
        for race in races:
            if race["exclusion_reason"]:
                continue
            if args.only and race["race_id"] not in args.only:
                continue
            df = race_factors(model, db, cfg, race)
            if df.empty:
                continue
            df["origin"] = origins.get(race["race_id"])
            frames.append(df)
            parts = df[list(GROUPS)].abs().mean().round(3)
            print(f"{race['race_id']:>3} {race['year']} {race['circuit']:<20} n={len(df):>4} "
                  f"mean|c| pace={parts['c_pace']:.3f} traffic={parts['c_traffic']:.3f}", flush=True)
        allf = pd.concat(frames, ignore_index=True)

        # Checks: additive split, and the same number the model gives.
        parts = allf[list(GROUPS)].sum(axis=1)
        split_error = (allf.window_mean_sec + allf.baseline_shift + parts - allf.predicted_lap_time_sec).abs().max()
        model_error = (allf.predicted_lap_time_sec - allf.check_predict).abs().max()
        print(f"\nrows {len(allf):,}; max split error {split_error:.2e} s; max |split - model.predict| {model_error:.2e} s")
        if split_error > 1e-4 or model_error > 1e-4:
            raise SystemExit("checks failed, nothing written")
        print("mean |contribution| (s):", allf[list(GROUPS)].abs().mean().round(4).to_dict())
        allf.drop(columns=["check_predict"]).to_csv(args.out, index=False)
        print("saved", args.out)

    if not args.write:
        return
    # Same key as backfill_predictions.py; the telemetry upload script's name is accepted too.
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise SystemExit("set SUPABASE_SECRET_KEY (secret / service_role key) before using --write")
    rest = httpx.Client(base_url=f"{os.environ['SUPABASE_URL'].rstrip('/')}/rest/v1", timeout=120,
                        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    run = rest.get("/model_runs", params={"select": "id", "name": f"eq.{RUN_NAME}"}).raise_for_status().json()
    if not run:
        raise SystemExit(f"model_runs row '{RUN_NAME}' not found")
    run_id = run[0]["id"]
    columns = ["race_id", "driver_code", "lap_number", "window_mean_sec", "baseline_shift", *GROUPS, *REFS]
    records = allf.assign(model_run_id=run_id)[["model_run_id", *columns]]
    records = records.astype({"race_id": int, "lap_number": int}).to_dict("records")
    for i in range(0, len(records), 2000):
        rest.post("/prediction_factors", json=records[i:i + 2000],
                  headers={"Prefer": "resolution=merge-duplicates,return=minimal"}).raise_for_status()
        print(f"  {min(i + 2000, len(records)):,}/{len(records):,}", flush=True)
    print(f"upserted {len(records):,} rows for {RUN_NAME} (model_run_id={run_id})")


if __name__ == "__main__":
    main()
