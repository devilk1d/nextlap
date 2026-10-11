"""Convert the notebook's final model into the files the API loads.

    python scripts/export_model.py path/to/experiment_results_v7

Reads model_final.keras, scaler_final.joblib and config_final.json and writes
model/weights.npz, model/scaler.json and model/config_final.json. Only h5py, joblib and
scikit-learn are needed (no TensorFlow).
"""

import io
import json
import sys
import zipfile
from pathlib import Path

import h5py
import joblib
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "model"


def main(src: Path) -> None:
    OUT.mkdir(exist_ok=True)
    config = json.loads((src / "config_final.json").read_text())
    if config["model"] != "LSTM":
        raise SystemExit(f"Only the LSTM forward pass is implemented, got {config['model']}")

    with zipfile.ZipFile(src / "model_final.keras") as zf:
        h5 = h5py.File(io.BytesIO(zf.read("model.weights.h5")), "r")
        layers = h5["layers"]
        weights = {
            "lstm_kernel": layers["lstm/cell/vars/0"][()],
            "lstm_recurrent": layers["lstm/cell/vars/1"][()],
            "lstm_bias": layers["lstm/cell/vars/2"][()],
        }
        dense = sorted(k for k in layers if k.startswith("dense"))
        if len(dense) == 2:
            weights |= {"dense_kernel": layers[f"{dense[0]}/vars/0"][()], "dense_bias": layers[f"{dense[0]}/vars/1"][()]}
        last = dense[-1]
        weights |= {"out_kernel": layers[f"{last}/vars/0"][()], "out_bias": layers[f"{last}/vars/1"][()]}
    np.savez(OUT / "weights.npz", **weights)

    scaler = joblib.load(src / "scaler_final.joblib")
    lo, hi = scaler.feature_range
    if (lo, hi) != (0, 1) or not scaler.clip:
        raise SystemExit("Expected MinMaxScaler(feature_range=(0, 1), clip=True)")
    (OUT / "scaler.json").write_text(json.dumps(
        {"features": config["features"], "scale": scaler.scale_.tolist(), "min": scaler.min_.tolist()}))
    (OUT / "config_final.json").write_text(json.dumps(config, indent=2))
    print("Exported:", ", ".join(f"{k} {v.shape}" for k, v in weights.items()))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
