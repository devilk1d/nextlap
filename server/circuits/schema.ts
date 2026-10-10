import { z } from "zod";
import { positiveInt } from "@/server/http";

export const circuitParams = z.object({ circuitKey: positiveInt });
