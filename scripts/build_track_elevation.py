"""Build data/track-elevation.json: the real 3D racing line of each circuit (X, Y, Z in metres).

Source: the FastF1 cache of the dataset (position_data.ff1pkl of each race, X/Y/Z in 1/10 m),
no download needed. For every circuit the fastest accurate lap of the latest cached dry race is
cut out of the position stream, resampled to equal distance steps and lightly smoothed. The
reported elevation range is compared with `Circ_AltRange_m` of the lap table.

    "<venv with pandas+numpy+pyarrow>/python" scripts/build_track_elevation.py \
        --cache "E:/.../Data/f1_data/cache" --laps "E:/.../Fix Data/laps_2022_2025_v3.parquet"

Output (keyed like data/track-geometry.json): {"monza": {"year", "driver", "lap", "length_m",
"range_m", "x": [...], "y": [...], "z": [...]}} with N points from the start/finish line, z
relative to the lowest point. x/y are rotated into the frame of data/track-geometry.json (the
official F1 map orientation, SVG axes with y down), so the 3D circuit has the same orientation
as the flat maps of the dashboard.
"""

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

N = 240
ALIASES = {"spa-francorchamps": "spa"}


class _Stub(pd.DataFrame):
    """Stands in for fastf1.core.Telemetry so the cache can be read without FastF1."""

    @property
    def _constructor(self):
        return _Stub


class _Loader(pickle.Unpickler):
    def find_class(self, module, name):
        return _Stub if module.startswith("fastf1") else super().find_class(module, name)


def load(path: Path):
    with open(path, "rb") as f:
        obj = _Loader(f).load()
    return obj["data"] if isinstance(obj, dict) and "data" in obj else obj


def circular_smooth(values: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return values
    pad = window // 2
    wrapped = np.concatenate([values[-pad:], values, values[:pad]])
    return np.convolve(wrapped, np.ones(window) / window, mode="valid")[: len(values)]


def resample_loop(p: np.ndarray, n: int) -> np.ndarray:
    loop = np.vstack([p, p[:1]])
    cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(loop, axis=0), axis=1))]
    t = np.linspace(0, cum[-1], n, endpoint=False)
    return np.c_[np.interp(t, cum, loop[:, 0]), np.interp(t, cum, loop[:, 1])]


def align(xy: np.ndarray, reference: np.ndarray):
    """Rotation (and mirror, if the data demands it) that lays `xy` over `reference`.

    Both are closed outlines of the same circuit with n points. The best cyclic shift and
    direction are searched too, since the two lines may start a few metres apart. Returns the
    transformed outline, the angle in degrees and the mean distance (m) to the reference.
    """
    n = len(xy)
    ref = reference - reference.mean(axis=0)
    ref_scale = np.sqrt((ref ** 2).sum() / n)
    best = None
    # Direction and start point only help to find the matching; the line itself is never reversed.
    for flip in (False, True):
        a = xy[::-1] if flip else xy
        a = a - a.mean(axis=0)
        scale = ref_scale / np.sqrt((a ** 2).sum() / n)
        for shift in range(-12, 13):
            b = np.roll(a, shift, axis=0) * scale
            u, _, vt = np.linalg.svd(b.T @ ref)
            for mirror in (1, -1):
                d = np.diag([1, mirror * np.linalg.det(u @ vt)])
                r = u @ d @ vt
                err = np.linalg.norm(b @ r - ref, axis=1).mean() / scale
                if best is None or err < best[0]:
                    best = (err, flip, shift, r, scale, mirror)
    err, flip, shift, r, scale, mirror = best
    out = xy[::-1] if flip else xy
    return out, flip, shift, r, scale, mirror, err


def trace(positions: pd.DataFrame, start: float, end: float):
    t = positions["Time"].dt.total_seconds().to_numpy()
    keep = (t >= start) & (t <= end)
    x = positions["X"].to_numpy(float)[keep] / 10.0
    y = positions["Y"].to_numpy(float)[keep] / 10.0
    z = positions["Z"].to_numpy(float)[keep] / 10.0
    moving = ~((x == 0) & (y == 0))
    x, y, z = x[moving], y[moving], z[moving]
    if len(x) < 60:
        return None
    step = np.hypot(np.diff(x), np.diff(y))
    s = np.concatenate([[0.0], np.cumsum(step)])
    length = s[-1]
    grid = np.linspace(0, length, N, endpoint=False)
    xs, ys, zs = (np.interp(grid, s, v) for v in (x, y, z))
    # The lap starts and ends on the same spot: remove the drift between the two ends.
    zs = zs - (z[-1] - z[0]) * grid / length
    return circular_smooth(xs, 3), circular_smooth(ys, 3), circular_smooth(zs, 9), length


def main() -> None:
    geometry = json.loads((Path(__file__).resolve().parents[1] / "data/track-geometry.json").read_text())
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    parser.add_argument("--laps", required=True)
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data/track-elevation.json"))
    args = parser.parse_args()
    cache = Path(args.cache)

    laps = pd.read_parquet(
        args.laps,
        columns=["Year", "EventName", "EventDate", "CircuitShortName", "Driver", "DriverNumber",
                 "LapNumber", "LapTime_sec", "LapEndTime_sec", "IsAccurate", "Deleted",
                 "Rainfall", "Circ_AltRange_m", "TrackStatus"],
    )
    laps = laps[laps.IsAccurate & ~laps.Deleted & (laps.Rainfall == 0)
                & laps.TrackStatus.fillna("1").astype(str).eq("1")
                & laps.LapTime_sec.notna() & laps.LapEndTime_sec.notna()]

    result, report = {}, []
    for circuit, group in laps.groupby("CircuitShortName"):
        done = None
        for (year, event), race in sorted(group.groupby(["Year", "EventName"]), reverse=True):
            date = pd.Timestamp(race.EventDate.iloc[0]).strftime("%Y-%m-%d")
            folders = list((cache / str(year)).glob(f"{date}_*/*_Race"))
            if not folders or not (folders[0] / "position_data.ff1pkl").exists():
                continue
            best = race.sort_values("LapTime_sec").iloc[0]
            positions = load(folders[0] / "position_data.ff1pkl").get(str(best.DriverNumber))
            if positions is None:
                continue
            start = best.LapEndTime_sec - best.LapTime_sec
            built = trace(positions, start, best.LapEndTime_sec)
            if built is None:
                continue
            xs, ys, zs, length = built
            done = (year, best, xs, ys, zs, length, float(race.Circ_AltRange_m.iloc[0]))
            break
        if done is None:
            report.append((circuit, "NO DATA"))
            continue
        year, best, xs, ys, zs, length, ref_range = done
        key = circuit.lower()
        key = ALIASES.get(key, key)
        # Lay the racing line over the circuit outline of the flat maps (same orientation).
        outline = np.array(geometry[key]["p"], float)
        reference = resample_loop(outline, N)
        line = np.c_[xs, ys]
        _, flip, shift, r, scale, mirror, err = align(line, reference)
        # Only the rotation (and mirror) is taken from the matching; the racing line keeps its own
        # order, so index 0 is the timing line and the lap runs in the real direction.
        moved = (line - line.mean(axis=0)) @ r
        xs, ys = moved[:, 0], moved[:, 1]
        angle = float(np.degrees(np.arctan2(r[1, 0], r[0, 0])))
        cx, cy = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2
        rng = float(zs.max() - zs.min())
        result[key] = {
            "year": int(year), "driver": best.Driver, "lap": int(best.LapNumber),
            "length_m": round(float(length), 1), "range_m": round(rng, 1),
            "x": [round(float(v), 1) for v in xs - cx],
            "y": [round(float(v), 1) for v in ys - cy],
            "z": [round(float(v), 1) for v in zs - zs.min()],
        }
        report.append((circuit, f"{year} {best.Driver} L{int(best.LapNumber)}  length {length:7.0f} m  "
                                f"range {rng:5.1f} m  (table {ref_range:5.1f} m)  "
                                f"rot {angle:7.1f}  shift {shift:+d}  rev {int(flip)}  "
                                f"mirror {'yes' if mirror == -1 else 'no '}  fit {err:5.1f} m mean gap"))

    Path(args.out).write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    for circuit, line in report:
        print(f"{circuit:22s} {line}")
    print(f"{len(result)} circuits -> {args.out}")


if __name__ == "__main__":
    main()
