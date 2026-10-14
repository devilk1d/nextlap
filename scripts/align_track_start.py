"""Put the start/finish line of every outline in data/track-geometry.json where the cars really cross it.

    "<venv with numpy>/python" scripts/align_track_start.py            # report only
    "<venv with numpy>/python" scripts/align_track_start.py --write    # rewrite track-geometry.json

The real racing line of data/track-elevation.json (scripts/build_track_elevation.py) starts at the
timing line and is already laid over the outline of the flat maps. For every circuit the outline is
rolled so that its first point is the point closest to the start of that racing line; the
coordinates themselves are not changed, only which point comes first. This matters because the
replay places cars by the share of the lap they have covered, measured from point 0.

Also reports the direction check: the outline must run the same way as the real lap.
"""

import argparse
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FINE = 960
# Rolls under this many points of 320 (about 0.3 % of a lap) are measurement noise: left alone.
MIN_ROLL = 2


def resample(p: np.ndarray, n: int) -> np.ndarray:
    loop = np.vstack([p, p[:1]])
    cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(loop, axis=0), axis=1))]
    t = np.linspace(0, cum[-1], n, endpoint=False)
    return np.c_[np.interp(t, cum, loop[:, 0]), np.interp(t, cum, loop[:, 1])]


def normalised(p: np.ndarray) -> np.ndarray:
    q = p - p.mean(axis=0)
    return q / np.sqrt((q ** 2).sum() / len(q))


def best_shift(trace: np.ndarray, outline: np.ndarray, reverse: bool) -> tuple[int, float]:
    """Cyclic shift s of `outline` (in FINE points) for which trace[i] ≈ outline[i + s]."""
    a = trace[::-1] if reverse else trace
    errors = [np.linalg.norm(a - np.roll(outline, -s, axis=0), axis=1).mean() for s in range(FINE)]
    s = int(np.argmin(errors))
    return s, float(errors[s])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    path = ROOT / "data/track-geometry.json"
    geometry = json.loads(path.read_text())
    elevation = json.loads((ROOT / "data/track-elevation.json").read_text())

    changed = 0
    for key, trace in sorted(elevation.items()):
        outline = np.array(geometry[key]["p"], float)
        n_points = len(outline)
        a = normalised(resample(np.c_[trace["x"], trace["y"]], FINE))
        b = normalised(resample(outline, FINE))
        forward, err_f = best_shift(a, b, reverse=False)
        _, err_r = best_shift(a, b, reverse=True)
        # Signed number of 320-points the outline starts after the real timing line.
        offset = forward if forward <= FINE // 2 else forward - FINE
        roll = round(offset * n_points / FINE)
        verdict = "direction OK" if err_f <= err_r else "DIRECTION REVERSED"
        action = ""
        if abs(roll) >= MIN_ROLL:
            action = f"roll {roll:+d} points ({roll / n_points * 100:+.1f} % of the lap)"
            if args.write:
                geometry[key]["p"] = np.roll(outline, -roll, axis=0).round(2).tolist()
                changed += 1
        print(f"{key:20s} {verdict:20s} fit {err_f:.3f} (reversed {err_r:.3f})  start off by "
              f"{offset / FINE * 100:+5.1f} % of the lap  {action}")

    if args.write:
        path.write_text(json.dumps(geometry, separators=(",", ":")))
        print(f"rewrote {path} ({changed} outlines rolled)")


if __name__ == "__main__":
    main()
