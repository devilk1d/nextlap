"""Race-level inference: database rows → windows → predictions, with the origin of each race."""

from __future__ import annotations

import threading
from collections import OrderedDict

import numpy as np
import pandas as pd

from app.db import Database
from app.model import LapTimeModel
from app.pipeline import CleaningConfig, make_windows

VAL_FRAC = 0.2  # notebook CFG["val_frac"]: the final model never trained on the last 20% of races


def race_origins(races: list[dict]) -> dict[int, str]:
    """Notebook `holdout_last`: the final model was fitted on the earlier races ('in_sample') and
    early-stopped/tuned on the last 20% of the calendar ('validation')."""
    dry = sorted((r for r in races if r["exclusion_reason"] is None), key=lambda r: r["event_date"])
    n_val = max(1, round(len(dry) * VAL_FRAC))
    return {r["race_id"]: ("validation" if i >= len(dry) - n_val else "in_sample") for i, r in enumerate(dry)}


class Predictor:
    def __init__(self, model: LapTimeModel, db: Database, cache_size: int = 24):
        self.model = model
        self.db = db
        self.cfg = CleaningConfig(gap_cap=model.config["gap_cap"], dirty_air_gap=model.config["dirty_air_gap"])
        self._cache: OrderedDict[tuple, pd.DataFrame] = OrderedDict()
        self._lock = threading.Lock()
        self._cache_size = cache_size
        self._races: list[dict] | None = None

    def races(self) -> list[dict]:
        if self._races is None:
            races = self.db.races()
            origins = race_origins(races)
            for r in races:
                r["origin"] = origins.get(r["race_id"])
            self._races = races
        return self._races

    def race(self, race_id: int) -> dict | None:
        return next((r for r in self.races() if r["race_id"] == race_id), None)

    def predict_race(self, race: dict, include_open: bool) -> pd.DataFrame:
        key = (race["race_id"], include_open)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
        raw = self.db.race_frame(race)
        x, meta = make_windows(raw, self.model.features, self.model.window, self.cfg, include_open)
        out = pd.DataFrame({
            "driver_code": meta.get("Driver", pd.Series(dtype=str)),
            "lap_number": meta.get("LapNumber", pd.Series(dtype=int)).astype(int),
            "input_laps": [list(range(int(l) - self.model.window + 1, int(l) + 1)) for l in meta.get("InputLastLap", [])],
            "predicted_lap_time_sec": self.model.predict(x),
            "actual_lap_time_sec": meta.get("y_true", pd.Series(dtype=float)),
            "window_mean_sec": x[:, :, self.model.features.index("LapTime_sec")].mean(axis=1) if len(x) else [],
            "mean3_sec": x[:, -3:, self.model.features.index("LapTime_sec")].mean(axis=1) if len(x) else [],
            "target_is_clean_lap": meta.get("clean_target", pd.Series(dtype=bool)),
        })
        with self._lock:
            self._cache[key] = out
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return out


def metrics(df: pd.DataFrame) -> dict | None:
    scored = df[df.target_is_clean_lap & df.actual_lap_time_sec.notna()]
    if scored.empty:
        return None
    err = scored.actual_lap_time_sec - scored.predicted_lap_time_sec
    err3 = scored.actual_lap_time_sec - scored.mean3_sec
    rmse, rmse3 = float(np.sqrt(np.mean(err ** 2))), float(np.sqrt(np.mean(err3 ** 2)))
    return {"n": int(len(scored)), "rmse": rmse, "mae": float(np.mean(np.abs(err))),
            "mape": float(np.mean(np.abs(err) / scored.actual_lap_time_sec) * 100),
            "rmse_mean3": rmse3, "skill_vs_mean3_pct": (1 - rmse / rmse3) * 100 if rmse3 else None}
