import "server-only";
import { notFound } from "@/server/http";
import { resolveBaselineRun, resolveModelRun } from "@/server/models/service";
import { getCircuits, getDrivers, getTeams } from "@/server/reference/repository";
import { omit } from "@/lib/collections";
import { getLivePredictions } from "@/server/inference/client";
import { assembleRaceDetail } from "./assemble";
import { buildMetrics } from "./metrics";
import { getRaceBundle, getRaces, getRunFactors, getRunPredictions } from "./repository";
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

async function loadRace(raceId: number, modelRunId?: number) {
  const race = (await getRaceCatalog()).find((candidate) => candidate.race_id === raceId);
  if (!race) throw notFound("Race");

  const model = await resolveModelRun(modelRunId);
  const [bundle, teams, drivers] = await Promise.all([
    getRaceBundle(raceId, model?.id),
    getTeams(),
    getDrivers(),
  ]);
  return { race, model, bundle, teams, drivers };
}

export async function getRaceDetail(raceId: number, modelRunId?: number): Promise<RaceDetail> {
  const input = await loadRace(raceId, modelRunId);
  const baseline = input.model && (await resolveBaselineRun(input.model));
  const baselinePredictions = baseline ? await getRunPredictions(raceId, baseline.id) : [];
  // The deployed model is the final LSTM of the notebook: only that run is served live.
  const live = input.model?.purpose === "final" && input.model.model_type === "LSTM";
  const livePredictions = live ? await getLivePredictions(raceId) : null;
  const bundle = livePredictions ? { ...input.bundle, predictions: livePredictions } : input.bundle;
  const metrics = buildMetrics(bundle.laps, bundle.predictions, baselinePredictions);
  return assembleRaceDetail({
    ...input,
    bundle,
    metrics,
    predictionSource: livePredictions ? "inference_api" : "database",
  });
}

/** Feature-group split of every stored prediction of the run on this race; empty when none exists. */
export async function getRaceFactors(raceId: number, modelRunId?: number) {
  const model = await resolveModelRun(modelRunId);
  const factors = model ? await getRunFactors(raceId, model.id) : [];
  return { model_run_id: model?.id ?? null, factors };
}

/** Lighter than `getRaceDetail`: no baseline lookup or metrics. */
export async function getRaceSummary(raceId: number): Promise<RaceSummary> {
  const input = await loadRace(raceId);
  return summarizeRace(assembleRaceDetail({ ...input, metrics: [] }));
}
