import { median } from "@/lib/stats";
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

/**
 * Timing-screen colours, as on the F1 live timing: purple = fastest of all drivers so far,
 * green = the driver's own best so far, yellow = slower than the driver's own best, white = a time
 * with nothing to compare against yet (the driver's first one), none = no time recorded.
 */
export type SectorTone = "purple" | "green" | "yellow" | "white" | "none";

export const SECTOR_TONE_COLOR: Record<SectorTone, string> = {
  purple: "var(--color-best)",
  green: "var(--color-go)",
  yellow: "var(--color-caution)",
  white: "var(--color-ink)",
  none: "var(--color-ink-faint)",
};

/** What each colour means, in plain words (legend and tooltips). */
export const SECTOR_TONE_MEANING: Record<
  Exclude<SectorTone, "none">,
  { name: string; short: string; text: string }
> = {
  purple: { name: "Fastest overall", short: "FASTEST", text: "Fastest of all drivers so far" },
  green: { name: "Personal best", short: "PERSONAL BEST", text: "This driver's best so far" },
  yellow: { name: "Slower", short: "SLOWER", text: "Slower than this driver's best" },
  white: {
    name: "No reference",
    short: "FIRST TIME",
    text: "First time set, nothing to compare with yet",
  },
};

/** Channels compared: sector 1–3 and the whole lap. */
const LAP_CHANNEL = 3;
const CHANNEL_KEYS = [...SECTOR_TIME_KEYS, "lap_time_sec"] as const;

type ToneIndex = {
  /** Per channel: when each driver finished it, ascending, with the running minimum of its time. */
  events: { end: number[]; min: number[] }[];
  /** Per run and channel: the driver's best over the laps before lap index i (null if none). */
  personal: Map<Run, (number | null)[][]>;
};

const toneIndexes = new WeakMap<Timeline, ToneIndex>();

/** Race time at which `channel` of lap `index` was completed. */
function channelEnd(run: Run, index: number, channel: number): number {
  if (channel === LAP_CHANNEL) return run.cum[index + 1];
  const lap = run.laps[index];
  let t = run.cum[index];
  for (let k = 0; k <= channel; k += 1) t += lap[SECTOR_TIME_KEYS[k]] ?? 0;
  return t;
}

function toneIndex(timeline: Timeline): ToneIndex {
  const cached = toneIndexes.get(timeline);
  if (cached) return cached;

  const raw: { end: number; time: number }[][] = CHANNEL_KEYS.map(() => []);
  const personal = new Map<Run, (number | null)[][]>();
  for (const run of timeline.runs) {
    const best = CHANNEL_KEYS.map<number | null>(() => null);
    const before = CHANNEL_KEYS.map<(number | null)[]>(() => []);
    run.laps.forEach((lap, index) => {
      CHANNEL_KEYS.forEach((key, channel) => {
        before[channel].push(best[channel]);
        const time = lap[key];
        // A deleted lap is not a reference for anyone.
        if (time === null || lap.is_deleted) return;
        raw[channel].push({ end: channelEnd(run, index, channel), time });
        best[channel] = best[channel] === null ? time : Math.min(best[channel], time);
      });
    });
    personal.set(run, before);
  }

  const events = raw.map((list) => {
    list.sort((a, b) => a.end - b.end);
    let min = Infinity;
    return {
      end: list.map((e) => e.end),
      min: list.map((e) => (min = Math.min(min, e.time))),
    };
  });
  const index = { events, personal };
  toneIndexes.set(timeline, index);
  return index;
}

function toneOf(timeline: Timeline, run: Run, lapNumber: number, channel: number): SectorTone {
  const index = lapNumber - 1;
  const lap = run.laps[index];
  const time = lap?.[CHANNEL_KEYS[channel]] ?? null;
  if (time === null) return "none";

  const { events, personal } = toneIndex(timeline);
  const { end, min } = events[channel];
  const at = channelEnd(run, index, channel);
  let lo = 0;
  let hi = end.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (end[mid] <= at + 1e-6) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (last >= 0 && time <= min[last] + 1e-9) return "purple";

  const own = personal.get(run)?.[channel][index] ?? null;
  if (own === null) return "white";
  return time < own - 1e-9 ? "green" : "yellow";
}

/** Colour of sector `sector` (0–2) of a lap, judged when that sector was completed. */
export const sectorToneOf = (timeline: Timeline, run: Run, lapNumber: number, sector: 0 | 1 | 2) =>
  toneOf(timeline, run, lapNumber, sector);

/** Colour of a whole lap time: purple, green, or white (slower laps are not coloured). */
export function lapToneOf(timeline: Timeline, run: Run, lapNumber: number): SectorTone {
  const tone = toneOf(timeline, run, lapNumber, LAP_CHANNEL);
  return tone === "purple" || tone === "green" ? tone : "white";
}

/**
 * Which sectors of a lap in progress are finished `elapsed` seconds in, the one being driven, how
 * far each sector is filled (0..1), and how long each takes (for proportional bars).
 */
export function sectorProgress(
  lap: RunLap,
  elapsed: number,
  shares: readonly number[],
): {
  done: boolean[];
  current: number;
  times: (number | null)[];
  fill: number[];
  durations: number[];
} {
  const times = SECTOR_TIME_KEYS.map((key) => lap[key]);
  const known = times.every((time) => time !== null);
  const total = lap.lap_time_sec ?? 90;
  const bounds = known
    ? times.reduce<number[]>((acc, time) => [...acc, (acc.at(-1) ?? 0) + (time as number)], [])
    : shares.reduce<number[]>((acc, share) => [...acc, (acc.at(-1) ?? 0) + share * total], []);
  const done = bounds.map((bound, k) => k < 2 && elapsed >= bound);
  const current = done.findIndex((d) => !d);
  const durations = bounds.map((bound, k) => Math.max(0.001, bound - (bounds[k - 1] ?? 0)));
  const fill = bounds.map((bound, k) => {
    const start = bounds[k - 1] ?? 0;
    return Math.min(1, Math.max(0, (elapsed - start) / (bound - start || 1)));
  });
  return { done, current: current < 0 ? 2 : current, times, fill, durations };
}

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

export type NoForecast = {
  kind: NoForecastKind;
  /** Two or three words: what is going on. */
  title: string;
  /** One plain sentence: why that means no forecast. */
  text: string;
  /** Warm-up only: clean laps in a row so far, and how many are needed. */
  progress?: { have: number; need: number };
};

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
    return { kind: "edge", title: "Race start", text: "The first 2 laps of a race are not forecast." };
  }
  if (lap.lap_number >= totalLaps) {
    return { kind: "edge", title: "Final lap", text: "The last lap of a race is not forecast." };
  }
  switch (lap.flag) {
    case "PIT OUT":
      return {
        kind: "pit",
        title: "Out-lap",
        text: "Leaving the pits makes this lap too slow to forecast.",
      };
    case "PIT IN":
      return {
        kind: "pit",
        title: "In-lap",
        text: "Entering the pits makes this lap too slow to forecast.",
      };
    case "SC":
    case "VSC":
    case "RED":
      return {
        kind: "neutralised",
        title: EVENT[lap.flag].name,
        text: "The field is slowed down, so this lap is not forecast.",
      };
    case "YEL":
      return {
        kind: "neutralised",
        title: "Yellow flag",
        text: "Drivers slow down under a yellow flag, so this lap is not forecast.",
      };
  }
  if (lap.is_deleted) {
    return {
      kind: "invalid",
      title: "Lap time deleted",
      text: "The stewards deleted this lap time, so it is not used.",
    };
  }
  if (lap.lap_time_sec === null || lap.is_accurate === false) {
    return {
      kind: "invalid",
      title: "Timing not reliable",
      text: "This lap time was not recorded accurately, so it is not used.",
    };
  }
  if (lap.rainfall === true) {
    return {
      kind: "rain",
      title: "Rain on track",
      text: "Rain was recorded, so this lap is not forecast.",
    };
  }
  if (!isGreen(lap)) {
    return {
      kind: "neutralised",
      title: "Not a green-flag lap",
      text: "Only laps under green flags are forecast.",
    };
  }
  if ([1, 2].some((back) => index - back >= 0 && !isGreen(run.laps[index - back]))) {
    return {
      kind: "restart",
      title: "Restart",
      text: "The 2 laps after a Safety Car, VSC or flag are skipped.",
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
    return {
      kind: "telemetry",
      title: "Car data missing",
      text: "The telemetry for this lap is missing or incomplete.",
    };
  }
  if (lap.stint === null || lap.compound === null || lap.tyre_life === null) {
    return {
      kind: "tyre-data",
      title: "Tyre data missing",
      text: "The source data has no tyre information for this lap.",
    };
  }
  return null;
}

/** Why a lap has no forecast, in plain words. Use it only for laps without a stored forecast. */
export function noForecast(run: Run, lap: RunLap, totalLaps: number): NoForecast {
  const index = run.laps.findIndex((candidate) => candidate.lap_number === lap.lap_number);
  const missing: NoForecast = {
    kind: "other",
    title: "Not in the model output",
    text: "No forecast was stored for this lap.",
  };
  if (index < 0) return missing;

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
      title: "Warming up",
      text: `Needs ${FORECAST_WARMUP_LAPS} clean laps in a row on the same tyres (${streak} so far).`,
      progress: { have: streak, need: FORECAST_WARMUP_LAPS },
    };
  }
  return missing;
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
