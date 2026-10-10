import { handle } from "@/server/http";
import { listModelRuns } from "@/server/models/service";

// GET /api/models
export const GET = handle(async () => listModelRuns());
