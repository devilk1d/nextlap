import { handle, parse, queryOf } from "@/server/http";
import { raceFilter } from "@/server/races/schema";
import { listRaces } from "@/server/races/service";

// GET /api/races?year=2024&circuit_key=63
export const GET = handle(async (request) =>
  listRaces(parse(raceFilter, queryOf(request))),
);
