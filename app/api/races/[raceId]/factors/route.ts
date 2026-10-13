import { handle, parse, queryOf } from "@/server/http";
import { raceParams, raceQuery } from "@/server/races/schema";
import { getRaceFactors } from "@/server/races/service";

// GET /api/races/:raceId/factors?model_run_id=43
export const GET = handle(
  async (request, ctx: RouteContext<"/api/races/[raceId]/factors">) => {
    const { raceId } = parse(raceParams, await ctx.params);
    const { model_run_id } = parse(raceQuery, queryOf(request));
    return getRaceFactors(raceId, model_run_id);
  },
);
