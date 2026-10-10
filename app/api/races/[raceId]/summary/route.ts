import { handle, parse } from "@/server/http";
import { raceParams } from "@/server/races/schema";
import { getRaceSummary } from "@/server/races/service";

// GET /api/races/:raceId/summary
export const GET = handle(
  async (_request, ctx: RouteContext<"/api/races/[raceId]/summary">) => {
    const { raceId } = parse(raceParams, await ctx.params);
    return getRaceSummary(raceId);
  },
);
