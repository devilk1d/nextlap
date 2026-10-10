import { listCircuits } from "@/server/circuits/service";
import { handle } from "@/server/http";

// GET /api/circuits
export const GET = handle(async () => listCircuits());
