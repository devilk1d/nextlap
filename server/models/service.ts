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

export async function listExperiments({ scheme, model_type }: ExperimentFilter) {
  const results = await getExperimentResults();
  return results.filter(
    (row) =>
      (scheme === undefined || row.scheme === scheme) &&
      (model_type === undefined || row.model_type === model_type),
  );
}
