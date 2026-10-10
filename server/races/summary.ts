import type { Compound } from "@/server/db/schema";
import type { Car, Lap, RaceDetail, RaceSummary } from "./types";

const present = (value: number | null): value is number => value !== null;

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Counts runs of consecutive laps (across all cars) for which `flagged` holds. */
function countPeriods(laps: Lap[], flagged: (lap: Lap) => boolean | null) {
  const flaggedLaps = new Set(laps.filter(flagged).map((lap) => lap.lap_number));
  return [...flaggedLaps].filter((lapNumber) => !flaggedLaps.has(lapNumber - 1)).length;
}

function fastestLap(cars: Car[]): RaceSummary["fastest_lap"] {
  let best: RaceSummary["fastest_lap"] = null;
  for (const car of cars) {
    for (const lap of car.laps) {
      const time = lap.lap_time_sec;
      if (time === null || !lap.is_accurate || lap.is_deleted) continue;
      if (!best || time < best.lap_time_sec) {
        best = { driver_code: car.driver_code, lap_number: lap.lap_number, lap_time_sec: time };
      }
    }
  }
  return best;
}

function finishOf(car: Car) {
  const lap = car.laps.findLast((candidate) => candidate.lap_end_time_sec !== null);
  return lap?.lap_end_time_sec == null
    ? null
    : { lap: lap.lap_number, endSec: lap.lap_end_time_sec };
}

/** Gap at the line; only defined when both cars completed the same number of laps. */
function marginSec(winner: Car, runnerUp: Car) {
  const first = finishOf(winner);
  const second = finishOf(runnerUp);
  return first && second && first.lap === second.lap ? second.endSec - first.endSec : null;
}

function strategyOf(car: Car) {
  const seenStints = new Set<number>();
  const compounds: Compound[] = [];
  for (const { stint, compound } of car.laps) {
    if (stint === null || compound === null || seenStints.has(stint)) continue;
    seenStints.add(stint);
    compounds.push(compound);
  }
  return compounds;
}

function compoundShare(laps: Lap[]) {
  const counts: Partial<Record<Compound, number>> = {};
  let total = 0;
  for (const { compound } of laps) {
    if (compound === null) continue;
    counts[compound] = (counts[compound] ?? 0) + 1;
    total += 1;
  }
  return Object.fromEntries(
    Object.entries(counts).map(([compound, count]) => [compound, count / total]),
  );
}

/** Factual race aggregates (no modelling) for the overview and circuit-history views. */
export function summarizeRace({ race, cars }: RaceDetail): RaceSummary {
  const laps = cars.flatMap((car) => car.laps);
  const winner = cars.find((car) => car.finish_position === 1);
  const runnerUp = cars.find((car) => car.finish_position === 2);
  const pole = cars.find((car) => car.q_pos === 1);
  const retired = (car: Car) => car.classified_position === "R";
  const stops = cars
    .filter((car) => !retired(car) && car.laps.length > 0)
    .map((car) => Math.max(0, strategyOf(car).length - 1));

  return {
    race_id: race.race_id,
    year: race.year,
    event_name: race.event_name,
    event_date: race.event_date,
    predictable: race.predictable,
    winner: winner
      ? { driver_code: winner.driver_code, team: winner.team, grid_position: winner.grid_position }
      : null,
    pole: pole ? { driver_code: pole.driver_code, q_best_sec: pole.q_best_sec } : null,
    fastest_lap: fastestLap(cars),
    winning_margin_sec: winner && runnerUp ? marginSec(winner, runnerUp) : null,
    winning_strategy: winner ? strategyOf(winner) : [],
    avg_pit_stops: mean(stops),
    dnf_count: cars.filter(retired).length,
    incidents: {
      safety_car: countPeriods(laps, (lap) => lap.is_safety_car),
      vsc: countPeriods(laps, (lap) => lap.is_vsc),
      yellow: countPeriods(laps, (lap) => lap.is_yellow),
      red_flag: countPeriods(laps, (lap) => lap.is_red_flag),
    },
    mean_track_temp_c: mean(laps.map((lap) => lap.track_temp).filter(present)),
    mean_air_temp_c: mean(laps.map((lap) => lap.air_temp).filter(present)),
    compound_share: compoundShare(laps),
  };
}
