import "server-only";
import { notFound } from "@/server/http";
import { resolveModelRun } from "@/server/models/service";
import { getCircuits, getDrivers, getTeams } from "@/server/reference/repository";
import { omit } from "@/server/utils";
import { assembleRaceDetail } from "./assemble";
import { getPredictionMetrics, getRaceBundle, getRaces } from "./repository";
import type { RaceFilter } from "./schema";
import { summarizeRace } from "./summary";
import type { RaceDetail, RaceInfo, RaceSummary } from "./types";

async function getRaceCatalog(): Promise<RaceInfo[]> {
  const [races, circuits] = await Promise.all([getRaces(), getCircuits()]);
  const circuitByKey = new Map(circuits.map((circuit) => [circuit.circuit_key, circuit]));
  return races.map((race) => {
    const circuit = circuitByKey.get(race.circuit_key);
    if (!circuit) {
      throw new Error(`Race ${race.race_id} references unknown circuit ${race.circuit_key}`);
    }
    return {
      ...omit(race, "is_wet", "is_predictable"),
      predictable: race.exclusion_reason === null,
      circuit,
    };
  });
}

export async function listRaces({ year, circuit_key }: RaceFilter = {}): Promise<RaceInfo[]> {
  const catalog = await getRaceCatalog();
  return catalog.filter(
    (race) =>
      (year === undefined || race.year === year) &&
      (circuit_key === undefined || race.circuit_key === circuit_key),
  );
}

export async function getRaceDetail(raceId: number, modelRunId?: number): Promise<RaceDetail> {
  const race = (await getRaceCatalog()).find((candidate) => candidate.race_id === raceId);
  if (!race) throw notFound("Race");

  const model = await resolveModelRun(modelRunId);
  const [bundle, metrics, teams, drivers] = await Promise.all([
    getRaceBundle(raceId, model?.id),
    model ? getPredictionMetrics(raceId, model.id) : [],
    getTeams(),
    getDrivers(),
  ]);

  return assembleRaceDetail({ race, model, bundle, metrics, teams, drivers });
}

export async function getRaceSummary(raceId: number): Promise<RaceSummary> {
  return summarizeRace(await getRaceDetail(raceId));
}
