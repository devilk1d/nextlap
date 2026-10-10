import { circuitParams } from "@/server/circuits/schema";
import { getCircuitHistory } from "@/server/circuits/service";
import { handle, parse } from "@/server/http";

// GET /api/circuits/:circuitKey/history
export const GET = handle(
  async (_request, ctx: RouteContext<"/api/circuits/[circuitKey]/history">) => {
    const { circuitKey } = parse(circuitParams, await ctx.params);
    return getCircuitHistory(circuitKey);
  },
);
