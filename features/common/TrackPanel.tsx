import type { ReactNode } from "react";
import { CarMarkers, type MarkerHighlight } from "@/components/charts/CarMarkers";
import { TrackMap } from "@/components/charts/TrackMap";
import { SECTOR_COLORS } from "@/lib/race/constants";
import type { Frame } from "@/lib/race/timeline";
import type { TrackGeometry } from "@/lib/race/track";

type Props = {
  geometry: TrackGeometry | null;
  sectors: readonly number[];
  frame: Frame;
  totalLaps: number;
  highlight: Record<string, MarkerHighlight>;
  /** Sector colours / labels override (head-to-head dominance). */
  colors?: readonly string[];
  labels?: readonly string[];
  /** Chip in the top-left corner (opposite the leader chip). */
  topLeft?: ReactNode;
  /** Caption in the bottom-left corner; the map keeps clear of it. */
  footer?: ReactNode;
};

const FLOATING = "absolute rounded-lg border border-overlay bg-[rgba(22,22,25,.92)] px-2.5 py-1.5";

/** Track outline with live car markers, leader chip and a footer caption. */
export function TrackPanel({
  geometry,
  sectors,
  frame,
  totalLaps,
  highlight,
  colors = SECTOR_COLORS,
  labels,
  topLeft,
  footer,
}: Props) {
  const { leader } = frame;
  return (
    <div className="relative h-full min-h-[320px] wide:min-h-[200px]">
      {geometry ? (
        <TrackMap
          geometry={geometry}
          sectors={sectors}
          colors={colors}
          labels={labels}
          pitLane={frame.pitLane}
          bottomInset={footer ? 44 : 0}
        >
          {(scale, path) => (
            <CarMarkers
              standings={frame.standings}
              path={path}
              scale={scale}
              highlight={highlight}
              pitLane={frame.pitLane}
            />
          )}
        </TrackMap>
      ) : (
        <div className="grid h-full place-items-center text-center text-[12px] text-ink-mute">
          No track outline is available for this circuit.
        </div>
      )}
      {topLeft && <div className="absolute left-0 top-0">{topLeft}</div>}
      <div className={`${FLOATING} right-0 top-0 flex items-center gap-2`}>
        <span className="whitespace-nowrap text-[11.5px] text-ink-mute">Leader</span>
        <span className="whitespace-nowrap text-[12px] font-bold">
          {leader.done
            ? `${leader.run.driver_code} · finished`
            : `${leader.run.driver_code} · L${frame.leaderLap}/${totalLaps}`}
        </span>
      </div>
      {footer && (
        <div
          className={`${FLOATING} bottom-0 left-0 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px]`}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
