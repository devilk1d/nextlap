"""Derive each circuit's pit-lane extent from the recorded pit stops and write data/pit-lanes.json.

    python scripts/build_pit_lanes.py

Needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (read from .env.local, or the environment).

For every pit stop the laps table holds three timestamps: the car crossing the pit entry line
(`pit_in_time_sec`), the timing line inside the pit lane (end of the in-lap) and the pit exit line
(`pit_out_time_sec`). From the stops of one circuit this script estimates:

  driveS   time to drive the pit lane without stopping: 10th percentile of entry→exit minus 2 s
           (the shortest stationary time of a stop), so the quickest stops set the baseline
  share    where the timing line sits in the lane: median(entry→line) / (median(entry→line) +
           median(line→exit))
  entry    lane length before the start/finish line, as a share of the lap
  exit     lane length after the start/finish line, as a share of the lap

Lane length = drive time × pit speed limit (80 km/h; 60 km/h at Monaco and Melbourne) divided by
the lap length from the circuits table. These are estimates for a schematic: they place the
lane on the outline and time the car through it, they are not surveyed lane geometry.
Stops under Safety Car, VSC or red flag are left out.
"""

import json
import os
import statistics
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "pit-lanes.json"
MIN_STOP_S = 2.0
MIN_DRIVE_S = 8.0
MAX_WINDOW_S = 60.0  # longer than this is a red flag, a penalty serve or a garage stop
SLOW_PIT_LANES = {"monte carlo", "melbourne"}  # 60 km/h; everywhere else 80 km/h
ALIASES = {"spa-francorchamps": "spa"}  # circuits.short_name → key in track-geometry.json


def env(name: str) -> str:
    if name in os.environ:
        return os.environ[name]
    for line in (ROOT / ".env.local").read_text(encoding="utf-8-sig").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit(f"{name} is not set")


BASE = env("SUPABASE_URL").rstrip("/") + "/rest/v1"
HEADERS = {"apikey": env("SUPABASE_PUBLISHABLE_KEY"), "Authorization": f"Bearer {env('SUPABASE_PUBLISHABLE_KEY')}"}


def get(table: str, **params) -> list[dict]:
    rows, offset = [], 0
    while True:
        query = urllib.parse.urlencode({**params, "limit": 1000, "offset": offset})
        with urllib.request.urlopen(urllib.request.Request(f"{BASE}/{table}?{query}", headers=HEADERS)) as r:
            batch = json.load(r)
        rows += batch
        if len(batch) < 1000:
            return rows
        offset += 1000


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def main() -> None:
    circuits = {c["circuit_key"]: c for c in get("circuits", select="circuit_key,short_name,length_km")}
    races = get("races", select="race_id,circuit_key")
    stops: dict[int, list[tuple[float, float]]] = {}
    for race in races:
        laps = get(
            "laps",
            select="driver_code,lap_number,is_in_lap,is_out_lap,pit_in_time_sec,pit_out_time_sec,"
            "lap_start_time_sec,lap_end_time_sec,is_safety_car,is_vsc,is_red_flag",
            race_id=f"eq.{race['race_id']}",
            order="driver_code,lap_number",
        )
        by_key = {(l["driver_code"], l["lap_number"]): l for l in laps}
        for lap in laps:
            out = by_key.get((lap["driver_code"], lap["lap_number"] + 1))
            if not (lap["is_in_lap"] and out and out["is_out_lap"]):
                continue
            t_in, t_line, t_out = lap["pit_in_time_sec"], lap["lap_end_time_sec"], out["pit_out_time_sec"]
            if None in (t_in, t_line, t_out):
                continue
            neutral = any(l[k] for l in (lap, out) for k in ("is_safety_car", "is_vsc", "is_red_flag"))
            pre, post = t_line - t_in, t_out - t_line
            if neutral or pre < 0 or post < 0 or pre + post > MAX_WINDOW_S:
                continue
            stops.setdefault(race["circuit_key"], []).append((pre, post))

    result: dict[str, dict] = {}
    for circuit_key, pairs in sorted(stops.items(), key=lambda kv: circuits[kv[0]]["short_name"]):
        circuit = circuits[circuit_key]
        name = circuit["short_name"].lower()
        key = ALIASES.get(name, name)
        pre_med = statistics.median(p for p, _ in pairs)
        post_med = statistics.median(q for _, q in pairs)
        drive = max(MIN_DRIVE_S, percentile([p + q for p, q in pairs], 0.1) - MIN_STOP_S)
        share = pre_med / (pre_med + post_med) if pre_med + post_med > 0 else 0.5
        kmh = 60 if name in SLOW_PIT_LANES else 80
        metres = drive * kmh / 3.6
        lap_m = float(circuit["length_km"]) * 1000
        result[key] = {
            "entry": round(metres * share / lap_m, 4),
            "exit": round(metres * (1 - share) / lap_m, 4),
            "driveS": round(drive, 1),
            "kmh": kmh,
            "lengthM": round(metres),
            "stops": len(pairs),
        }
        print(f"{key:<20} stops={len(pairs):>3} drive={drive:>5.1f}s  lane={metres:>4.0f} m  "
              f"before line={result[key]['entry']:.3f}  after={result[key]['exit']:.3f}")
    OUT.write_text(json.dumps(result, indent=1) + "\n")


if __name__ == "__main__":
    main()
