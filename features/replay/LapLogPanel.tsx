"use client";

import { fmtLap, fmtSigned, fmtTimer } from "@/lib/format";
import {
  lapToneOf,
  sectorProgress,
  sectorShares,
  sectorToneOf,
  SECTOR_TIME_KEYS,
  SECTOR_TONE_COLOR,
  SECTOR_TONE_MEANING,
  type SectorTone,
} from "@/lib/race/laps";
import type { RunLap, Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import { useReplay } from "./store";
import type { Focus } from "./focus";

function positionText(lap: RunLap): string {
  if (lap.position === null) return "";
  return lap.driver_ahead && lap.gap_ahead_sec !== null
    ? `P${lap.position} · +${lap.gap_ahead_sec.toFixed(3)} to ${lap.driver_ahead}`
    : `P${lap.position} · Leading`;
}

function LogEntry({
  lap,
  tones,
  lapTone,
  tolerance,
  onSeek,
}: {
  lap: RunLap;
  tones: SectorTone[];
  lapTone: SectorTone;
  tolerance: number | null;
  onSeek: () => void;
}) {
  const predicted = lap.prediction?.predicted_lap_time_sec ?? null;
  const delta =
    predicted !== null && lap.lap_time_sec !== null ? lap.lap_time_sec - predicted : null;
  const inside = delta !== null && tolerance !== null ? Math.abs(delta) <= tolerance : null;

  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer border-l-2 border-transparent py-[9px] pl-3 pr-3.5"
      onClick={onSeek}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSeek();
        }
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] text-ink-mute">L{lap.lap_number}</span>
        <span
          className="font-mono text-[13.5px] font-semibold"
          style={{ color: lapTone === "white" ? undefined : SECTOR_TONE_COLOR[lapTone] }}
        >
          {fmtLap(lap.lap_time_sec)}
        </span>
        <span className="ml-auto text-[10.5px] font-bold tracking-[.06em] text-caution">
          {lap.flag ?? ""}
        </span>
      </div>
      <div className="mt-[3px] font-mono text-[11.5px] leading-[1.65] text-ink-mute">
        <div>
          {SECTOR_TIME_KEYS.map((key, i) => (
            <span key={key}>
              {i > 0 && "  "}S{i + 1}{" "}
              <span style={{ color: SECTOR_TONE_COLOR[tones[i]] }}>
                {lap[key]?.toFixed(3) ?? "——"}
              </span>
            </span>
          ))}
        </div>
        <div
          style={{
            color:
              lap.gap_ahead_sec !== null && lap.gap_ahead_sec < 1
                ? "var(--color-accent)"
                : undefined,
          }}
        >
          {positionText(lap)}
        </div>
        {predicted !== null && (
          <div>
            Pred {fmtLap(predicted)}{" "}
            {delta !== null && (
              <span
                style={{ color: inside === false ? "var(--color-caution)" : "var(--color-go)" }}
              >
                {fmtSigned(delta)} {inside === null ? "" : inside ? "within" : "outside"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToneLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-3.5 py-2 text-[10.5px] text-ink-mute">
      {(["purple", "green", "yellow", "white"] as const).map((tone) => (
        <span key={tone} title={SECTOR_TONE_MEANING[tone].text} className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ background: SECTOR_TONE_COLOR[tone] }} />
          {SECTOR_TONE_MEANING[tone].name}
        </span>
      ))}
    </div>
  );
}

type Props = { x: Standing; focus: Focus; time: number };

/** Every lap of the focused driver with sector colours, position and forecast result. */
export function LapLogPanel({ x, focus, time }: Props) {
  const seek = useReplay((s) => s.seek);
  const { timeline, detail } = useRace();
  const tolerance = detail.metrics[0]?.rmse ?? null;
  const { run, completed, currentLap, done } = x;
  const elapsed = Math.max(0, time - run.cum[currentLap - 1]);
  const progress = sectorProgress(focus.currentLap, elapsed, sectorShares(timeline));
  const predicted = focus.currentLap.prediction?.predicted_lap_time_sec;

  return (
    <>
      <div className="flex-none border-b border-divider px-3.5 py-2.5 text-[12px] font-semibold">
        Lap log
      </div>
      <div className="min-h-[200px] flex-1 overflow-auto py-1 max-[1179px]:max-h-[420px]">
        {!done && (
          <div className="border-l-2 border-accent bg-accent/8 py-[9px] pl-3 pr-3.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] text-ink-mute">L{currentLap}</span>
              <span className="font-mono text-[13.5px] font-semibold text-accent">
                {fmtTimer(elapsed)}
              </span>
              <span className="ml-auto text-[10.5px] font-bold tracking-[.06em] text-accent">
                IN PROGRESS
              </span>
            </div>
            <div className="mt-[3px] font-mono text-[11.5px] leading-[1.65] text-ink-mute">
              <div>
                {SECTOR_TIME_KEYS.map((key, i) => {
                  const finished = progress.done[i];
                  const tone = finished
                    ? sectorToneOf(timeline, run, currentLap, i as 0 | 1 | 2)
                    : "none";
                  return (
                    <span key={key}>
                      {i > 0 && "  "}S{i + 1}{" "}
                      <span style={{ color: SECTOR_TONE_COLOR[tone] }}>
                        {finished ? (focus.currentLap[key]?.toFixed(3) ?? "——") : "——"}
                      </span>
                    </span>
                  );
                })}
              </div>
              <div className="text-ink-soft">P{x.position} now</div>
              {predicted != null && (
                <div>
                  Pred {fmtLap(predicted)} <span>forecast</span>
                </div>
              )}
            </div>
          </div>
        )}
        {Array.from({ length: completed }, (_, k) => completed - 1 - k).map((index) => {
          const lap = run.laps[index];
          return (
            <LogEntry
              key={lap.lap_number}
              lap={lap}
              tones={[0, 1, 2].map((i) =>
                sectorToneOf(timeline, run, lap.lap_number, i as 0 | 1 | 2),
              )}
              lapTone={lapToneOf(timeline, run, lap.lap_number)}
              tolerance={tolerance}
              // `cum[n]` is the end of lap n; the start of lap n is `cum[n - 1]`.
              onSeek={() => seek(run.cum[lap.lap_number - 1] + 0.02)}
            />
          );
        })}
      </div>
      <div className="flex-none border-t border-divider">
        <ToneLegend />
      </div>
    </>
  );
}
