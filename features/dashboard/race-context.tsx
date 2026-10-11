"use client";

import { createContext, useContext, useMemo } from "react";
import type { RaceDetail, RaceInfo } from "@/server/races/types";
import { frameAt, type Frame, type Run, type Timeline } from "@/lib/race/timeline";
import { useReplay } from "@/features/replay/store";

export type RaceData = {
  race: RaceInfo;
  detail: RaceDetail;
  timeline: Timeline;
  /** Driver the replay and strategy views focus on. */
  driver: Run;
  setDriver: (code: string) => void;
  /** Drivers compared in the head-to-head view. */
  compare: { a: string; b: string; setA: (code: string) => void; setB: (code: string) => void };
};

const RaceContext = createContext<RaceData | null>(null);

export const RaceProvider = RaceContext.Provider;

export function useRace(): RaceData {
  const value = useContext(RaceContext);
  if (!value) throw new Error("useRace must be used inside <RaceProvider>");
  return value;
}

// Several panels read the same frame per tick; compute it once.
let lastFrame: { timeline: Timeline; time: number; frame: Frame } | null = null;

function cachedFrame(timeline: Timeline, time: number): Frame {
  if (lastFrame?.timeline === timeline && lastFrame.time === time) return lastFrame.frame;
  const frame = frameAt(timeline, time);
  lastFrame = { timeline, time, frame };
  return frame;
}

/** Field standings at the current replay time; re-renders on every clock tick. */
export function useFrame(): Frame {
  const { timeline } = useRace();
  const time = useReplay((state) => state.time);
  return useMemo(() => cachedFrame(timeline, time), [timeline, time]);
}
