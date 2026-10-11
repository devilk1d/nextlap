"""Read-only access to the Supabase `nextlap` database through its REST API (PostgREST)."""

from __future__ import annotations

import os
from functools import lru_cache

import httpx
import pandas as pd

PAGE = 1000

# Database column (snake_case) → notebook column (laps_2022_2025_v3.parquet).
LAP_COLUMNS = {
    "driver_code": "Driver", "lap_number": "LapNumber", "stint": "Stint", "compound": "Compound",
    "tyre_life": "TyreLife", "fresh_tyre": "FreshTyre", "track_status": "TrackStatus",
    "is_accurate": "IsAccurate", "is_deleted": "Deleted", "rainfall": "Rainfall",
    "lap_time_sec": "LapTime_sec", "sector1_time_sec": "Sector1Time_sec",
    "sector2_time_sec": "Sector2Time_sec", "sector3_time_sec": "Sector3Time_sec",
    "lap_end_time_sec": "LapEndTime_sec", "speed_i1": "SpeedI1", "speed_i2": "SpeedI2",
    "speed_fl": "SpeedFL", "speed_st": "SpeedST", "air_temp": "AirTemp", "track_temp": "TrackTemp",
    "humidity": "Humidity", "pressure": "Pressure", "wind_speed": "WindSpeed",
    "wind_direction": "WindDirection", "gap_ahead_sec": "GapAhead_sec", "gap_behind_sec": "GapBehind_sec",
    "driver_ahead": "DriverAhead", "driver_behind": "DriverBehind",
}
TEL_COLUMNS = {
    "tel_speed_max": "Tel_SpeedMax", "tel_speed_min": "Tel_SpeedMin", "tel_speed_mean": "Tel_SpeedMean",
    "tel_speed_std": "Tel_SpeedStd", "tel_throttle_mean": "Tel_ThrottleMean",
    "tel_throttle_std": "Tel_ThrottleStd", "tel_pct_full_throttle": "Tel_PctFullThrottle",
    "tel_pct_coast": "Tel_PctCoast", "tel_pct_braking": "Tel_PctBraking",
    "tel_n_brake_zones": "Tel_nBrakeZones", "tel_n_gear_mode": "Tel_nGearMode",
    "tel_gear_mean": "Tel_GearMean", "tel_n_gear_shifts": "Tel_nGearShifts",
    "tel_pct_drs_open": "Tel_PctDRSOpen", "tel_n_drs_activations": "Tel_nDRSActivations",
    "tel_rpm_max": "Tel_RPMMax", "tel_rpm_mean": "Tel_RPMMean", "tel_rpm_std": "Tel_RPMStd",
    "tel_pct_slow": "Tel_PctSlow", "tel_pct_fast": "Tel_PctFast", "tel_accel_p99": "Tel_AccelP99",
    "tel_decel_p01": "Tel_DecelP01", "tel_valid_frac": "Tel_ValidFrac", "tel_span_sec": "Tel_SpanSec",
}
RACE_COLUMNS = "race_id,year,event_name,event_date,total_laps,exclusion_reason,circuits(short_name)"


def to_notebook_frame(race: dict, laps: list[dict], telemetry: list[dict]) -> pd.DataFrame:
    """Database rows of one race → the raw frame the notebook pipeline expects."""
    lap_df = pd.DataFrame(laps, columns=list(LAP_COLUMNS))
    tel_df = pd.DataFrame(telemetry, columns=["driver_code", "lap_number", *TEL_COLUMNS])
    df = lap_df.merge(tel_df, on=["driver_code", "lap_number"], how="left").rename(columns=LAP_COLUMNS | TEL_COLUMNS)
    for col in ("IsAccurate", "Deleted"):
        df[col] = df[col].astype(bool)
    df["Rainfall"] = df["Rainfall"].astype(float)
    numeric = [c for c in df.columns if c not in {"Driver", "Compound", "TrackStatus", "DriverAhead", "DriverBehind",
                                                  "IsAccurate", "Deleted"}]
    df[numeric] = df[numeric].apply(pd.to_numeric, errors="coerce")
    df["race"] = str(race["race_id"])
    df["TotalLaps"] = race["total_laps"]
    df["EventDate"] = pd.Timestamp(race["event_date"])
    return df


class Database:
    def __init__(self, url: str | None = None, key: str | None = None, timeout: float = 20.0):
        url = url or os.environ["SUPABASE_URL"]
        key = key or os.environ["SUPABASE_PUBLISHABLE_KEY"]
        self.client = httpx.Client(base_url=f"{url.rstrip('/')}/rest/v1",
                                   headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=timeout)

    def _get_all(self, table: str, params: dict) -> list[dict]:
        rows, offset = [], 0
        while True:
            r = self.client.get(f"/{table}", params={**params, "limit": PAGE, "offset": offset})
            r.raise_for_status()
            batch = r.json()
            rows += batch
            if len(batch) < PAGE:
                return rows
            offset += PAGE

    def races(self) -> list[dict]:
        rows = self._get_all("races", {"select": RACE_COLUMNS, "order": "event_date"})
        for row in rows:
            row["circuit"] = (row.pop("circuits") or {}).get("short_name")
        return rows

    def race(self, race_id: int) -> dict | None:
        return next((r for r in self.races() if r["race_id"] == race_id), None)

    def race_frame(self, race: dict) -> pd.DataFrame:
        rid = f"eq.{race['race_id']}"
        laps = self._get_all("laps", {"select": ",".join(LAP_COLUMNS), "race_id": rid,
                                      "order": "driver_code,lap_number"})
        tel = self._get_all("lap_telemetry", {"select": ",".join(["driver_code", "lap_number", *TEL_COLUMNS]),
                                              "race_id": rid, "order": "driver_code,lap_number"})
        return to_notebook_frame(race, laps, tel)


@lru_cache(maxsize=1)
def database() -> Database:
    return Database()
