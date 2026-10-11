import type { Lap } from "@/server/races/types";
import type { NeutralisedKind } from "./constants";

export type LapFlag = "START" | "PIT IN" | "PIT OUT" | NeutralisedKind;

/** Why a lap is not representative racing pace, or null for a normal racing lap. */
export function flagOf(
  lap: Pick<
    Lap,
    | "lap_number"
    | "is_out_lap"
    | "is_in_lap"
    | "is_safety_car"
    | "is_vsc"
    | "is_red_flag"
    | "is_yellow"
  >,
): LapFlag | null {
  if (lap.lap_number === 1) return "START";
  if (lap.is_out_lap) return "PIT OUT";
  if (lap.is_in_lap) return "PIT IN";
  if (lap.is_safety_car) return "SC";
  if (lap.is_vsc) return "VSC";
  if (lap.is_red_flag) return "RED";
  if (lap.is_yellow) return "YEL";
  return null;
}

/** Racing lap with a valid time: the laps used for pace, bests and trends. */
export const isCleanLap = (
  lap: Parameters<typeof flagOf>[0] & Pick<Lap, "lap_time_sec" | "is_deleted">,
) => flagOf(lap) === null && lap.lap_time_sec !== null && !lap.is_deleted;
