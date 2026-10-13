import lanes from "@/data/pit-lanes.json";
import type { Lap } from "@/server/races/types";
import { clamp } from "@/lib/stats";
import { pointAt, tangentAt, trackKey, type Point, type TrackPath } from "./track";

/**
 * Pit lane of a circuit, estimated from its recorded pit stops (`scripts/build_pit_lanes.py`).
 * `entry` and `exit` are the lane length before and after the start/finish line as a share of the
 * lap; `driveS` is the time to drive the lane without stopping.
 */
export type PitLaneSpec = {
  entry: number;
  exit: number;
  driveS: number;
  kmh: number;
  lengthM: number;
  stops: number;
};

const LANES = lanes as unknown as Record<string, PitLaneSpec>;

export const pitLaneFor = (circuitShortName: string): PitLaneSpec | null =>
  LANES[trackKey(circuitShortName)] ?? null;

/** One pit stop in race seconds: entry line, timing line, exit line, and the two laps around it. */
export type PitStop = {
  /** In-lap number. */
  lap: number;
  /** Start of the in-lap, end of the in-lap (timing line), end of the out-lap. */
  start: number;
  tLine: number;
  end: number;
  /** Crossing of the pit entry and pit exit lines. */
  tIn: number;
  tOut: number;
};

type StopLap = Pick<Lap, "is_in_lap" | "is_out_lap" | "pit_in_time_sec" | "pit_out_time_sec">;

/** Pit stops of one run; `cum[n]` is the race time at which lap n ends. */
export function pitStopsOf(laps: StopLap[], cum: number[], raceStart: number): PitStop[] {
  const stops: PitStop[] = [];
  laps.forEach((lap, i) => {
    const next = laps[i + 1];
    if (!lap.is_in_lap || !next?.is_out_lap) return;
    if (lap.pit_in_time_sec == null || next.pit_out_time_sec == null) return;
    const stop: PitStop = {
      lap: i + 1,
      start: cum[i],
      tLine: cum[i + 1],
      end: cum[i + 2],
      tIn: lap.pit_in_time_sec - raceStart,
      tOut: next.pit_out_time_sec - raceStart,
    };
    const ordered =
      stop.end !== undefined &&
      stop.start <= stop.tIn &&
      stop.tIn <= stop.tLine &&
      stop.tLine <= stop.tOut &&
      stop.tOut <= stop.end;
    if (ordered) stops.push(stop);
  });
  return stops;
}

export type PitPhase = "entering" | "in" | "exiting";

export const PIT_PHASE_LABEL: Record<PitPhase, string> = {
  entering: "Entering pit lane",
  in: "In the pit lane",
  exiting: "Exiting pit lane",
};

/** How long the entering and exiting badges are held (shortened for very short windows). */
const BADGE_SECONDS = 3;
/** A stationary stretch shorter than this is not drawn as a stop. */
const MIN_HOLD_SECONDS = 0.5;

/** Phase of a stop at race time `t`: null outside it. The exiting badge outlasts the exit line. */
function phaseAt(stop: PitStop, t: number): PitPhase | null {
  const window = stop.tOut - stop.tIn;
  const badge = Math.min(BADGE_SECONDS, window / 4);
  if (t < stop.tIn || t > stop.tOut + BADGE_SECONDS) return null;
  if (t < stop.tIn + badge) return "entering";
  if (t < stop.tOut - badge) return "in";
  return "exiting";
}

type Knot = { t: number; u: number };

/**
 * Where the car is along the lane (0 = entry line, 1 = exit line) over time. It passes the timing
 * line at its recorded time; time beyond what driving the lane takes is spent stopped in the
 * middle of the part of the lane where it was lost.
 */
function laneKnots(stop: PitStop, lane: PitLaneSpec): Knot[] {
  const total = lane.entry + lane.exit;
  const line = total > 0 ? lane.entry / total : 0.5;
  const before = stop.tLine - stop.tIn;
  const after = stop.tOut - stop.tLine;
  const holdBefore = Math.max(0, before - lane.driveS * line);
  const holdAfter = Math.max(0, after - lane.driveS * (1 - line));

  const knots: Knot[] = [{ t: stop.tIn, u: 0 }];
  if (holdBefore >= MIN_HOLD_SECONDS) {
    const arrive = stop.tIn + (before - holdBefore) / 2;
    knots.push({ t: arrive, u: line / 2 }, { t: arrive + holdBefore, u: line / 2 });
  }
  knots.push({ t: stop.tLine, u: line });
  if (holdAfter >= MIN_HOLD_SECONDS) {
    const arrive = stop.tLine + (after - holdAfter) / 2;
    const mid = line + (1 - line) / 2;
    knots.push({ t: arrive, u: mid }, { t: arrive + holdAfter, u: mid });
  }
  knots.push({ t: stop.tOut, u: 1 });
  return knots;
}

function laneProgress(knots: Knot[], t: number): number {
  for (let i = 1; i < knots.length; i += 1) {
    const a = knots[i - 1];
    const b = knots[i];
    if (t <= b.t) return a.u + ((b.u - a.u) * (t - a.t)) / (b.t - a.t || 1);
  }
  return 1;
}

export type PitState = {
  phase: PitPhase;
  /** Between the entry and the exit line. */
  inLane: boolean;
};

export type CarMarker = {
  /** Position on the outline, 0..1 from the start/finish line. */
  fraction: number;
  /** Progress along the pit lane while the car is in it, otherwise null. */
  lane: number | null;
};

/**
 * Pit state and display position of a car at race time `t`, or null when it is not in a stop.
 * With a known lane the car leaves the outline at the entry line, drives the lane, and is back on
 * the outline at the exit line, so the marker never jumps.
 */
export function pitAt(
  stops: PitStop[],
  t: number,
  lane: PitLaneSpec | null,
): { state: PitState | null; marker: CarMarker | null } | null {
  const stop = stops.find((s) => t >= s.start && t <= s.end);
  if (!stop) return null;
  const phase = phaseAt(stop, t);
  const state: PitState | null = phase
    ? { phase, inLane: t >= stop.tIn && t <= stop.tOut }
    : null;
  if (!lane) return { state, marker: null };

  const wrap = (f: number) => ((f % 1) + 1) % 1;
  if (t < stop.tIn) {
    const progress = (t - stop.start) / (stop.tIn - stop.start || 1);
    return { state, marker: { fraction: wrap(progress * (1 - lane.entry)), lane: null } };
  }
  if (t > stop.tOut) {
    const progress = (t - stop.tOut) / (stop.end - stop.tOut || 1);
    return {
      state,
      marker: { fraction: wrap(lane.exit + progress * (1 - lane.exit)), lane: null },
    };
  }
  const u = laneProgress(laneKnots(stop, lane), t);
  return {
    state,
    marker: { fraction: wrap(1 - lane.entry + u * (lane.entry + lane.exit)), lane: u },
  };
}

/** Share of the lane over which it merges with the track at each end. */
const MERGE = 0.16;

/** Which side of the track the lane is drawn on: towards the middle of the circuit. */
export function pitLaneSide(path: TrackPath): 1 | -1 {
  const cx = path.points.reduce((sum, [x]) => sum + x, 0) / path.points.length;
  const cy = path.points.reduce((sum, [, y]) => sum + y, 0) / path.points.length;
  const [sx, sy] = pointAt(path, 0);
  const [, , nx, ny] = tangentAt(path, 0);
  return (cx - sx) * nx + (cy - sy) * ny >= 0 ? 1 : -1;
}

/** Point on the lane at progress `u`, set `offset` away from the outline between the merges. */
export function pitLanePoint(path: TrackPath, lane: PitLaneSpec, u: number, offset: number): Point {
  const f = 1 - lane.entry + clamp(u, 0, 1) * (lane.entry + lane.exit);
  const [x, y] = pointAt(path, f);
  const [, , nx, ny] = tangentAt(path, f);
  const edge = Math.min(u, 1 - u) / MERGE;
  const ramp = clamp(edge, 0, 1);
  const eased = ramp * ramp * (3 - 2 * ramp);
  const d = pitLaneSide(path) * offset * eased;
  return [x + nx * d, y + ny * d];
}

/** SVG path of the lane. */
export function pitLanePath(path: TrackPath, lane: PitLaneSpec, offset: number, samples = 32) {
  const points = Array.from({ length: samples + 1 }, (_, i) =>
    pitLanePoint(path, lane, i / samples, offset),
  );
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}`;
}
