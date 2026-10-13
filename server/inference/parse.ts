import { z } from "zod";
import type { RaceBundle } from "@/server/races/types";

/** Response of `GET /v1/races/{id}/predictions` of the inference API (only the fields used here). */
const responseSchema = z.object({
  predictions: z.array(
    z.object({
      driver_code: z.string().length(3),
      lap_number: z.number().int().positive(),
      predicted_lap_time_sec: z.number().finite().nullable(),
    }),
  ),
  origin: z.enum(["in_sample", "validation"]),
});

/**
 * Forecasts of the inference API as stored-prediction rows, or null when the response is not
 * the expected shape or holds no forecast. Every row carries the origin of the race.
 */
export function parseLivePredictions(json: unknown): RaceBundle["predictions"] | null {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return null;
  const { origin, predictions } = parsed.data;
  const rows = predictions.flatMap((p) =>
    p.predicted_lap_time_sec === null
      ? []
      : [
          {
            driver_code: p.driver_code,
            lap_number: p.lap_number,
            predicted_lap_time_sec: p.predicted_lap_time_sec,
            origin,
          },
        ],
  );
  return rows.length ? rows : null;
}
