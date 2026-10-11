"""Compute the final model's predictions for every dry race and (optionally) store them.

    # 1) dry run: compute, print metrics, save predictions_final.csv
    python -m scripts.backfill_predictions

    # 2) write to lap_predictions for model_run 'final:LSTM:E' (needs the secret/service-role key)
    SUPABASE_SECRET_KEY=... python -m scripts.backfill_predictions --write

Expected check: on the validation races (all drivers) the RMSE should match the notebook's
"RMSE without permutation" in section 14.3 (0.4505 s) up to rounding of the stored values.
Run from the `inference/` folder with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY set.
"""

from __future__ import annotations

import argparse
import os

import httpx
import pandas as pd

from app.db import Database, load_env
from app.model import LapTimeModel
from app.service import Predictor, metrics

# model_runs name → column of the computed frame that holds its prediction.
# The Mean-3 baseline gets the same origin labels as the LSTM rows, because the website matches
# baseline and model per origin when it computes "RMSE vs Mean-3".
RUNS = {"final:LSTM:E": "predicted_lap_time_sec", "final:Mean-3": "mean3_sec"}


def prediction_rows(frame: pd.DataFrame, run_id: int, column: str) -> list[dict]:
    rows = frame.assign(model_run_id=run_id, predicted_lap_time_sec=frame[column])[
        ["model_run_id", "race_id", "driver_code", "lap_number", "predicted_lap_time_sec", "origin"]]
    return rows.to_dict("records")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="upsert into lap_predictions")
    parser.add_argument("--out", default="predictions_final.csv")
    args = parser.parse_args()
    load_env()

    predictor = Predictor(LapTimeModel.load(), Database(), cache_size=1)
    frames = []
    for race in predictor.races():
        if race["exclusion_reason"]:
            continue
        df = predictor.predict_race(race, include_open=False).assign(race_id=race["race_id"], origin=race["origin"])
        frames.append(df)
        m = metrics(df)
        print(f"{race['race_id']:>3} {race['year']} {race['circuit']:<20} {race['origin']:<10} "
              f"n={m['n'] if m else 0:>4} rmse={m['rmse'] if m else float('nan'):.3f}")
    allp = pd.concat(frames, ignore_index=True)
    for origin, g in allp.groupby("origin"):
        m = metrics(g)
        print(f"{origin:<10} n={m['n']:,} RMSE={m['rmse']:.4f} MAE={m['mae']:.4f} Mean-3 RMSE={m['rmse_mean3']:.4f}")
    allp.drop(columns=["input_laps"]).to_csv(args.out, index=False)
    print("saved", args.out)

    if not args.write:
        return
    key = os.environ["SUPABASE_SECRET_KEY"]
    rest = httpx.Client(base_url=f"{os.environ['SUPABASE_URL'].rstrip('/')}/rest/v1", timeout=60,
                        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    for run_name, column in RUNS.items():
        run = rest.get("/model_runs", params={"select": "id", "name": f"eq.{run_name}"}).raise_for_status().json()
        if not run:
            raise SystemExit(f"model_runs row '{run_name}' not found")
        records = prediction_rows(allp, run[0]["id"], column)
        for i in range(0, len(records), 2000):
            rest.post("/lap_predictions", json=records[i:i + 2000],
                      headers={"Prefer": "resolution=merge-duplicates,return=minimal"}).raise_for_status()
        print(f"upserted {len(records):,} rows for {run_name} (model_run_id={run[0]['id']})")


if __name__ == "__main__":
    main()
