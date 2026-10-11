import type { PredictionOrigin } from "@/server/db/schema";
import { lapKey } from "./assemble";
import type { RaceBundle, RaceMetric } from "./types";

type Prediction = RaceBundle["predictions"][number];

/** Error of `predictions` against the actual lap times, grouped by prediction origin. */
function score(laps: RaceBundle["laps"], predictions: Prediction[]) {
  const actual = new Map(laps.map((lap) => [lapKey(lap.driver_code, lap.lap_number), lap.lap_time_sec]));
  const sums = new Map<PredictionOrigin, { n: number; squared: number; absolute: number }>();

  for (const p of predictions) {
    const time = actual.get(lapKey(p.driver_code, p.lap_number));
    if (time == null) continue;
    const error = p.predicted_lap_time_sec - time;
    const sum = sums.get(p.origin) ?? { n: 0, squared: 0, absolute: 0 };
    sum.n += 1;
    sum.squared += error ** 2;
    sum.absolute += Math.abs(error);
    sums.set(p.origin, sum);
  }

  return new Map(
    [...sums].map(([origin, { n, squared, absolute }]) => [
      origin,
      { n_laps: n, rmse: Math.sqrt(squared / n), mae: absolute / n },
    ]),
  );
}

/** Per-origin RMSE/MAE of the model, with the Mean-3 baseline RMSE on the same race. */
export function buildMetrics(
  laps: RaceBundle["laps"],
  predictions: Prediction[],
  baselinePredictions: Prediction[],
): RaceMetric[] {
  const baseline = score(laps, baselinePredictions);
  return [...score(laps, predictions)]
    .map(([origin, metric]) => ({ origin, ...metric, rmse_mean3: baseline.get(origin)?.rmse ?? null }))
    .sort((a, b) => a.origin.localeCompare(b.origin));
}
