import { median, present } from "@/lib/stats";
import { EVENT, type NeutralisedKind } from "./constants";
import type { LapFlag, Run, RunLap, Timeline } from "./timeline";

export const SECTOR_TIME_KEYS = [
  "sector1_time_sec",
  "sector2_time_sec",
  "sector3_time_sec",
] as const;

/** Clean laps of a run up to and including `upToLap`. */
export const cleanLaps = (run: Run, upToLap = Infinity) =>
  run.laps.filter((lap) => lap.clean && lap.lap_number <= upToLap);

export function fastest(laps: RunLap[]): RunLap | null {
  let best: RunLap | null = null;
  for (const lap of laps) {
    if (
      lap.lap_time_sec !== null &&
      (!best || lap.lap_time_sec < (best.lap_time_sec ?? Infinity))
    ) {
      best = lap;
    }
  }
  return best;
}

/** Best time per sector (null when no lap has one). */
export function sectorBests(laps: RunLap[]): (number | null)[] {
  return SECTOR_TIME_KEYS.map((key) => {
    const times = laps.map((lap) => lap[key]).filter(present);
    return times.length ? Math.min(...times) : null;
  });
}

/** Share of the lap spent in each sector (median over the field's clean laps). */
export function sectorShares(timeline: Timeline): [number, number, number] {
  const shares = SECTOR_TIME_KEYS.map((key) =>
    median(
      timeline.runs.flatMap((run) =>
        run.laps
          .filter((lap) => lap.clean && lap[key] !== null)
          .map((lap) => (lap[key] as number) / (lap.lap_time_sec as number)),
      ),
    ),
  );
  if (shares.some((share) => share === null)) return [1 / 3, 1 / 3, 1 / 3];
  const total = shares.reduce<number>((sum, share) => sum + (share ?? 0), 0);
  return shares.map((share) => (share ?? 0) / total) as [number, number, number];
}

/** Timing-screen colour of a sector: best, near best, slower. */
export function sectorTone(
  time: number | null,
  best: number | null,
): "best" | "good" | "slow" | "none" {
  if (time === null || best === null) return "none";
  if (time <= best + 1e-9) return "best";
  return time <= best + 0.15 ? "good" : "slow";
}

export const TONE_COLOR = {
  best: "var(--color-best)",
  good: "var(--color-go)",
  slow: "var(--color-caution)",
  none: "var(--color-ink-mute)",
} as const;

export function flagColor(flag: LapFlag | null): string | null {
  return flag && flag in EVENT ? EVENT[flag as NeutralisedKind].color : null;
}

export const isNeutralised = (flag: LapFlag | null): flag is NeutralisedKind =>
  flag === "SC" || flag === "VSC" || flag === "YEL" || flag === "RED";

/** Why a lap carries no forecast, in plain words. */
export function noForecastReason(lap: RunLap, windowSize: number): string {
  switch (lap.flag) {
    case "START":
      return "Standing start — not modelled";
    case "PIT OUT":
      return "Out-lap — includes pit exit, not modelled";
    case "PIT IN":
      return "In-lap — includes pit entry, not modelled";
    case "SC":
    case "VSC":
    case "RED":
      return `${EVENT[lap.flag].name} — neutralised lap, not modelled`;
    case "YEL":
      return "Yellow flag — lap excluded from model input";
    default:
      return `Warm-up — the model needs ${windowSize} laps on this tyre set`;
  }
}
