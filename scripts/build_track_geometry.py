"""Add circuit outlines to data/track-geometry.json from bacinger/f1-circuits (MIT licence).

    python scripts/build_track_geometry.py            # add circuits that are missing
    python scripts/build_track_geometry.py --all      # rebuild every circuit

Source: https://github.com/bacinger/f1-circuits (GeoJSON, © Tomislav Bacinger, MIT).
Format: 320 points evenly spaced along the lap, starting at the start/finish line in the
direction of travel, SVG axes (y down), rotated by `rot` degrees and scaled to width 100.
`rot` is also used by the map's north arrow.

Orientation and start/finish line come from the official F1 circuit data served by MultiViewer
(https://api.multiviewer.app, the same data FastF1 uses for `circuit_info.rotation`): its
position-data outline starts at the timing line and is rotated by an official angle so it matches
the F1 circuit maps. Only the angle and the start point are taken from it, never its coordinates:
the outline is rotated until it overlays the official one (smallest chamfer distance) and the lap
is started at the official start/finish line. Without network access the stored `rot` is kept.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"
MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits/{key}/{year}"
OUT = Path(__file__).resolve().parent.parent / "data" / "track-geometry.json"
N_POINTS = 320
FINE_POINTS = 4000
# F1 live-timing circuit keys (circuits.circuit_key in the database).
F1_KEYS = {
    "silverstone": 2, "hungaroring": 4, "imola": 6, "spa": 7, "austin": 9, "melbourne": 10,
    "interlagos": 14, "catalunya": 15, "spielberg": 19, "monte carlo": 22, "montreal": 23,
    "paul ricard": 28, "monza": 39, "suzuka": 46, "shanghai": 49, "zandvoort": 55,
    "singapore": 61, "sakhir": 63, "mexico city": 65, "yas marina circuit": 70, "baku": 144,
    "jeddah": 149, "lusail": 150, "miami": 151, "las vegas": 152,
}

# Dataset CircuitShortName (lower case, as used by lib/race/track.ts) → bacinger id.
CIRCUITS = {
    "silverstone": "gb-1948", "hungaroring": "hu-1986", "imola": "it-1953", "spa": "be-1925",
    "austin": "us-2012", "melbourne": "au-1953", "interlagos": "br-1940", "catalunya": "es-1991",
    "spielberg": "at-1969", "monte carlo": "mc-1929", "montreal": "ca-1978", "paul ricard": "fr-1969",
    "monza": "it-1922", "suzuka": "jp-1962", "shanghai": "cn-2004", "zandvoort": "nl-1948",
    "singapore": "sg-2008", "sakhir": "bh-2002", "mexico city": "mx-1962", "yas marina circuit": "ae-2009",
    "baku": "az-2016", "jeddah": "sa-2021", "lusail": "qa-2004", "miami": "us-2022", "las vegas": "us-2023",
}
# The source line runs against the race direction for these (checked against the clockwise /
# anti-clockwise column of Wikipedia's "List of Formula One circuits").
REVERSED = {"singapore", "paul ricard"}


def local_metres(coords):
    c = np.asarray(coords, float)
    lat0 = np.deg2rad(c[:, 1].mean())
    x = np.deg2rad(c[:, 0]) * 6_371_000 * np.cos(lat0)
    y = np.deg2rad(c[:, 1]) * 6_371_000
    return np.c_[x - x.mean(), y - y.mean()]


def resample(p, n):
    if np.linalg.norm(p[0] - p[-1]) < 1e-6:
        p = p[:-1]
    loop = np.vstack([p, p[:1]])
    cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(loop, axis=0), axis=1))]
    t = np.linspace(0, cum[-1], n, endpoint=False)
    return np.c_[np.interp(t, cum, loop[:, 0]), np.interp(t, cum, loop[:, 1])]


def project(svg, rot):
    a = np.deg2rad(rot)
    r = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    q = svg @ r.T
    q -= q.min(axis=0)
    return q * (100 / q[:, 0].max())


def official_outline(f1_key):
    """Official F1 outline in SVG axes (y down), rotated to the official map orientation."""
    for year in (2025, 2024, 2023, 2022):
        for _ in range(3):
            try:
                req = urllib.request.Request(MULTIVIEWER.format(key=f1_key, year=year),
                                             headers={"User-Agent": "nextlap-thesis-build/1.0"})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = json.load(resp)
                if data.get("x"):
                    a = np.deg2rad(data["rotation"])
                    x, y = np.asarray(data["x"], float), np.asarray(data["y"], float)
                    return np.c_[x * np.cos(a) - y * np.sin(a), x * np.sin(a) + y * np.cos(a)] * [1, -1]
                break
            except Exception:  # noqa: BLE001 - retry, then try the previous season
                time.sleep(2)
    return None


def normalise(p):
    p = p - p.mean(axis=0)
    return p / np.sqrt((p ** 2).sum(axis=1).mean())


def rotate(p, deg):
    a = np.deg2rad(deg)
    return p @ np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]).T


def chamfer(a, b):
    d = np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2)
    return float((d.min(axis=1).mean() + d.min(axis=0).mean()) / 2)


def align_to_official(fine, official):
    """Rotation (degrees) that overlays `fine` on the official outline, and the index in `fine`
    of the official start/finish line."""
    target = normalise(resample(official, 400))
    probe = normalise(fine[:: max(1, len(fine) // 400)])
    rot = min(range(360), key=lambda r: chamfer(normalise(rotate(probe, r)), target))
    aligned = normalise(rotate(fine, rot))
    start = int(np.linalg.norm(aligned - normalise(official)[0], axis=1).argmin())
    return rot, start


def outline(coords, reverse, rot=None, official=None):
    p = local_metres(coords)
    if reverse:
        p = p[::-1]
    start = 0
    if official is not None:
        fine = resample(p, FINE_POINTS) * [1, -1]
        rot, start = align_to_official(fine, official)
        p = np.roll(fine * [1, -1], -start, axis=0)
    svg = resample(p, N_POINTS) * [1, -1]
    if rot is None:
        rot = min(range(180), key=lambda r: project(svg, r)[:, 1].max())
    q = np.round(project(svg, rot), 2)
    return {"p": q.tolist(), "w": 100, "h": round(float(q[:, 1].max()), 2), "rot": rot}


def main(rebuild_all: bool) -> None:
    with urllib.request.urlopen(SOURCE) as resp:
        features = {f["properties"]["id"]: f for f in json.load(resp)["features"]}
    current = json.loads(OUT.read_text()) if OUT.exists() else {}
    for key, gid in CIRCUITS.items():
        if key in current and not rebuild_all:
            continue
        keep_rot = current.get(key, {}).get("rot")
        official = official_outline(F1_KEYS[key])
        if official is None:
            print(f"{key:<20} no official data: keeping rot={keep_rot}")
        current[key] = outline(features[gid]["geometry"]["coordinates"], key in REVERSED, keep_rot, official)
        print(f"{key:<20} rot={current[key]['rot']:>3} h={current[key]['h']}")
    OUT.write_text(json.dumps(current, separators=(",", ":")))


if __name__ == "__main__":
    main("--all" in sys.argv)
