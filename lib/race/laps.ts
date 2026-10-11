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

/**
 * A forecast is only kept for a clean lap that follows this many clean laps in a row on the same
 * tyres. It is the longest window tried in the study, so every window size is scored on the same
 * laps.
 */
export const FORECAST_WARMUP_LAPS = 5;

/** Telemetry coverage a lap needs to be used (same limit as the training data). */
const MIN_TELEMETRY_COVERAGE = 0.9;

export type NoForecastKind =
  | "edge"
  | "pit"
  | "neutralised"
  | "restart"
  | "invalid"
  | "rain"
  | "telemetry"
  | "tyre-data"
  | "warm-up"
  | "other";

export type NoForecast = { kind: NoForecastKind; text: string };

/** Short names used when a stint's missing forecasts are summed up. */
export const NO_FORECAST_LABEL: Record<NoForecastKind, string> = {
  edge: "first or last laps",
  pit: "pit laps",
  neutralised: "Safety Car, VSC or flags",
  restart: "laps right after a flag",
  invalid: "invalid lap times",
  rain: "rain on track",
  telemetry: "incomplete telemetry",
  "tyre-data": "tyre data missing",
  "warm-up": "warm-up laps",
  other: "no stored forecast",
};

const isGreen = (lap: RunLap) => lap.track_status == null || lap.track_status === "1";

/**
 * Why this lap cannot be used as a clean lap, or null when it can. The checks follow the order of
 * the model's data cleaning, so the reason shown is the first rule the lap breaks.
 */
function lapIssue(run: Run, index: number, totalLaps: number): NoForecast | null {
  const lap = run.laps[index];
  if (lap.flag === "START" || lap.lap_number <= 2) {
    return { kind: "edge", text: "Race start: the first 2 laps are not modelled" };
  }
  if (lap.lap_number >= totalLaps) {
    return { kind: "edge", text: "Final lap: not modelled" };
  }
  switch (lap.flag) {
    case "PIT OUT":
      return { kind: "pit", text: "Out-lap: it includes leaving the pits, so it is not modelled" };
    case "PIT IN":
      return { kind: "pit", text: "In-lap: it includes entering the pits, so it is not modelled" };
    case "SC":
    case "VSC":
    case "RED":
      return { kind: "neutralised", text: `${EVENT[lap.flag].name}: lap is not modelled` };
    case "YEL":
      return { kind: "neutralised", text: "Yellow flag: lap is not modelled" };
  }
  if (lap.is_deleted) {
    return { kind: "invalid", text: "Lap time was deleted, so it is not used" };
  }
  if (lap.lap_time_sec === null || lap.is_accurate === false) {
    return { kind: "invalid", text: "Lap time was not recorded accurately, so it is not used" };
  }
  if (lap.rainfall === true) {
    return { kind: "rain", text: "Rain was recorded on track, so this lap is not used" };
  }
  if (!isGreen(lap)) {
    return { kind: "neutralised", text: "Not a green-flag lap, so it is not modelled" };
  }
  if ([1, 2].some((back) => index - back >= 0 && !isGreen(run.laps[index - back]))) {
    return {
      kind: "restart",
      text: "Right after a Safety Car, VSC or flag: the next 2 laps are skipped",
    };
  }
  const span = lap.tel_span_sec;
  const telemetryOk =
    (lap.tel_valid_frac ?? 0) >= MIN_TELEMETRY_COVERAGE &&
    (lap.tel_speed_max ?? 0) > 0 &&
    (lap.tel_speed_min ?? 0) > 0 &&
    span != null &&
    Math.abs(span - lap.lap_time_sec) <= 1;
  if (!telemetryOk) {
    return { kind: "telemetry", text: "Telemetry for this lap is missing or incomplete" };
  }
  if (lap.stint === null || lap.compound === null || lap.tyre_life === null) {
    return { kind: "tyre-data", text: "Tyre data is missing for this lap in the source data" };
  }
  return null;
}

/** Why a lap has no forecast, in plain words. Use it only for laps without a stored forecast. */
export function noForecast(run: Run, lap: RunLap, totalLaps: number): NoForecast {
  const index = run.laps.findIndex((candidate) => candidate.lap_number === lap.lap_number);
  if (index < 0) return { kind: "other", text: "No forecast was stored for this lap" };

  const own = lapIssue(run, index, totalLaps);
  if (own) return own;

  let streak = 0;
  for (
    let back = index - 1;
    back >= 0 &&
    run.laps[back].stintIndex === lap.stintIndex &&
    lapIssue(run, back, totalLaps) === null;
    back--
  ) {
    streak++;
  }
  if (streak < FORECAST_WARMUP_LAPS) {
    return {
      kind: "warm-up",
      text: `Warm-up: needs ${FORECAST_WARMUP_LAPS} clean laps in a row on the same tyres (${streak} so far)`,
    };
  }
  return { kind: "other", text: "No forecast was stored for this lap" };
}

/** Counts the given laps without a forecast by reason, largest group first. */
export function noForecastSummary(run: Run, laps: RunLap[], totalLaps: number) {
  const counts = new Map<NoForecastKind, number>();
  for (const lap of laps) {
    if (lap.prediction) continue;
    const { kind } = noForecast(run, lap, totalLaps);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts]
    .map(([kind, count]) => ({ kind, count, label: NO_FORECAST_LABEL[kind] }))
    .sort((a, b) => b.count - a.count);
}
