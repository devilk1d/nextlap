import type { Stint } from "@/lib/race/timeline";
import { tyreOf } from "@/lib/race/constants";
import { cn } from "./cn";

type Props = {
  stints: Stint[];
  totalLaps: number;
  /** Lap in progress: later stints are dimmed. */
  currentLap: number;
  /** Laps covered, fractional: position of the "now" marker. */
  distance: number;
  className?: string;
};

/** Full-race tyre strategy bar with a marker at the current race position. */
export function TyreStrip({ stints, totalLaps, currentLap, distance, className }: Props) {
  return (
    <div className={cn("relative mt-1.5 h-5 overflow-hidden rounded bg-well", className)}>
      {stints.map((stint) => {
        const tyre = tyreOf(stint.compound);
        return (
          <div
            key={stint.index}
            data-tip={`${tyre.name} · laps ${stint.start}–${stint.end}`}
            className="absolute inset-y-0 flex items-center border-r-2 border-panel pl-1.5 text-[10.5px] font-bold text-[#111]"
            style={{
              left: `${((stint.start - 1) / totalLaps) * 100}%`,
              width: `${((stint.end - stint.start + 1) / totalLaps) * 100}%`,
              background: tyre.color,
              opacity: stint.start <= currentLap ? 1 : 0.4,
            }}
          >
            {tyre.short}
          </div>
        );
      })}
      <div
        className="absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_0_1px_#111]"
        style={{ left: `${(distance / totalLaps) * 100}%` }}
      />
    </div>
  );
}
