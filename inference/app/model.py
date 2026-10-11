"""Final LSTM of the notebook, run with NumPy.

The weights come from `model_final.keras` and the scaler from `scaler_final.joblib`
(exported by `scripts/export_model.py`). Running the forward pass in NumPy keeps the
Railway image small (no TensorFlow) and gives the same output as Keras up to float32
rounding; `tests/test_model.py` checks this against Keras when TensorFlow is installed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "model"


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


@dataclass
class LapTimeModel:
    config: dict
    weights: dict[str, np.ndarray]
    scale: np.ndarray
    offset: np.ndarray

    @classmethod
    def load(cls, directory: Path = ARTIFACT_DIR) -> "LapTimeModel":
        config = json.loads((directory / "config_final.json").read_text())
        scaler = json.loads((directory / "scaler.json").read_text())
        with np.load(directory / "weights.npz") as npz:
            weights = {k: npz[k].astype(np.float32) for k in npz.files}
        model = cls(config, weights, np.asarray(scaler["scale"], np.float64), np.asarray(scaler["min"], np.float64))
        if scaler["features"] != config["features"]:
            raise ValueError("Scaler and config list different features")
        return model

    @property
    def features(self) -> list[str]:
        return self.config["features"]

    @property
    def window(self) -> int:
        return int(self.config["window"])

    def normalise(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Notebook `window_view` + `prepare`: window-relative dynamics, then MinMax with clipping."""
        z = np.array(x[:, -self.window:, :], dtype=np.float64, copy=True)
        lap_idx = self.features.index("LapTime_sec")
        dynamic = np.array([f in self.config["dynamic_features"] for f in self.features])
        base = z[:, :, lap_idx].mean(axis=1)
        z[:, :, dynamic] -= z[:, :, dynamic].mean(axis=1, keepdims=True)
        z = np.clip(z * self.scale + self.offset, 0.0, 1.0)
        return z.astype(np.float32), base

    def forward(self, z: np.ndarray) -> np.ndarray:
        """LSTM (Keras gate order i, f, c, o) → Dropout (inactive) → Dense(relu) → Dense(1)."""
        w = self.weights
        units = w["lstm_recurrent"].shape[0]
        h = np.zeros((len(z), units), np.float32)
        c = np.zeros((len(z), units), np.float32)
        for t in range(z.shape[1]):
            gates = z[:, t, :] @ w["lstm_kernel"] + h @ w["lstm_recurrent"] + w["lstm_bias"]
            i, f, g, o = np.split(gates, 4, axis=1)
            c = _sigmoid(f) * c + _sigmoid(i) * np.tanh(g)
            h = _sigmoid(o) * np.tanh(c)
        out = h
        if "dense_kernel" in w:
            out = np.maximum(out @ w["dense_kernel"] + w["dense_bias"], 0.0)
        return (out @ w["out_kernel"] + w["out_bias"]).ravel()

    def predict(self, x: np.ndarray) -> np.ndarray:
        """Raw windows (n, window, features) → predicted lap time of the next lap (seconds)."""
        if len(x) == 0:
            return np.zeros(0)
        z, base = self.normalise(x)
        return self.forward(z).astype(np.float64) + base
