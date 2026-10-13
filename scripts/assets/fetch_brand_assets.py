"""Download driver headshots and team logos for every driver/team in the dashboard.

Sources (the same ones the formula1.com site and the f1-headshots tool use):
  headshots  https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/drivers/{year}/{ref}.png
             (fallback) https://assets.multiviewer.dev/driver-headshots/{year}/{code}.png
  team logos https://media.formula1.com/content/dam/fom-website/teams/{year}/{slug}-logo.png

Usage (dev server running):  python scripts/assets/fetch_brand_assets.py [--api http://localhost:3000]
Writes public/img/drivers/{year}/{CODE}.png, public/img/teams/{year}/{slug}.png and
lib/brand-assets.generated.ts (which files exist). Images belong to Formula 1 and the teams.
"""

import argparse
import concurrent.futures as cf
import json
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UA = {"User-Agent": "Mozilla/5.0"}
F1 = "https://media.formula1.com/content/dam/fom-website"
HEADSHOT = F1 + "/2018-redesign-assets/drivers/{year}/{ref}.png"
HEADSHOT_FALLBACK = "https://assets.multiviewer.dev/driver-headshots/{year}/{code}.png"
TEAM_LOGO = F1 + "/teams/{year}/{slug}-logo.png"

# team name in the database -> slug on formula1.com (a list is tried in order)
TEAM_SLUGS = {
    "Alfa Romeo": ["alfa-romeo"],
    "AlphaTauri": ["alphatauri"],
    "Alpine": ["alpine"],
    "Aston Martin": ["aston-martin"],
    "Ferrari": ["ferrari"],
    "Haas F1 Team": ["haas", "haas-f1-team"],
    "Kick Sauber": ["kick-sauber"],
    "McLaren": ["mclaren"],
    "Mercedes": ["mercedes"],
    "RB": ["rb"],
    "Racing Bulls": ["racing-bulls"],
    "Red Bull Racing": ["red-bull-racing"],
    "Williams": ["williams"],
}


def fetch(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            return r.read() if r.status == 200 else None
    except Exception:
        return None


def ascii_up(text: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return "".join(c for c in plain.upper() if c.isalpha())


def refs(name: str) -> list[str]:
    """formula1.com reference: 3 letters of first name + 3 of last name + 01 (either order)."""
    parts = name.split()
    first, last = ascii_up(parts[0]), ascii_up(parts[-1])
    return list(dict.fromkeys([first[:3] + last[:3] + "01", last[:3] + first[:3] + "01"]))


def load_cars(api: str) -> dict[int, set[tuple[str, str, str]]]:
    races = json.load(urllib.request.urlopen(f"{api}/api/races"))

    def one(race):
        url = f"{api}/api/races/{race['race_id']}"
        for _ in range(4):  # the dev server can answer 500 while it recompiles
            try:
                cars = json.load(urllib.request.urlopen(url, timeout=120))["cars"]
                return race["year"], {(c["driver_code"], c["driver_name"], c["team"]) for c in cars}
            except Exception:
                time.sleep(3)
        raise SystemExit(f"could not read {url}")

    found: dict[int, set] = {}
    with cf.ThreadPoolExecutor(3) as pool:
        for year, cars in pool.map(one, [r for r in races if r["predictable"]]):
            found.setdefault(year, set()).update(cars)
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:3000")
    api = parser.parse_args().api
    cars = load_cars(api)

    drivers: dict[str, list[int]] = {}
    teams: dict[str, list[int]] = {}

    def get_driver(job):
        year, code, name = job
        out = ROOT / "public/img/drivers" / str(year) / f"{code}.png"
        if out.exists():
            return job, True
        data = None
        for ref in refs(name):
            data = fetch(HEADSHOT.format(year=year, ref=ref))
            if data:
                break
        data = data or fetch(HEADSHOT_FALLBACK.format(year=year, code=code))
        if data:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
        return job, bool(data)

    def get_team(job):
        year, team = job
        for slug in TEAM_SLUGS.get(team, []):
            data = fetch(TEAM_LOGO.format(year=year, slug=slug))
            if data:
                out = ROOT / "public/img/teams" / str(year) / f"{slug}.png"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(data)
                return job, slug
        return job, None

    driver_jobs = sorted({(y, c, n) for y, rows in cars.items() for c, n, _ in rows})
    team_jobs = sorted({(y, t) for y, rows in cars.items() for _, _, t in rows})
    with cf.ThreadPoolExecutor(8) as pool:
        for (year, code, name), ok in pool.map(get_driver, driver_jobs):
            if ok:
                drivers.setdefault(code, []).append(year)
            else:
                print(f"no headshot: {year} {code} {name}")
        team_files: dict[str, dict[int, str]] = {}
        for (year, team), slug in pool.map(get_team, team_jobs):
            if slug:
                team_files.setdefault(team, {})[year] = slug
            else:
                print(f"no logo: {year} {team}")

    drivers = {k: sorted(v) for k, v in sorted(drivers.items())}
    team_files = {k: dict(sorted(v.items())) for k, v in sorted(team_files.items())}
    body = (
        "// Generated by scripts/assets/fetch_brand_assets.py — do not edit.\n"
        f"export const DRIVER_PHOTO_YEARS: Record<string, number[]> = {json.dumps(drivers)};\n"
        f"export const TEAM_LOGO_FILES: Record<string, Record<number, string>> = "
        f"{json.dumps(team_files)};\n"
    )
    (ROOT / "lib/brand-assets.generated.ts").write_text(body, encoding="utf-8")
    print(f"{sum(len(v) for v in drivers.values())} headshots, "
          f"{sum(len(v) for v in team_files.values())} logos")


if __name__ == "__main__":
    main()
