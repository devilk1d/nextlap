import "server-only";
import { notFound } from "@/server/http";
import type { ExperimentFilter } from "./schema";
import { getExperimentResults, getModelRuns } from "./repository";

export type ModelRun = Awaited<ReturnType<typeof getModelRuns>>[number];

export const listModelRuns = getModelRuns;

/** The requested run, or the default run (null when none is flagged as default). */
export async function resolveModelRun(id?: number): Promise<ModelRun | null> {
  const runs = await getModelRuns();
  if (id === undefined) return runs.find((run) => run.is_default) ?? null;
  const run = runs.find((candidate) => candidate.id === id);
  if (!run) throw notFound("Model run");
  return run;
}

/** Mean-3 run evaluated under the same protocol (purpose and scheme) as `model`. */
export async function resolveBaselineRun(model: ModelRun): Promise<ModelRun | null> {
  if (model.model_type === "Mean-3") return model;
  const runs = await getModelRuns();
  return (
    runs.find(
      (run) =>
        run.model_type === "Mean-3" && run.purpose === model.purpose && run.scheme === model.scheme,
    ) ?? null
  );
}

export async function listExperiments({ scheme, model_type }: ExperimentFilter) {
  const results = await getExperimentResults();
  return results.filter(
    (row) =>
      (scheme === undefined || row.scheme === scheme) &&
      (model_type === undefined || row.model_type === model_type),
  );
}
