"""Synthetic races in the database row format, with the awkward cases the cleaning must handle:
pit stops, SC and yellow periods, deleted/inaccurate laps, bad telemetry, rain, lapped cars,
a wet-tyre race and a slow outlier lap."""

import numpy as np

from app.db import LAP_COLUMNS, TEL_COLUMNS

DRIVERS = [f"D{chr(65 + i)}{chr(65 + i)}" for i in range(20)]


def make_race(race_id: int, seed: int, total_laps: int = 45, wet: bool = False):
    rng = np.random.default_rng(seed)
    pace = rng.normal(90, 0.6, len(DRIVERS))
    pit_lap = rng.integers(14, 30, len(DRIVERS))
    sc = set(range(20, 23)) if seed % 2 else set()
    yellow = {int(rng.integers(5, total_laps))}
    clock = np.zeros(len(DRIVERS))
    rows = []
    for lap in range(1, total_laps + 1):
        lap_times = []
        for i, drv in enumerate(DRIVERS):
            stint = 1 if lap <= pit_lap[i] else 2
            life = lap if stint == 1 else lap - pit_lap[i]
            t = pace[i] + 0.05 * life - 0.03 * lap + rng.normal(0, 0.25)
            if lap == 1:
                t += 6
            if lap in sc:
                t += 25
            if lap == pit_lap[i] or lap == pit_lap[i] + 1:
                t += 11
            if rng.random() < 0.01:
                t += 9  # outlier (traffic, mistake)
            lap_times.append(t)
        clock += np.array(lap_times)
        order = np.argsort(clock)
        for pos, i in enumerate(order):
            drv = DRIVERS[i]
            stint = 1 if lap <= pit_lap[i] else 2
            ahead = DRIVERS[order[pos - 1]] if pos else None
            behind = DRIVERS[order[pos + 1]] if pos < len(order) - 1 else None
            status = "4" if lap in sc else ("2" if lap in yellow and i % 3 == 0 else "1")
            compound = ("INTERMEDIATE" if wet and lap < 6 else ["MEDIUM", "SOFT", "HARD"][(stint + i) % 3])
            lt = lap_times[i]
            row = {
                "driver_code": drv, "lap_number": lap, "stint": stint, "compound": compound,
                "tyre_life": lap if stint == 1 else lap - pit_lap[i], "fresh_tyre": stint == 2 or i % 4 == 0,
                "track_status": status, "is_accurate": not (lap == 1 or lap in (pit_lap[i], pit_lap[i] + 1) or rng.random() < 0.02),
                "is_deleted": bool(rng.random() < 0.01), "rainfall": bool(lap == total_laps - 3),
                "lap_time_sec": round(float(lt), 3),
                "sector1_time_sec": round(float(lt * 0.31), 3), "sector2_time_sec": round(float(lt * 0.37), 3),
                "sector3_time_sec": round(float(lt * 0.32), 3), "lap_end_time_sec": round(float(clock[i]) + 3600, 3),
                "speed_i1": float(rng.normal(280, 5)), "speed_i2": float(rng.normal(250, 5)),
                "speed_fl": float(rng.normal(270, 5)), "speed_st": None if rng.random() < 0.01 else float(rng.normal(310, 6)),
                "air_temp": 25 + lap * 0.02, "track_temp": 40 - lap * 0.05, "humidity": 50.0, "pressure": 1010.0,
                "wind_speed": 1.5, "wind_direction": int(rng.integers(0, 360)),
                "gap_ahead_sec": None if pos == 0 else round(float(clock[i] - clock[order[pos - 1]]), 3),
                "gap_behind_sec": None if behind is None else round(float(clock[order[pos + 1]] - clock[i]), 3),
                "driver_ahead": ahead, "driver_behind": behind,
            }
            rows.append(row)
    for row in rows:  # first car has no gap ahead: the notebook drops it via REQUIRED
        assert set(row) == set(LAP_COLUMNS)
    tel = []
    for row in rows:
        valid = 0.5 if rng.random() < 0.02 else 1.0
        t = {k: float(rng.normal(1, 0.1)) for k in TEL_COLUMNS}
        t |= {"driver_code": row["driver_code"], "lap_number": row["lap_number"], "tel_valid_frac": valid,
              "tel_span_sec": row["lap_time_sec"] + (2 if rng.random() < 0.01 else 0.1),
              "tel_speed_max": 330.0, "tel_speed_min": 0.0 if rng.random() < 0.005 else 80.0}
        tel.append(t)
    race = {"race_id": race_id, "total_laps": total_laps, "event_date": f"2025-0{race_id}-01"}
    return race, rows, tel
