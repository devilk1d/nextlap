import type { Compound } from "@/server/db/schema";
import { isCleanLap } from "@/lib/race/lap-flags";
import { linearFit, mean, median, present } from "@/lib/stats";
import type { Car, Lap, RaceDetail, RaceSummary } from "./types";

const DRY: Compound[] = ["SOFT", "MEDIUM", "HARD"];

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

/** Times a different car led at the end of a lap than at the end of the previous one. */
function leadChanges(laps: Lap[], cars: Car[]) {
  const leaderByLap = new Map<number, string>();
  for (const car of cars) {
    for (const lap of car.laps) if (lap.position === 1) leaderByLap.set(lap.lap_number, car.driver_code);
  }
  const order = [...leaderByLap.keys()].sort((a, b) => a - b);
  return order.filter((lap, i) => i > 0 && leaderByLap.get(lap) !== leaderByLap.get(order[i - 1])).length;
}

/** Positions gained on track: lap-to-lap improvements on racing laps (pit, start and flag laps excluded). */
function positionsGained(cars: Car[]) {
  let gained = 0;
  for (const car of cars) {
    car.laps.forEach((lap, i) => {
      const previous = car.laps[i - 1];
      if (!previous || !isCleanLap(lap) || lap.position === null || previous.position === null) return;
      gained += Math.max(0, previous.position - lap.position);
    });
  }
  return gained;
}

function degradation(laps: Lap[]): RaceSummary["degradation"] {
  const result: RaceSummary["degradation"] = {};
  for (const compound of DRY) {
    const fit = linearFit(
      laps
        .filter((lap) => isCleanLap(lap) && lap.compound === compound && lap.tyre_life !== null)
        .map((lap) => ({ x: lap.tyre_life as number, y: lap.lap_time_sec as number })),
    );
    if (fit) result[compound] = { slope: fit.slope, laps: fit.n };
  }
  return result;
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
  const stopsDistribution: Record<string, number> = {};
  for (const count of stops) {
    const key = count >= 3 ? "3+" : String(count);
    stopsDistribution[key] = (stopsDistribution[key] ?? 0) + 1;
  }
  const topTenPace = cars
    .filter((car) => car.finish_position !== null && car.finish_position <= 10)
    .map((car) => median(car.laps.filter(isCleanLap).map((lap) => lap.lap_time_sec as number)))
    .filter(present);

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
    stops_distribution: stopsDistribution,
    dnf_count: cars.filter(retired).length,
    lead_changes: leadChanges(laps, cars),
    positions_gained: positionsGained(cars),
    top10_median_lap_sec: median(topTenPace),
    incidents: {
      safety_car: countPeriods(laps, (lap) => lap.is_safety_car),
      vsc: countPeriods(laps, (lap) => lap.is_vsc),
      yellow: countPeriods(laps, (lap) => lap.is_yellow),
      red_flag: countPeriods(laps, (lap) => lap.is_red_flag),
    },
    mean_track_temp_c: mean(laps.map((lap) => lap.track_temp).filter(present)),
    mean_air_temp_c: mean(laps.map((lap) => lap.air_temp).filter(present)),
    compound_share: compoundShare(laps),
    degradation: degradation(laps),
    results: cars.map((car) => ({
      driver_code: car.driver_code,
      driver_name: car.driver_name,
      team_color: car.team_color,
      finish_position: car.finish_position,
      classified_position: car.classified_position,
    })),
  };
}
