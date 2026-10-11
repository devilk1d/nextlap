import { cleanLaps, fastest, SECTOR_TIME_KEYS } from "@/lib/race/laps";
import { gapSeconds, type Frame, type Run, type RunLap, type Standing } from "@/lib/race/timeline";
import { median } from "@/lib/stats";

const MUTED = "var(--color-ink-mute)";

export type Trend = { text: string; color: string; sub: string };

export type Battle = {
  a: Standing;
  b: Standing;
  colorA: string;
  colorB: string;
  front: Standing;
  back: Standing;
  /** Whole laps between the two cars (0 when on the same lap). */
  lapsApart: number;
  /** Seconds from `front` to `back` right now. */
  interval: number;
  trend: Trend;
  /** Gap at each lap line, positive when A is ahead. */
  gaps: { lap: number; seconds: number }[];
  /** Symmetric axis limit for the gap chart. */
  gapLimit: number;
  medianA: number | null;
  medianB: number | null;
};

const GAP_LIMITS = [2, 5, 10, 20, 40, 80, 160];

/** Both cars of a head-to-head share the team colour fallback to white when teammates. */
export const rivalColors = (a: Run, b: Run) =>
  [a.color, a.team === b.team ? "#ffffff" : b.color] as const;

function trendOf(
  gapAt: (completed: number) => number,
  completed: number,
  totalLaps: number,
  front: Run,
  back: Run,
  colors: { front: string; back: string },
): Trend {
  if (completed < 4) {
    return {
      text: "Trend after 4 laps",
      color: MUTED,
      sub: "Needs a few completed laps to read the battle.",
    };
  }
  const rate = (gapAt(completed) - gapAt(completed - 3)) / 3;
  const left = totalLaps - completed;
  if (rate < -0.05) {
    const closing = -rate;
    const catchIn = Math.ceil(gapAt(completed) / closing);
    const sub =
      left <= 0
        ? "Race over"
        : catchIn <= left
          ? `At this rate ${back.driver_code} catches ${front.driver_code} in ~${catchIn} laps (${left} to go).`
          : `Needs ${(gapAt(completed) / left).toFixed(2)} s/lap to catch before the flag.`;
    return {
      text: `${back.driver_code} closing ${closing.toFixed(2)} s/lap`,
      color: colors.back,
      sub,
    };
  }
  if (rate > 0.05) {
    return {
      text: `${front.driver_code} pulling away ${rate.toFixed(2)} s/lap`,
      color: colors.front,
      sub:
        left > 0
          ? `Projected gap at the flag: ~${(gapAt(completed) + rate * left).toFixed(1)} s.`
          : "Race over",
    };
  }
  return {
    text: "Gap stable",
    color: "var(--color-ink)",
    sub: "Within ±0.05 s/lap over the last 3 laps.",
  };
}

export function analyzeBattle(frame: Frame, totalLaps: number, a: Standing, b: Standing): Battle {
  const [colorA, colorB] = rivalColors(a.run, b.run);
  const aFront = a.position < b.position;
  const front = aFront ? a : b;
  const back = aFront ? b : a;
  const common = Math.min(a.completed, b.completed);

  const gapAtLap = (lap: number) => b.run.cum[lap] - a.run.cum[lap];
  const gaps = Array.from({ length: common }, (_, k) => ({ lap: k + 1, seconds: gapAtLap(k + 1) }));
  const peak = Math.max(0, ...gaps.map((g) => Math.abs(g.seconds)));
  const gapLimit = GAP_LIMITS.find((limit) => limit >= peak) ?? 160;
  const frontGap = (lap: number) => (aFront ? gapAtLap(lap) : -gapAtLap(lap));

  const medianOf = (x: Standing) =>
    median(cleanLaps(x.run, x.completed).map((l) => l.lap_time_sec as number));

  return {
    a,
    b,
    colorA,
    colorB,
    front,
    back,
    lapsApart: Math.floor(front.distance - back.distance),
    interval: gapSeconds(frame.time, front, back),
    trend: trendOf(frontGap, common, totalLaps, front.run, back.run, {
      front: aFront ? colorA : colorB,
      back: aFront ? colorB : colorA,
    }),
    gaps,
    gapLimit,
    medianA: medianOf(a),
    medianB: medianOf(b),
  };
}

/** Median clean-lap sector times of a car so far: [S1, S2, S3]. */
export function sectorMedians(x: Standing): (number | null)[] {
  const laps = cleanLaps(x.run, x.completed);
  return SECTOR_TIME_KEYS.map((key) =>
    median(laps.map((lap: RunLap) => lap[key]).filter((v): v is number => v !== null)),
  );
}

/** Laps (up to now) the car spent within one second of the car ahead. */
export const lapsInRange = (x: Standing) =>
  x.run.laps.filter(
    (lap) => lap.lap_number <= x.completed && lap.gap_ahead_sec !== null && lap.gap_ahead_sec < 1,
  ).length;

export const bestLapOf = (x: Standing) =>
  fastest(cleanLaps(x.run, x.completed))?.lap_time_sec ?? null;
