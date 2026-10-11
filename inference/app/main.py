"""Next Lap inference API (FastAPI) — serves the notebook's final LSTM on Railway."""

from __future__ import annotations

import math
import os
from contextlib import asynccontextmanager
from typing import Annotated

import numpy as np
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.db import Database
from app.model import LapTimeModel
from app.service import Predictor, metrics

state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    model = LapTimeModel.load()
    state["model"] = model
    state["predictor"] = Predictor(model, Database())
    yield


app = FastAPI(title="Next Lap inference API", version="1.0.0", lifespan=lifespan,
              description="Next-lap (t+1) lap-time forecasts from the final LSTM of the skripsi notebook (v7).")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["*"])

RaceId = Annotated[int, Path(ge=1)]


def _predictor() -> Predictor:
    return state["predictor"]


def _race_or_404(race_id: int) -> dict:
    race = _predictor().race(race_id)
    if race is None:
        raise HTTPException(404, f"race {race_id} not found")
    if race["exclusion_reason"]:
        raise HTTPException(422, f"race {race_id} is outside the model's scope ({race['exclusion_reason']})")
    return race


def _records(df):
    return [{k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in row.items()}
            for row in df.to_dict("records")]


@app.get("/health")
def health():
    return {"status": "ok", "model": state["model"].config["model"], "window": state["model"].window}


@app.get("/v1/model")
def model_card():
    cfg = state["model"].config
    races = _predictor().races()
    return {
        "model": cfg["model"], "feature_set": cfg["feature_set"], "window": cfg["window"],
        "hyperparams": cfg["params"], "n_features": len(cfg["features"]), "features": cfg["features"],
        "target": cfg["target"],
        "validation_races": [r["race_id"] for r in races if r.get("origin") == "validation"],
        "note": "Predictions on 'in_sample' races come from laps the final model was trained on; "
                "use the out-of-fold runs in the database for generalisation claims.",
    }


@app.get("/v1/races")
def list_races():
    return [{k: r[k] for k in ("race_id", "year", "event_name", "event_date", "circuit", "total_laps",
                               "exclusion_reason", "origin")} for r in _predictor().races()]


@app.get("/v1/races/{race_id}/predictions")
def race_predictions(race_id: RaceId,
                     driver: Annotated[str | None, Query(pattern="^[A-Z]{3}$")] = None,
                     include_open: Annotated[bool, Query(description="Also forecast the lap after the last clean "
                                                                     "window of each stint segment")] = False):
    race = _race_or_404(race_id)
    df = _predictor().predict_race(race, include_open)
    if driver:
        df = df[df.driver_code == driver]
    return {"race_id": race_id, "origin": race["origin"], "model": state["model"].config["model"],
            "metrics": metrics(df), "predictions": _records(df)}


@app.get("/v1/races/{race_id}/drivers/{driver}/laps/{lap}")
def lap_forecast(race_id: RaceId, driver: Annotated[str, Path(pattern="^[A-Z]{3}$")], lap: Annotated[int, Path(ge=1)]):
    race = _race_or_404(race_id)
    df = _predictor().predict_race(race, include_open=True)
    row = df[(df.driver_code == driver) & (df.lap_number == lap)]
    if row.empty:
        raise HTTPException(422, f"no forecast for {driver} lap {lap}: the {state['model'].window} laps before it "
                                 "are not all clean consecutive laps of one stint")
    return {"race_id": race_id, "origin": race["origin"], **_records(row)[0]}


class WindowRequest(BaseModel):
    windows: list[list[list[float]]] = Field(description="Raw (unscaled) feature windows: n × window × features, "
                                                         "features ordered as in GET /v1/model")


@app.post("/v1/predict")
def predict_windows(body: WindowRequest):
    model = state["model"]
    x = np.asarray(body.windows, dtype=np.float64)
    if x.ndim != 3 or x.shape[1:] != (model.window, len(model.features)) or len(x) > 5000:
        raise HTTPException(422, f"expected shape (n ≤ 5000, {model.window}, {len(model.features)}), got {x.shape}")
    if not np.isfinite(x).all():
        raise HTTPException(422, "windows contain NaN or infinite values")
    return {"predicted_lap_time_sec": model.predict(x).tolist()}
