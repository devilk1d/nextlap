import type { NeutralisedKind } from "./constants";
import type { RunLap, Timeline } from "./timeline";

const RANK: Record<NeutralisedKind, number> = { RED: 0, SC: 1, VSC: 2, YEL: 3 };

const kindOf = (lap: RunLap): NeutralisedKind | null =>
  lap.is_red_flag
    ? "RED"
    : lap.is_safety_car
      ? "SC"
      : lap.is_vsc
        ? "VSC"
        : lap.is_yellow
          ? "YEL"
          : null;

const cache = new WeakMap<Timeline, Map<number, NeutralisedKind>>();

/** Race-wide track status per lap: the most severe status any car's lap carried. */
export function raceEventsByLap(timeline: Timeline): Map<number, NeutralisedKind> {
  const cached = cache.get(timeline);
  if (cached) return cached;
  const events = new Map<number, NeutralisedKind>();
  for (const run of timeline.runs) {
    for (const lap of run.laps) {
      const kind = kindOf(lap);
      const current = events.get(lap.lap_number);
      if (kind && (!current || RANK[kind] < RANK[current])) events.set(lap.lap_number, kind);
    }
  }
  cache.set(timeline, events);
  return events;
}

export type EventBand = { from: number; to: number; kind: NeutralisedKind };

/** Consecutive laps with the same status merged into bands. */
export function eventBands(events: Map<number, NeutralisedKind>, totalLaps: number): EventBand[] {
  const bands: EventBand[] = [];
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const kind = events.get(lap);
    if (!kind) continue;
    const last = bands.at(-1);
    if (last && last.kind === kind && last.to === lap - 1) last.to = lap;
    else bands.push({ from: lap, to: lap, kind });
  }
  return bands;
}
