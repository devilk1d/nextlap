import type { Compound } from "@/server/db/schema";
import type { Car, Lap, RaceDetail } from "@/server/races/types";
import { clamp, present } from "@/lib/stats";
import { NEUTRAL_COLOR } from "./constants";
import { flagOf, isCleanLap, type LapFlag } from "./lap-flags";

export type { LapFlag };

export type RunLap = Lap & {
  flag: LapFlag | null;
  /** Racing lap with a valid time: the laps used for pace, bests and charts. */
  clean: boolean;
  stintIndex: number;
};

export type Stint = {
  index: number;
  /** First and last lap number of the stint. */
  start: number;
  end: number;
  compound: Compound | null;
  /** False when the set had been used before (`fresh_tyre`). */
  fresh: boolean | null;
};

export type Run = Omit<Car, "laps"> & {
  name: string;
  color: string;
  retired: boolean;
  laps: RunLap[];
  /** Seconds since the start: cum[0] = 0, cum[n] = end of lap n. */
  cum: number[];
  stints: Stint[];
};

export type Timeline = {
  runs: Run[];
  byCode: Map<string, Run>;
  totalLaps: number;
  /** Seconds until the last car has finished. */
  end: number;
};

function buildStints(laps: Lap[]): { stints: Stint[]; indexOfLap: number[] } {
  const stints: Stint[] = [];
  const indexOfLap: number[] = [];
  let currentStint: number | null | undefined;
  for (const lap of laps) {
    if (!stints.length || (lap.stint !== null && lap.stint !== currentStint)) {
      stints.push({
        index: stints.length,
        start: lap.lap_number,
        end: lap.lap_number,
        compound: lap.compound,
        fresh: lap.fresh_tyre,
      });
      currentStint = lap.stint;
    }
    stints[stints.length - 1].end = lap.lap_number;
    indexOfLap.push(stints.length - 1);
  }
  return { stints, indexOfLap };
}

function buildRun(car: Car, raceStart: number): Run {
  const { stints, indexOfLap } = buildStints(car.laps);
  const laps = car.laps.map<RunLap>((lap, i) => {
    return {
      ...lap,
      flag: flagOf(lap),
      clean: isCleanLap(lap),
      stintIndex: indexOfLap[i],
    };
  });

  const cum = [0];
  for (const lap of laps) {
    const previous = cum[cum.length - 1];
    const end =
      lap.lap_end_time_sec !== null
        ? lap.lap_end_time_sec - raceStart
        : previous + (lap.lap_time_sec ?? 0);
    cum.push(Math.max(previous, end));
  }

  return {
    ...car,
    name: car.driver_name ?? car.driver_code,
    color: car.team_color ?? NEUTRAL_COLOR,
    retired: car.classified_position === "R",
    laps,
    cum,
    stints,
  };
}

/** Prepares every car of a race for time-based replay. Cars without laps are dropped. */
export function buildTimeline({ race, cars }: RaceDetail): Timeline {
  const withLaps = cars.filter((car) => car.laps.length > 0);
  const raceStart = Math.min(
    ...withLaps.map((car) => car.laps[0].lap_start_time_sec).filter(present),
  );
  const runs = withLaps.map((car) => buildRun(car, Number.isFinite(raceStart) ? raceStart : 0));
  return {
    runs,
    byCode: new Map(runs.map((run) => [run.driver_code, run])),
    totalLaps: race.total_laps,
    end: Math.max(0, ...runs.map((run) => run.cum[run.cum.length - 1])),
  };
}

/** Laps covered by a car at race time `t` (fractional). */
export function distanceAt(cum: number[], t: number): number {
  const last = cum.length - 1;
  if (t <= cum[0]) return 0;
  if (t >= cum[last]) return last;
  let i = 1;
  while (cum[i] < t) i += 1;
  return i - 1 + (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
}

/** Race time at which a car has covered `distance` laps. */
export function timeAt(cum: number[], distance: number): number {
  const last = cum.length - 1;
  if (distance <= 0) return cum[0];
  if (distance >= last) return cum[last];
  const i = Math.floor(distance);
  return cum[i] + (distance - i) * (cum[i + 1] - cum[i]);
}

export type Standing = {
  run: Run;
  /** Laps covered, fractional. */
  distance: number;
  /** Cum index of the final lap this car will run. */
  lapCount: number;
  done: boolean;
  retired: boolean;
  position: number;
  ahead: Standing | null;
  behind: Standing | null;
  /** Seconds to the car ahead / behind (null when none). */
  gapAhead: number | null;
  gapBehind: number | null;
  /** Whole laps between this car and the one ahead / behind (lapped traffic). */
  lapsAhead: number;
  lapsBehind: number;
  toLeader: number;
  lapsDown: number;
  /** Laps completed and the lap now in progress (1-based). */
  completed: number;
  currentLap: number;
  /** Progress through the current lap, 0..1. */
  fraction: number;
  lap: RunLap;
  pitStops: number;
  inPit: boolean;
};

type Position = { run: Run; distance: number; done: boolean; lapCount: number };

/** Seconds the car behind needs to reach the point the car in front is at, at race time `t`. */
export function gapSeconds(t: number, front: Position, behind: Position): number {
  const frontTime = front.done
    ? front.run.cum[front.lapCount]
    : front.distance <= 0
      ? front.run.cum[0]
      : t;
  return timeAt(behind.run.cum, front.distance) - frontTime;
}

export type Frame = {
  time: number;
  standings: Standing[];
  byCode: Map<string, Standing>;
  leader: Standing;
  leaderLap: number;
  finished: boolean;
};

/** Leader-relative standings of the whole field at race time `t`. */
export function frameAt(timeline: Timeline, t: number): Frame {
  const rows = timeline.runs
    .map((run) => {
      const lapCount = run.cum.length - 1;
      const distance = distanceAt(run.cum, t);
      const done = distance >= lapCount - 1e-9;
      return { run, lapCount, distance, done, retired: run.retired && done };
    })
    .sort(
      (a, b) =>
        Number(a.retired) - Number(b.retired) ||
        (a.retired && b.retired ? b.lapCount - a.lapCount : 0) ||
        (Math.abs(a.distance - b.distance) > 1e-9
          ? b.distance - a.distance
          : a.done
            ? a.run.cum[a.lapCount] - b.run.cum[b.lapCount]
            : (a.run.grid_position ?? 99) - (b.run.grid_position ?? 99)),
    );

  const gapBetween = (front: (typeof rows)[number], behind: (typeof rows)[number]) =>
    gapSeconds(t, front, behind);

  const lead = rows[0];
  const standings = rows.map<Standing>((row, i) => {
    const completed = Math.min(row.lapCount, Math.floor(row.distance));
    const currentLap = Math.max(1, Math.min(row.lapCount, completed + 1));
    const front = row.retired ? null : (rows[i - 1] ?? null);
    const back = row.retired || !rows[i + 1] || rows[i + 1].retired ? null : rows[i + 1];
    return {
      run: row.run,
      distance: row.distance,
      lapCount: row.lapCount,
      done: row.done,
      retired: row.retired,
      position: i + 1,
      ahead: null,
      behind: null,
      gapAhead: front ? gapBetween(front, row) : null,
      gapBehind: back ? gapBetween(row, back) : null,
      lapsAhead: front ? Math.floor(front.distance - row.distance) : 0,
      lapsBehind: back ? Math.floor(row.distance - back.distance) : 0,
      toLeader: i && !row.retired ? gapBetween(lead, row) : 0,
      lapsDown: Math.floor(lead.distance - row.distance),
      completed,
      currentLap,
      fraction: row.done ? 1 : row.distance - Math.floor(row.distance),
      lap: row.run.laps[currentLap - 1],
      pitStops: row.run.stints.filter((s) => s.index > 0 && s.start <= currentLap).length,
      inPit: false,
    };
  });

  standings.forEach((standing, i) => {
    standing.ahead = standing.retired ? null : (standings[i - 1] ?? null);
    const next = standings[i + 1];
    standing.behind = standing.retired || !next || next.retired ? null : next;
    const { lap, done, fraction } = standing;
    standing.inPit =
      !done &&
      ((lap.flag === "PIT IN" && fraction > 0.9) || (lap.flag === "PIT OUT" && fraction < 0.1));
  });

  const leader = standings[0];
  return {
    time: t,
    standings,
    byCode: new Map(standings.map((s) => [s.run.driver_code, s])),
    leader,
    leaderLap: Math.min(timeline.totalLaps, Math.floor(leader.distance) + 1),
    finished: t >= timeline.end - 0.01,
  };
}

/** Race time the replay opens at: shortly after the leader starts lap 40 % in. */
export function initialTime(timeline: Timeline): number {
  const lap = Math.round(timeline.totalLaps * 0.4);
  const leaderAt = Math.min(
    ...timeline.runs.filter((run) => run.cum.length > lap).map((run) => run.cum[lap]),
  );
  return clamp((Number.isFinite(leaderAt) ? leaderAt : 0) + 25, 0, timeline.end);
}

/** Race time of the previous (-1) or next (+1) lap boundary for a run. */
export function lapBoundary(run: Run, t: number, direction: -1 | 1): number {
  const d = distanceAt(run.cum, t);
  const i = Math.floor(d);
  const target = direction < 0 ? (d - i < 0.08 ? i - 1 : i) : i + 1;
  return run.cum[clamp(target, 0, run.cum.length - 1)] + 0.02;
}
