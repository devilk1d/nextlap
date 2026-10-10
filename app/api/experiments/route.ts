import { handle, parse, queryOf } from "@/server/http";
import { experimentFilter } from "@/server/models/schema";
import { listExperiments } from "@/server/models/service";

// GET /api/experiments?scheme=unseen&model_type=LSTM
export const GET = handle(async (request) =>
  listExperiments(parse(experimentFilter, queryOf(request))),
);
