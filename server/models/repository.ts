import "server-only";
import { cacheLife } from "next/cache";
import { db } from "@/server/db/client";
import { fetchAll, unwrap } from "@/server/db/query";

// `artifact_ref` is an internal storage path, so it is not selected.
export async function getModelRuns() {
  "use cache";
  cacheLife("hours");
  return unwrap(
    await db()
      .from("model_runs")
      .select(
        "id, name, purpose, scheme, model_type, feature_set, window_size, feature_names, hyperparams, notes, is_default, created_at",
      )
      .order("id"),
  );
}

export async function getExperimentResults() {
  "use cache";
  cacheLife("hours");
  return fetchAll((from, to) =>
    db().from("experiment_results").select("*").order("id").range(from, to),
  );
}
