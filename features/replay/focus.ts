import { cleanLaps, fastest } from "@/lib/race/laps";
import type { RunLap, Standing, Stint } from "@/lib/race/timeline";

/** Everything the replay panels need to know about the focused driver at the current instant. */
export type Focus = {
  standing: Standing;
  /** Last fully completed lap, null before the first lap ends. */
  lastLap: RunLap | null;
  /** Lap in progress (or the final lap once finished). */
  currentLap: RunLap;
  stint: Stint;
  /** Clean laps completed so far and the best of them. */
  cleanDone: RunLap[];
  best: RunLap | null;
};

export function focusOf(standing: Standing): Focus {
  const { run, completed, lap } = standing;
  const cleanDone = cleanLaps(run, completed);
  return {
    standing,
    lastLap: completed >= 1 ? run.laps[completed - 1] : null,
    currentLap: lap,
    stint: run.stints[lap.stintIndex],
    cleanDone,
    best: fastest(cleanDone),
  };
}
