import type { Compound } from "@/server/db/schema";
import { EVENT, type NeutralisedKind } from "@/lib/race/constants";
import { eventBands, raceEventsByLap } from "@/lib/race/events";
import { fmtLap } from "@/lib/format";
import { SECTOR_TIME_KEYS } from "@/lib/race/laps";
import type { Run, RunLap, Timeline } from "@/lib/race/timeline";
import { linearFit, mean, median, present, quantileSorted, stdDev } from "@/lib/stats";

const max = (values: (number | null | undefined)[]) => {
  const present_ = values.filter(present);
  return present_.length ? Math.max(...present_) : null;
};

export type DriverRow = {
  run: Run;
  position: number | null;
  /** Laps behind the winner when finished on the lead lap count − 1. */
  lapsDown: number;
  finishSeconds: number;
  gapSeconds: number | null;
  retired: boolean;
  gained: number | null;
  best: number | null;
  bestLap: number | null;
  median: number | null;
  stdDev: number | null;
  /** Clean-lap times in lap order. */
  times: number[];
  pits: number;
  strategy: (Compound | null)[];
  led: number;
  traffic: number;
  drsLaps: number;
  top: number | null;
  i1: number | null;
  i2: number | null;
  fl: number | null;
  st: number | null;
  throttle: number | null;
  braking: number | null;
  shifts: number | null;
  sectorBests: (number | null)[];
  theoretical: number | null;
};

function rowOf(run: Run, winnerLaps: number, winnerFinish: number): DriverRow {
  const clean = run.laps.filter((lap) => lap.clean);
  const times = clean.map((lap) => lap.lap_time_sec as number);
  const lapCount = run.laps.length;
  const bestLap = clean.reduce<RunLap | null>(
    (best, lap) =>
      !best || (lap.lap_time_sec as number) < (best.lap_time_sec as number) ? lap : best,
    null,
  );
  const sectorBests = SECTOR_TIME_KEYS.map((key) => {
    const values = clean.map((lap) => lap[key]).filter(present);
    return values.length ? Math.min(...values) : null;
  });
  const finishSeconds = run.cum[lapCount];
  const lapsDown = Math.max(0, winnerLaps - lapCount);
  const started = clean.filter((lap) => lap.lap_number >= 2);
  const inTraffic = started.filter(
    (lap) => lap.gap_ahead_prev_sec !== null && lap.gap_ahead_prev_sec < 1,
  ).length;

  return {
    run,
    position: run.finish_position,
    lapsDown: run.retired ? 0 : lapsDown,
    finishSeconds,
    gapSeconds:
      !run.retired && lapsDown === 0 && run.finish_position !== 1
        ? finishSeconds - winnerFinish
        : null,
    retired: run.retired,
    gained:
      run.retired || run.grid_position === null || run.finish_position === null
        ? null
        : run.grid_position - run.finish_position,
    best: bestLap?.lap_time_sec ?? null,
    bestLap: bestLap?.lap_number ?? null,
    median: median(times),
    stdDev: stdDev(times),
    times,
    pits: run.stints.length - 1,
    strategy: run.stints.map((stint) => stint.compound),
    led: run.laps.filter((lap) => lap.position === 1).length,
    traffic: started.length ? (inTraffic / started.length) * 100 : 0,
    drsLaps: run.laps.filter((lap) => (lap.tel_n_drs_activations ?? 0) > 0).length,
    top: max(run.laps.map((lap) => lap.tel_speed_max)),
    i1: max(run.laps.map((lap) => lap.speed_i1)),
    i2: max(run.laps.map((lap) => lap.speed_i2)),
    fl: max(run.laps.map((lap) => lap.speed_fl)),
    st: max(run.laps.map((lap) => lap.speed_st)),
    throttle: mean(clean.map((lap) => lap.tel_pct_full_throttle).filter(present)),
    braking: mean(clean.map((lap) => lap.tel_pct_braking).filter(present)),
    shifts: mean(clean.map((lap) => lap.tel_n_gear_shifts).filter(present)),
    sectorBests,
    theoretical: sectorBests.every(present)
      ? (sectorBests as number[]).reduce((a, b) => a + b, 0)
      : null,
  };
}

/** One analysed row per driver, ordered by classification. */
export function driverRows(timeline: Timeline): DriverRow[] {
  const winner =
    timeline.runs.find((run) => run.finish_position === 1) ??
    [...timeline.runs].sort((a, b) => b.laps.length - a.laps.length)[0];
  const winnerLaps = winner.laps.length;
  const winnerFinish = winner.cum[winnerLaps];
  return timeline.runs
    .map((run) => rowOf(run, winnerLaps, winnerFinish))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
}

export type TeamPace = {
  team: string;
  color: string;
  median: number;
  q1: number;
  q3: number;
  laps: number;
};

/** Clean-lap pace per team, fastest first (no fuel correction). */
export function teamPace(rows: DriverRow[]): TeamPace[] {
  const byTeam = new Map<string, { color: string; times: number[] }>();
  for (const row of rows) {
    const entry = byTeam.get(row.run.team) ?? { color: row.run.color, times: [] };
    entry.times.push(
      ...row.run.laps
        .filter((lap) => lap.clean && lap.lap_number >= 2)
        .map((lap) => lap.lap_time_sec as number),
    );
    byTeam.set(row.run.team, entry);
  }
  return [...byTeam.entries()]
    .map(([team, { color, times }]) => {
      const sorted = [...times].sort((a, b) => a - b);
      return {
        team,
        color,
        median: quantileSorted(sorted, 0.5) as number,
        q1: quantileSorted(sorted, 0.25) as number,
        q3: quantileSorted(sorted, 0.75) as number,
        laps: sorted.length,
      };
    })
    .filter((team) => team.laps > 0)
    .sort((a, b) => a.median - b.median);
}

export type TrafficBin = { label: string; from: number; to: number; deltas: number[] };

const BINS: [number, number, string][] = [
  [0, 0.5, "< 0.5 s"],
  [0.5, 1, "0.5–1 s"],
  [1, 1.5, "1–1.5 s"],
  [1.5, 2, "1.5–2 s"],
  [2, 3, "2–3 s"],
  [3, Infinity, "> 3 s / clean air"],
];

/**
 * Lap-time loss by gap to the car ahead at the start of the lap, measured against the
 * driver's own clean-air trend in the same stint (tyre life absorbs fuel burn-off).
 */
export function trafficBins(timeline: Timeline): TrafficBin[] {
  const bins = BINS.map(([from, to, label]) => ({ from, to, label, deltas: [] as number[] }));
  for (const run of timeline.runs) {
    for (const stint of run.stints) {
      const laps = run.laps.filter(
        (lap) =>
          lap.stintIndex === stint.index &&
          lap.clean &&
          lap.lap_number >= 3 &&
          lap.tyre_life !== null,
      );
      const gap = (lap: RunLap) => lap.gap_ahead_prev_sec ?? 1e6;
      const clean = linearFit(
        laps
          .filter((lap) => gap(lap) >= 2)
          .map((lap) => ({ x: lap.tyre_life as number, y: lap.lap_time_sec as number })),
      );
      if (!clean) continue;
      for (const lap of laps) {
        const expected = clean.intercept + clean.slope * (lap.tyre_life as number);
        const bin = bins.find((b) => gap(lap) >= b.from && gap(lap) < b.to);
        bin?.deltas.push((lap.lap_time_sec as number) - expected);
      }
    }
  }
  return bins;
}

export type ControlEvent = { lap: number; order: number; text: string; color: string };

const MUTED = "var(--color-ink-mute)";

/** Chronological race-control feed: grid, flags, retirements, leaders, fastest laps, pit stops. */
export function raceControl(timeline: Timeline, rows: DriverRow[]): ControlEvent[] {
  const events: ControlEvent[] = [];

  for (const row of rows) {
    const { grid_position: grid, q_pos: qualified } = row.run;
    if (grid !== null && qualified !== null && grid !== qualified) {
      events.push({
        lap: 0,
        order: 0,
        text: `${row.run.driver_code} qualified P${qualified}, starts P${grid}`,
        color: MUTED,
      });
    }
  }

  for (const band of eventBands(raceEventsByLap(timeline), timeline.totalLaps)) {
    const span = band.from === band.to ? `lap ${band.from}` : `laps ${band.from}–${band.to}`;
    events.push({
      lap: band.from,
      order: band.from,
      text: `${EVENT[band.kind as NeutralisedKind].name} · ${span}`,
      color: EVENT[band.kind].color,
    });
  }

  for (const row of rows.filter((r) => r.retired)) {
    events.push({
      lap: row.run.laps.length + 1,
      order: row.run.laps.length + 0.95,
      text: `${row.run.driver_code} retires · ${row.run.status ?? "DNF"}`,
      color: "var(--color-stop)",
    });
  }

  let fastest = Infinity;
  for (let lap = 1; lap <= timeline.totalLaps; lap += 1) {
    for (const run of timeline.runs) {
      const entry = run.laps[lap - 1];
      if (!entry?.clean || (entry.lap_time_sec as number) >= fastest - 1e-9) continue;
      if (lap > 2) {
        events.push({
          lap,
          order: lap + 0.3,
          text: `${run.driver_code} sets fastest lap ${fmtLap(entry.lap_time_sec)}`,
          color: "var(--color-best)",
        });
      }
      fastest = entry.lap_time_sec as number;
    }
  }

  const leaderOf = (lap: number) =>
    timeline.runs.find((run) => run.laps[lap - 1]?.position === 1)?.driver_code ?? null;
  for (let lap = 2; lap <= timeline.totalLaps; lap += 1) {
    const now = leaderOf(lap);
    const before = leaderOf(lap - 1);
    if (now && before && now !== before) {
      events.push({
        lap,
        order: lap + 0.2,
        text: `${now} takes the lead from ${before}`,
        color: "var(--color-accent)",
      });
    }
  }

  const stopsByLap = new Map<number, string[]>();
  for (const run of timeline.runs) {
    for (const stint of run.stints.slice(1)) {
      const lap = stint.start - 1;
      stopsByLap.set(lap, [...(stopsByLap.get(lap) ?? []), run.driver_code]);
    }
  }
  for (const [lap, codes] of stopsByLap) {
    events.push({
      lap,
      order: lap + 0.1,
      text: `${codes.length} pit stop${codes.length > 1 ? "s" : ""} · ${codes.join(", ")}`,
      color: "var(--color-caution)",
    });
  }

  return events.sort((a, b) => a.order - b.order);
}
