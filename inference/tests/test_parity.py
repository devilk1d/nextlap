"""The API pipeline must give the notebook's inputs, targets and predictions exactly."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.db import to_notebook_frame
from app.model import LapTimeModel
from app.pipeline import CleaningConfig, make_windows
from tests import notebook_reference
from tests.synthetic import make_race

MODEL = LapTimeModel.load()


def races():
    return [make_race(1, seed=1), make_race(2, seed=2, total_laps=52), make_race(3, seed=3, wet=True)]


def test_matches_notebook_on_all_races_at_once_and_race_by_race():
    frames = [to_notebook_frame(*r) for r in races()]
    x_ref, y_ref, meta_ref = notebook_reference.run(pd.concat(frames, ignore_index=True), MODEL.features)

    parts = [make_windows(f, MODEL.features, MODEL.window, CleaningConfig()) for f in frames]
    x = np.concatenate([p[0] for p in parts if len(p[0])])
    meta = pd.concat([p[1] for p in parts], ignore_index=True)

    key = ["race", "Driver", "LapNumber"]
    ref = meta_ref[key].assign(i=np.arange(len(meta_ref)))
    ours = meta[key].assign(j=np.arange(len(meta)))
    joined = ref.merge(ours, on=key, how="outer", indicator=True)
    assert (joined._merge == "both").all(), joined[joined._merge != "both"]
    assert len(joined) > 500
    assert "3" not in set(meta.race), "wet race must be excluded"

    np.testing.assert_array_equal(x[joined.j], x_ref[joined.i])
    np.testing.assert_array_equal(meta.y_true.to_numpy()[joined.j], y_ref[joined.i])
    np.testing.assert_allclose(MODEL.predict(x[joined.j]), MODEL.predict(x_ref[joined.i]), atol=1e-9)


def test_open_targets_only_add_last_window_of_each_segment():
    frame = to_notebook_frame(*races()[0])
    x, meta = make_windows(frame, MODEL.features, MODEL.window, CleaningConfig())
    x_all, meta_all = make_windows(frame, MODEL.features, MODEL.window, CleaningConfig(), include_open_targets=True)
    assert len(meta_all) > len(meta)
    assert meta_all.clean_target.sum() == len(meta)
    assert meta_all.loc[~meta_all.clean_target, "y_true"].isna().all()
    assert (meta_all.LapNumber == meta_all.InputLastLap + 1).all()


def test_predictions_are_close_to_window_mean():
    frame = to_notebook_frame(*races()[1])
    x, meta = make_windows(frame, MODEL.features, MODEL.window, CleaningConfig())
    pred = MODEL.predict(x)
    base = x[:, :, MODEL.features.index("LapTime_sec")].mean(axis=1)
    assert np.isfinite(pred).all()
    assert np.abs(pred - base).max() < 5


def test_numpy_forward_matches_keras():
    keras = pytest.importorskip("keras", reason="TensorFlow not installed")
    import joblib
    src = Path(__file__).resolve().parents[2] / "experiment_results_v7"
    if not (src / "model_final.keras").exists():
        pytest.skip("place experiment_results_v7/ next to inference/ to run this check")
    km = keras.models.load_model(src / "model_final.keras")
    sc = joblib.load(src / "scaler_final.joblib")
    x, _ = make_windows(to_notebook_frame(*races()[0]), MODEL.features, MODEL.window, CleaningConfig())
    z, base = MODEL.normalise(x)
    np.testing.assert_allclose(z, sc.transform(_window_view(x).reshape(-1, len(MODEL.features))).reshape(z.shape), atol=1e-6)
    np.testing.assert_allclose(MODEL.forward(z), km.predict(z, verbose=0).ravel(), atol=1e-5)


def _window_view(x):
    z = x.copy()
    dyn = np.array([f in MODEL.config["dynamic_features"] for f in MODEL.features])
    z[:, :, dyn] -= z[:, :, dyn].mean(axis=1, keepdims=True)
    return z
