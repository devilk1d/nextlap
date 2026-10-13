"""Upload the per-driver telemetry JSON files to the public Supabase Storage bucket `telemetry`.

    # PowerShell; paste the key from Project Settings -> API -> secret / service_role key
    $env:SUPABASE_SERVICE_ROLE_KEY = "..."
    python scripts/telemetry/upload_telemetry.py [--only 2024_italian-grand-prix] [--missing-only] [--dry-run]

Reads SUPABASE_URL from .env.local (or the environment). The secret key is read from the
environment only: never put it in a file in the repo and never use it in the browser.

Every file in `public/telemetry/<race>/<DRIVER>.json` is uploaded to `<race>/<DRIVER>.json` in the
bucket. Uploads overwrite (`x-upsert`), so the script can be run again after the files change;
`--missing-only` skips files the bucket already has with the same size.
Stdlib only; needs no install.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BUCKET = "telemetry"
# One year: a race's file never changes once built, so browsers and the CDN may keep it.
CACHE_CONTROL = "max-age=31536000"
WORKERS = 6
RETRIES = 4


def env_url() -> str:
    if "SUPABASE_URL" in os.environ:
        return os.environ["SUPABASE_URL"].rstrip("/")
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith("SUPABASE_URL="):
                return line.split("=", 1)[1].strip().strip("\"'").rstrip("/")
    raise SystemExit("SUPABASE_URL is not set (.env.local or environment)")


def upload(base: str, key: str, root: Path, path: Path) -> tuple[Path, str | None]:
    """Returns (path, None) on success or (path, reason)."""
    name = path.relative_to(root).as_posix()
    request = urllib.request.Request(
        f"{base}/storage/v1/object/{BUCKET}/{name}",
        data=path.read_bytes(),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Cache-Control": CACHE_CONTROL,
            "x-upsert": "true",
        },
    )
    reason = "unknown"
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if 200 <= response.status < 300:
                    return path, None
                reason = f"HTTP {response.status}"
        except urllib.error.HTTPError as error:
            reason = f"HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:200]}"
            if error.code in (400, 401, 403, 404):  # will not get better by retrying
                break
        except (urllib.error.URLError, TimeoutError) as error:
            reason = str(error)
        time.sleep(1.5 * (attempt + 1))
    return path, reason


def remote_sizes(base: str, key: str, race: str) -> dict[str, int]:
    """File name -> size in bytes of what the bucket already holds for one race folder."""
    request = urllib.request.Request(
        f"{base}/storage/v1/object/list/{BUCKET}",
        data=json.dumps({"prefix": race, "limit": 1000, "offset": 0}).encode(),
        method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        items = json.load(response)
    return {item["name"]: int((item.get("metadata") or {}).get("size", -1)) for item in items}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default=str(ROOT / "public" / "telemetry"))
    parser.add_argument("--only", help="race folder, e.g. 2024_italian-grand-prix (default: all)")
    parser.add_argument("--missing-only", action="store_true", help="skip files already in the bucket")
    parser.add_argument("--dry-run", action="store_true", help="list what would be uploaded")
    args = parser.parse_args()

    root = Path(args.source)
    files = sorted(root.glob("*/*.json"))
    if args.only:
        files = [f for f in files if f.parent.name == args.only]
    if not files:
        raise SystemExit(f"no files under {root}")
    total = sum(f.stat().st_size for f in files)
    print(f"{len(files)} files, {total / 1e6:.0f} MB -> bucket '{BUCKET}'", flush=True)
    if args.dry_run:
        return

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is not set in the environment")
    base = env_url()

    if args.missing_only:
        held: dict[str, dict[str, int]] = {}
        for race in sorted({f.parent.name for f in files}):
            held[race] = remote_sizes(base, key, race)
        files = [f for f in files if held[f.parent.name].get(f.name) != f.stat().st_size]
        print(f"{len(files)} files missing or changed", flush=True)
        if not files:
            return

    failed: list[tuple[Path, str]] = []
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for path, reason in pool.map(lambda f: upload(base, key, root, f), files):
            done += 1
            if reason:
                failed.append((path, reason))
                print(f"FAILED {path.relative_to(root).as_posix()}: {reason}", file=sys.stderr, flush=True)
            elif done % 100 == 0 or done == len(files):
                print(f"  {done}/{len(files)}", flush=True)

    print(f"uploaded {len(files) - len(failed)}, failed {len(failed)}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
