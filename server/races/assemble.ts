import type { DriverRow, TeamRow } from "@/server/db/schema";
import type { ModelRun } from "@/server/models/service";
import { groupBy, omit } from "@/lib/collections";
import type { Car, Lap, RaceBundle, RaceDetail, RaceInfo } from "./types";

/** Gap to the car ahead (s) under which a lap counts as dirty air; matches `dirty_air_gap` in the final run's hyperparams. */
export const DIRTY_AIR_GAP_SEC = 1;

type Input = {
  race: RaceInfo;
  model: ModelRun | null;
  bundle: RaceBundle;
  metrics: RaceDetail["metrics"];
  teams: TeamRow[];
  drivers: DriverRow[];
  predictionSource?: RaceDetail["prediction_source"];
};

export const lapKey = (driverCode: string, lapNumber: number) => `${driverCode}:${lapNumber}`;

function isDirtyAir(lap: RaceBundle["laps"][number]) {
  const neutralised = lap.is_safety_car || lap.is_vsc || lap.is_red_flag;
  return !neutralised && lap.gap_ahead_sec !== null && lap.gap_ahead_sec < DIRTY_AIR_GAP_SEC;
}

/** Joins entries, laps, telemetry and predictions into one cars → laps structure. */
export function assembleRaceDetail({
  race,
  model,
  bundle,
  metrics,
  teams,
  drivers,
  predictionSource = "database",
}: Input): RaceDetail {
  const teamByName = new Map(teams.map((team) => [team.name, team]));
  const nameByCode = new Map(drivers.map((driver) => [driver.code, driver.full_name]));
  const predictionByLap = new Map(
    bundle.predictions.map((p) => [lapKey(p.driver_code, p.lap_number), p]),
  );
  // Excluded races (wet / not modelled) expose results only.
  const lapsByDriver = groupBy(race.predictable ? bundle.laps : [], (lap) => lap.driver_code);

  const cars: Car[] = bundle.entries.map((entry) => {
    const team = teamByName.get(entry.team);
    const laps: Lap[] = (lapsByDriver.get(entry.driver_code) ?? []).map((lap) => {
      const prediction = predictionByLap.get(lapKey(lap.driver_code, lap.lap_number));
      return {
        ...omit(lap, "race_id", "driver_code"),
        dirty_air: isDirtyAir(lap),
        prediction: prediction
          ? { predicted_lap_time_sec: prediction.predicted_lap_time_sec, origin: prediction.origin }
          : null,
      };
    });
    return {
      ...omit(entry, "race_id"),
      driver_name: nameByCode.get(entry.driver_code) ?? null,
      team_code: team?.short_code ?? null,
      team_color: team?.color_hex ?? null,
      laps,
    };
  });

  return { race, model, metrics, cars, prediction_source: predictionSource };
}
