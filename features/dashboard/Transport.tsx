"use client";

import { Segmented } from "@/components/ui/Segmented";
import { fmtClock } from "@/lib/format";
import { REPLAY_SPEEDS } from "@/lib/race/constants";
import { lapBoundary, type Run } from "@/lib/race/timeline";
import { useFrame, useRace } from "./race-context";
import { useReplay } from "@/features/replay/store";

const STEP_BUTTON =
  "size-9 cursor-pointer rounded-lg border border-control bg-raised text-[11px] text-ink-soft";

/** Play / pause, lap stepping, scrubber and speed for the replay clock. */
export function Transport({ run }: { run: Run }) {
  const { timeline } = useRace();
  const frame = useFrame();
  const { time, end, speed, playing, seek, toggle, setSpeed } = useReplay();

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-line bg-panel px-3 py-2 [grid-area:trans]">
      <div className="flex gap-1">
        <button
          type="button"
          title="Previous lap"
          className={STEP_BUTTON}
          onClick={() => seek(lapBoundary(run, time, -1))}
        >
          ◀◀
        </button>
        <button
          type="button"
          onClick={toggle}
          className="h-9 min-w-[92px] cursor-pointer whitespace-nowrap rounded-lg border-0 bg-accent px-3.5 text-[12.5px] font-bold tracking-[.04em] text-[#111]"
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          title="Next lap"
          className={STEP_BUTTON}
          onClick={() => seek(lapBoundary(run, time, 1))}
        >
          ▶▶
        </button>
      </div>

      <div className="min-w-[150px]">
        <div className="font-mono text-[18px] font-semibold leading-[1.1]">{fmtClock(time)}</div>
        <div className="mt-0.5 whitespace-nowrap text-[11.5px] text-ink-mute">
          {frame.leader.done
            ? `Chequered flag · race ${fmtClock(frame.leader.run.cum[frame.leader.lapCount])}`
            : `Race time · leader on lap ${frame.leaderLap} / ${timeline.totalLaps}`}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={Math.round(end * 10) / 10}
        step={0.1}
        value={Math.round(time * 10) / 10}
        onChange={(event) => seek(Number(event.target.value))}
        className="min-w-[180px] flex-1 cursor-pointer accent-accent"
      />

      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-ink-mute">Speed</span>
        <Segmented
          variant="pill"
          value={speed}
          onChange={setSpeed}
          options={REPLAY_SPEEDS.map((value) => ({
            value,
            label: value === 1 ? "1× real" : `${value}×`,
            title:
              value === 1
                ? "Real time — one lap takes as long as the actual lap"
                : `${value}× faster than real time`,
          }))}
        />
      </div>
    </section>
  );
}
