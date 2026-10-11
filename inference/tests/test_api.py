"""API smoke test with the database replaced by synthetic races."""

import pytest
from fastapi.testclient import TestClient

from app import main
from app.db import to_notebook_frame
from app.model import LapTimeModel
from app.service import Predictor, race_origins
from tests.synthetic import make_race

RACES = {1: make_race(1, 1), 2: make_race(2, 2), 3: make_race(3, 3, wet=True)}


class FakeDb:
    def races(self):
        return [{"race_id": i, "year": 2025, "event_name": f"GP {i}", "event_date": r[0]["event_date"],
                 "total_laps": r[0]["total_laps"], "exclusion_reason": "wet" if i == 3 else None, "circuit": "Test"}
                for i, r in RACES.items()]

    def race_frame(self, race):
        return to_notebook_frame(*RACES[race["race_id"]])


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(main, "Database", FakeDb)
    with TestClient(main.app) as c:
        yield c


def test_endpoints(client):
    assert client.get("/health").json()["model"] == "LSTM"
    assert client.get("/v1/model").json()["n_features"] == 55
    races = client.get("/v1/races").json()
    assert {r["origin"] for r in races} == {"in_sample", "validation", None}

    body = client.get("/v1/races/1/predictions").json()
    assert body["metrics"]["n"] == len(body["predictions"]) > 0
    first = body["predictions"][0]
    assert first["lap_number"] == first["input_laps"][-1] + 1

    one = client.get(f"/v1/races/1/drivers/{first['driver_code']}/laps/{first['lap_number']}").json()
    assert one["predicted_lap_time_sec"] == pytest.approx(first["predicted_lap_time_sec"])
    assert client.get(f"/v1/races/1/drivers/{first['driver_code']}/laps/2").status_code == 422
    assert client.get("/v1/races/3/predictions").status_code == 422
    assert client.get("/v1/races/99/predictions").status_code == 404


def test_predict_windows(client):
    model = LapTimeModel.load()
    pred = Predictor(model, FakeDb()).predict_race(FakeDb().races()[0], include_open=False)
    assert len(pred)
    bad = client.post("/v1/predict", json={"windows": [[[0.0] * 3]]})
    assert bad.status_code == 422


def test_origin_split_is_last_fifth_by_date():
    races = [{"race_id": i, "event_date": f"2025-01-{i:02d}", "exclusion_reason": None} for i in range(1, 11)]
    origins = race_origins(races)
    assert [origins[i] for i in range(1, 11)].count("validation") == 2
    assert origins[10] == origins[9] == "validation"
