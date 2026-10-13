"use client";

import { sampleTelemetry } from "@/lib/race/telemetry";
import type { RunLap, Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import { useDriverTelemetry } from "./useTelemetry";

export type CarReading = {
  /** True when the values follow the replay clock; false when they are lap averages. */
  live: boolean;
  /** Seconds into the lap in progress. */
  elapsed: number;
  /** The last completed lap (or the lap in progress before the first one ends): the averages' source. */
  lap: RunLap;
  speed: number | null;
  topSpeed: number | null;
  throttle: number | null;
  /** 0..1: brake pressed right now, or the share of the lap spent braking. */
  brakeShare: number;
  rpm: number | null;
  gear: number | null;
  drs: boolean;
};

/**
 * What one car is doing at replay time `time`: the sample from its telemetry file when the race
 * has one, the averages of its last lap otherwise.
 */
export function useCarReading(x: Standing, time: number): CarReading {
  const { race } = useRace();
  const file = useDriverTelemetry(race.year, race.event_name, x.run.driver_code);
  const elapsed = time - x.run.cum[x.currentLap - 1];
  const sample =
    file && !x.done && !x.retired ? sampleTelemetry(file, x.currentLap, elapsed) : null;
  const lap = x.completed >= 1 ? x.run.laps[x.completed - 1] : x.lap;

  if (sample) {
    return {
      live: true,
      elapsed,
      lap,
      speed: sample.speed,
      topSpeed: sample.topSpeed,
      throttle: sample.throttle,
      brakeShare: sample.brake ? 1 : 0,
      rpm: sample.rpm,
      gear: sample.gear,
      drs: sample.drs,
    };
  }
  return {
    live: false,
    elapsed,
    lap,
    speed: lap.tel_speed_mean ?? null,
    topSpeed: lap.tel_speed_max ?? null,
    throttle: lap.tel_throttle_mean ?? null,
    brakeShare: (lap.tel_pct_braking ?? 0) / 100,
    rpm: lap.tel_rpm_mean ?? null,
    gear: lap.tel_n_gear_mode ?? null,
    drs: (lap.tel_pct_drs_open ?? 0) > 0,
  };
}
