"""Add circuit outlines to data/track-geometry.json from bacinger/f1-circuits (MIT licence).

    python scripts/build_track_geometry.py            # add circuits that are missing
    python scripts/build_track_geometry.py --all      # rebuild every circuit

Source: https://github.com/bacinger/f1-circuits (GeoJSON, © Tomislav Bacinger, MIT).
The 10 study-circuit outlines already in the file were made from the same source; this script
reproduces that format: 320 points evenly spaced along the lap, starting at the start/finish
line in the direction of travel, SVG axes (y down), rotated by `rot` degrees and scaled to
width 100. `rot` is also used by the map's north arrow. For new circuits it is the rotation
that gives the widest (landscape) layout; edit it by hand if you prefer the TV orientation.
"""

import json
import sys
import urllib.request
from pathlib import Path

import numpy as np

SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"
OUT = Path(__file__).resolve().parent.parent / "data" / "track-geometry.json"
N_POINTS = 320

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


def outline(coords, reverse, rot=None):
    p = local_metres(coords)
    if reverse:
        p = p[::-1]
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
        current[key] = outline(features[gid]["geometry"]["coordinates"], key in REVERSED, keep_rot)
        print(f"{key:<20} rot={current[key]['rot']:>3} h={current[key]['h']}")
    OUT.write_text(json.dumps(current, separators=(",", ":")))


if __name__ == "__main__":
    main("--all" in sys.argv)
