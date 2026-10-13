import type { Compound } from "@/server/db/schema";
import { DRY_COMPOUNDS, type NeutralisedKind } from "@/lib/race/constants";
import { cleanLaps } from "@/lib/race/laps";
import type { Frame, RunLap, Standing, Timeline } from "@/lib/race/timeline";
import { linearFit, mean, median, type LineFit } from "@/lib/stats";
import { raceEventsByLap } from "@/lib/race/events";

/**
 * Fuel burn-off makes a car about this much quicker every lap (roughly 1.6 kg of fuel per lap at
 * 0.03 s/kg). It is an assumption, not measured: inside one stint, fuel and tyre age rise together
 * and cannot be told apart from lap times alone.
 */
export const FUEL_EFFECT_PER_LAP = 0.05;
/** Laps slower than this share of the stint's median are traffic or mistakes and are left out. */
const OUTLIER_RATIO = 1.07;
/** A stint needs this many laps to give a trend of its own. */
const MIN_STINT_LAPS = 6;

export type DegradationPoint = {
  code: string;
  stint: number;
  compound: Compound;
  age: number;
  lap: number;
  /** Lap time corrected to the same fuel load: raw time + FUEL_EFFECT_PER_LAP × lap number. */
  seconds: number;
};

/** Clean laps completed so far by every car, as (tyre age, fuel-corrected lap time) points. */
export function degradationPoints(frame: Frame): DegradationPoint[] {
  return frame.standings.flatMap((x) => {
    const laps = cleanLaps(x.run, x.completed).filter(
      (lap) => lap.compound !== null && lap.tyre_life !== null && lap.lap_time_sec !== null,
    );
    const byStint = new Map<number, RunLap[]>();
    for (const lap of laps)
      byStint.set(lap.stintIndex, [...(byStint.get(lap.stintIndex) ?? []), lap]);
    return [...byStint.entries()].flatMap(([stint, group]) => {
      const typical = median(group.map((lap) => lap.lap_time_sec as number)) ?? Infinity;
      return group
        .filter((lap) => (lap.lap_time_sec as number) <= typical * OUTLIER_RATIO)
        .map((lap) => ({
          code: x.run.driver_code,
          stint,
          compound: lap.compound as Compound,
          age: lap.tyre_life as number,
          lap: lap.lap_number,
          seconds: (lap.lap_time_sec as number) + FUEL_EFFECT_PER_LAP * lap.lap_number,
        }));
    });
  });
}

export type CompoundFits = Partial<Record<Compound, LineFit>>;

/**
 * Tyre wear per lap of tyre life: the slope of each driver's own stint (fuel-corrected), then the
 * median over stints. Pooling all cars would compare different drivers and cars with each other.
 * The drawn line has that slope and passes through the middle of the compound's points.
 */
export function compoundFits(points: DegradationPoint[]): CompoundFits {
  const fits: CompoundFits = {};
  for (const compound of DRY_COMPOUNDS) {
    const mine = points.filter((p) => p.compound === compound);
    const stints = new Map<string, DegradationPoint[]>();
    for (const p of mine)
      stints.set(`${p.code}:${p.stint}`, [...(stints.get(`${p.code}:${p.stint}`) ?? []), p]);
    const slopes = [...stints.values()]
      .filter((group) => group.length >= MIN_STINT_LAPS)
      .map(
        (group) =>
          linearFit(
            group.map((p) => ({ x: p.age, y: p.seconds })),
            MIN_STINT_LAPS,
          )?.slope,
      )
      .filter((slope): slope is number => slope !== undefined);
    const slope = median(slopes);
    if (slope === null || mine.length < MIN_STINT_LAPS) continue;
    const mx = mean(mine.map((p) => p.age)) ?? 0;
    const my = mean(mine.map((p) => p.seconds)) ?? 0;
    const ages = mine.map((p) => p.age);
    fits[compound] = {
      slope,
      intercept: my - slope * mx,
      n: mine.length,
      xMin: Math.min(...ages),
      xMax: Math.max(...ages),
    };
  }
  return fits;
}

export type PitStop = {
  lap: number;
  code: string;
  color: string;
  team: string;
  from: Compound | null;
  to: Compound | null;
  /** Laps run on the set that was taken off. */
  stintLaps: number;
  /** Pit-lane time: PitOutTime − PitInTime. */
  laneSeconds: number | null;
  /** In-lap + out-lap versus twice the driver's median clean lap. */
  lossSeconds: number | null;
  positionBefore: number | null;
  positionAfter: number | null;
  under: NeutralisedKind | null;
};

export function pitStops(frame: Frame, timeline: Timeline): PitStop[] {
  const events = raceEventsByLap(timeline);
  const stops: PitStop[] = [];
  for (const x of frame.standings) {
    const { run } = x;
    const reference = median(cleanLaps(run).map((lap) => lap.lap_time_sec as number));
    for (const stint of run.stints.slice(1)) {
      const inLap = run.laps[stint.start - 2];
      const outLap = run.laps[stint.start - 1];
      if (!inLap || !outLap || stint.start > x.completed) continue;
      const previous = run.stints[stint.index - 1];
      const lane =
        inLap.pit_in_time_sec !== null && outLap.pit_out_time_sec !== null
          ? outLap.pit_out_time_sec - inLap.pit_in_time_sec
          : null;
      stops.push({
        lap: inLap.lap_number,
        code: run.driver_code,
        color: run.color,
        team: run.team,
        from: previous.compound,
        to: stint.compound,
        stintLaps: previous.end - previous.start + 1,
        laneSeconds: lane,
        lossSeconds:
          reference !== null && inLap.lap_time_sec !== null && outLap.lap_time_sec !== null
            ? inLap.lap_time_sec + outLap.lap_time_sec - 2 * reference
            : null,
        positionBefore: run.laps[inLap.lap_number - 2]?.position ?? inLap.position,
        positionAfter: run.laps[outLap.lap_number]?.position ?? outLap.position,
        under: events.get(inLap.lap_number) ?? events.get(outLap.lap_number) ?? null,
      });
    }
  }
  return stops.sort((a, b) => a.lap - b.lap || (a.laneSeconds ?? 99) - (b.laneSeconds ?? 99));
}

export type CompoundRow = {
  compound: Compound;
  stints: number;
  averageLength: number | null;
  laps: number;
  slope: number | null;
};

export function compoundTable(
  frame: Frame,
  points: DegradationPoint[],
  fits: CompoundFits,
): CompoundRow[] {
  return DRY_COMPOUNDS.map((compound) => {
    const lengths = frame.standings.flatMap((x) =>
      x.run.stints
        .filter((s) => s.compound === compound && s.start <= x.completed)
        .map((s) => Math.min(s.end, x.completed) - s.start + 1),
    );
    const mine = points.filter((p) => p.compound === compound);
    return {
      compound,
      stints: lengths.length,
      averageLength: mean(lengths),
      laps: mine.length,
      slope: fits[compound]?.slope ?? null,
    };
  });
}

export type StintRow = {
  index: number;
  compound: Compound | null;
  start: number;
  end: number;
  laps: number;
  best: number | null;
  average: number | null;
  slope: number | null;
};

export function stintRows(x: Standing): StintRow[] {
  return x.run.stints
    .filter((s) => s.start <= x.completed + 1)
    .map((stint) => {
      const laps = cleanLaps(x.run, x.completed).filter(
        (l: RunLap) => l.stintIndex === stint.index,
      );
      const times = laps.map((l) => l.lap_time_sec as number);
      const fit = linearFit(
        laps
          .filter((l) => l.tyre_life !== null)
          .map((l) => ({
            x: l.tyre_life as number,
            y: (l.lap_time_sec as number) + FUEL_EFFECT_PER_LAP * l.lap_number,
          })),
      );
      return {
        index: stint.index,
        compound: stint.compound,
        start: stint.start,
        end: Math.min(stint.end, x.completed + 1),
        laps: laps.length,
        best: times.length ? Math.min(...times) : null,
        average: mean(times),
        slope: fit?.slope ?? null,
      };
    });
}
