import { handle, parse, queryOf } from "@/server/http";
import { raceParams, raceQuery } from "@/server/races/schema";
import { getRaceDetail } from "@/server/races/service";

// GET /api/races/:raceId?model_run_id=1
export const GET = handle(
  async (request, ctx: RouteContext<"/api/races/[raceId]">) => {
    const { raceId } = parse(raceParams, await ctx.params);
    const { model_run_id } = parse(raceQuery, queryOf(request));
    return getRaceDetail(raceId, model_run_id);
  },
);
