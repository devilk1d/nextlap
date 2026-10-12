"""Turn raw per-race telemetry Parquet files into small per-driver JSON files for the replay.

    scripts/telemetry/.venv/Scripts/python.exe scripts/telemetry/build_telemetry.py \
        --source "E:/.../f1_data/raw_telemetry" --only 2024_Italian_Grand_Prix [--out public/telemetry]

Input  (one file per race): Driver, LapNumber, LapElapsed_sec (seconds since the lap started),
       Speed, RPM, nGear, Throttle, Brake, DRS, ... at roughly 4 samples per second.
Output (public/telemetry/<year>_<event-slug>/<DRIVER>.json), one object per driver:

    {"v": 1, "year": 2024, "event": "Italian Grand Prix", "driver": "PIA", "step": 0.5,
     "laps": {"1": {"s": [km/h...], "r": [rpm...], "t": [throttle %...],
                    "b": "0010..." (brake), "g": "1223..." (gear), "d": "0001..." (DRS open)}}}

Every lap is resampled to one value per `step` seconds starting at the lap start, so the value at
`elapsed` seconds into a lap is index `round(elapsed / step)`. Continuous channels are linearly
interpolated; gear, brake and DRS keep the last recorded value.
"""

import argparse
import json
import re
import unicodedata
from bisect import bisect_right
from pathlib import Path

import pyarrow.parquet as pq

STEP = 0.5
COLUMNS = ["Driver", "LapNumber", "LapElapsed_sec", "Speed", "RPM", "nGear", "Throttle", "Brake", "DRS",
           "Year", "EventName"]
# FastF1 DRS codes: 0-1 off, 2-3 detected, 8 eligible, 10/12/14 open.
DRS_OPEN = 10


def slug(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def lerp(times: list[float], values: list[float], at: float) -> float:
    i = bisect_right(times, at)
    if i == 0:
        return values[0]
    if i >= len(times):
        return values[-1]
    t0, t1 = times[i - 1], times[i]
    if t1 <= t0:
        return values[i - 1]
    return values[i - 1] + (values[i] - values[i - 1]) * (at - t0) / (t1 - t0)


def hold(times: list[float], values: list[int], at: float) -> int:
    i = bisect_right(times, at)
    return values[max(0, i - 1)]


def resample_lap(rows: list[tuple]) -> dict:
    """rows: (elapsed, speed, rpm, gear, throttle, brake, drs) sorted by elapsed."""
    t = [r[0] for r in rows]
    n = int(t[-1] / STEP) + 1
    grid = [k * STEP for k in range(n)]
    speed = [round(lerp(t, [r[1] for r in rows], g)) for g in grid]
    rpm = [round(lerp(t, [r[2] for r in rows], g)) for g in grid]
    throttle = [min(100, max(0, round(lerp(t, [r[4] for r in rows], g)))) for g in grid]
    gear = [min(9, max(0, hold(t, [r[3] for r in rows], g))) for g in grid]
    brake = [1 if hold(t, [int(r[5]) for r in rows], g) else 0 for g in grid]
    drs = [1 if hold(t, [r[6] for r in rows], g) >= DRS_OPEN else 0 for g in grid]
    return {
        "s": speed,
        "r": rpm,
        "t": throttle,
        "b": "".join(map(str, brake)),
        "g": "".join(map(str, gear)),
        "d": "".join(map(str, drs)),
    }


def build_race(path: Path, out_root: Path) -> tuple[Path, int, int]:
    table = pq.read_table(path, columns=COLUMNS).sort_by(
        [("Driver", "ascending"), ("LapNumber", "ascending"), ("LapElapsed_sec", "ascending")]
    )
    data = table.to_pydict()
    year, event = data["Year"][0], data["EventName"][0]
    folder = out_root / f"{year}_{slug(event)}"
    folder.mkdir(parents=True, exist_ok=True)

    per_driver: dict[str, dict[int, list[tuple]]] = {}
    for i in range(table.num_rows):
        speed, rpm, throttle = data["Speed"][i], data["RPM"][i], data["Throttle"][i]
        lap, elapsed = data["LapNumber"][i], data["LapElapsed_sec"][i]
        if None in (speed, rpm, throttle, lap, elapsed):
            continue
        per_driver.setdefault(data["Driver"][i], {}).setdefault(int(lap), []).append(
            (float(elapsed), speed, rpm, data["nGear"][i], throttle, data["Brake"][i], data["DRS"][i])
        )

    total_bytes = laps_written = 0
    for driver, laps in per_driver.items():
        payload = {
            "v": 1, "year": year, "event": event, "driver": driver, "step": STEP,
            "laps": {str(lap): resample_lap(rows) for lap, rows in sorted(laps.items()) if len(rows) >= 20},
        }
        text = json.dumps(payload, separators=(",", ":"))
        (folder / f"{driver}.json").write_text(text, encoding="utf-8")
        total_bytes += len(text.encode("utf-8"))
        laps_written += len(payload["laps"])
    return folder, total_bytes, laps_written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", required=True, help="folder with <year>_<Event>_telemetry.parquet files")
    parser.add_argument("--out", default="public/telemetry", help="output folder")
    parser.add_argument("--only", help="race file stem, e.g. 2024_Italian_Grand_Prix (default: all)")
    args = parser.parse_args()

    source, out = Path(args.source), Path(args.out)
    files = sorted(source.glob("*_telemetry.parquet"))
    if args.only:
        files = [f for f in files if f.name.startswith(args.only)]
    if not files:
        raise SystemExit("no matching Parquet files")
    for path in files:
        folder, size, laps = build_race(path, out)
        print(f"{path.stem:<48} -> {folder}  {laps:>5} laps  {size / 1e6:5.1f} MB", flush=True)


if __name__ == "__main__":
    main()
