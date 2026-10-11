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

/** Stored predictions of one run on one race (primary-key prefix, so it stays fast). */
export async function getRunPredictions(raceId: number, modelRunId: number) {
  "use cache";
  cacheLife("hours");
  return fetchAll((from, to) =>
    db()
      .from("lap_predictions")
      .select("driver_code, lap_number, predicted_lap_time_sec, origin")
      .eq("race_id", raceId)
      .eq("model_run_id", modelRunId)
      .order("driver_code")
      .order("lap_number")
      .range(from, to),
  );
}
