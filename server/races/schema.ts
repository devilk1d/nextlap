import { z } from "zod";
import { positiveInt } from "@/server/http";

export const raceFilter = z.object({
  year: positiveInt.optional(),
  circuit_key: positiveInt.optional(),
});

export const raceParams = z.object({ raceId: positiveInt });

export const raceQuery = z.object({ model_run_id: positiveInt.optional() });

export type RaceFilter = z.infer<typeof raceFilter>;
