import { isNeutralised } from "@/lib/race/laps";
import type { LapFlag, Standing } from "@/lib/race/timeline";
import type { Focus } from "./focus";

export type ChartLap = {
  lap: number;
  time: number | null;
  flag: LapFlag | null;
  clean: boolean;
  dirty: boolean;
  predicted: number | null;
  /** Lap already completed at the replay time. */
  done: boolean;
  /** Lap started (its forecast is visible). */
  shown: boolean;
};

export type StintChart = {
  laps: ChartLap[];
  yMin: number;
  yMax: number;
};

/** Lap-time series of the focused driver's current stint, with the visible y range. */
export function stintChart(x: Standing, focus: Focus): StintChart {
  const { run, completed, currentLap } = x;
  const { stint } = focus;
  const laps = run.laps.slice(stint.start - 1, stint.end).map<ChartLap>((lap) => ({
    lap: lap.lap_number,
    time: lap.lap_time_sec,
    flag: lap.flag,
    clean: lap.clean,
    dirty: lap.dirty_air,
    predicted: lap.prediction?.predicted_lap_time_sec ?? null,
    done: lap.lap_number <= completed,
    shown: lap.lap_number <= currentLap,
  }));

  const values = laps.flatMap((l) => [
    ...(l.clean && l.time !== null ? [l.time] : []),
    ...(l.predicted !== null ? [l.predicted] : []),
  ]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  return { laps, yMin: min - 0.25, yMax: max + 0.25 };
}

export const neutralisedCount = (laps: ChartLap[]) =>
  laps.filter((l) => isNeutralised(l.flag) && l.shown).length;
