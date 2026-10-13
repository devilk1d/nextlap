import "server-only";
import { cacheLife } from "next/cache";
import { parseLivePredictions } from "./parse";

const TIMEOUT_MS = 10_000;

async function fetchPredictions(baseUrl: string, raceId: number) {
  "use cache";
  cacheLife("hours");
  // A thrown error is not cached, so a failed call is retried on the next request.
  const response = await fetch(`${baseUrl}/v1/races/${raceId}/predictions`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Inference API answered ${response.status}`);
  const rows = parseLivePredictions(await response.json());
  if (!rows) throw new Error("Inference API returned no usable forecasts");
  return rows;
}

/**
 * Forecasts of the deployed model (`inference/`, FastAPI) for one race, or null when the service
 * is not configured, slow or unreachable: the caller then uses the stored predictions.
 */
export async function getLivePredictions(raceId: number) {
  const baseUrl = process.env.INFERENCE_API_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;
  try {
    return await fetchPredictions(baseUrl, raceId);
  } catch {
    return null;
  }
}
