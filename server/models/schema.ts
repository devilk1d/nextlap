import { z } from "zod";

export const experimentFilter = z.object({
  scheme: z.enum(["seen", "unseen"]).optional(),
  model_type: z.enum(["LSTM", "GRU", "Naive-Last", "Mean-3"]).optional(),
});

export type ExperimentFilter = z.infer<typeof experimentFilter>;
