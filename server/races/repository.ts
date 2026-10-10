import "server-only";
import { cacheLife } from "next/cache";
import { db } from "@/server/db/client";
import { fetchAll, unwrap } from "@/server/db/query";
import type { RaceBundle } from "./types";

export async function getRaces() {
  "use cache";
  cacheLife("hours");
  return fetchAll((from, to) =>
    db().from("races").select("*").order("year").order("round_number").range(from, to),
  );
}

/** Entries, laps, telemetry and predictions of one race in a single call (no 1000-row cut-off). */
export async function getRaceBundle(raceId: number, modelRunId?: number): Promise<RaceBundle> {
  "use cache";
  cacheLife("hours");
  const data = unwrap(
    await db().rpc("race_bundle", { p_race_id: raceId, p_model_run_id: modelRunId }),
  );
  const { entries, laps, predictions } = data as unknown as RaceBundle;
  return { entries, laps, predictions };
}

export async function getPredictionMetrics(raceId: number, modelRunId: number) {
  "use cache";
  cacheLife("hours");
  return unwrap(
    await db()
      .from("prediction_race_metrics")
      .select("origin, n_laps, rmse, mae, rmse_mean3")
      .eq("race_id", raceId)
      .eq("model_run_id", modelRunId)
      .order("origin"),
  );
}
