"use client";

import { useEffect } from "react";
import { useReplay } from "./store";

const TICK_MS = 50;
/** Longest step applied at once, so a throttled background tab does not jump ahead. */
const MAX_STEP_SECONDS = 0.5;

/** Advances the replay clock in real time while `playing`, at ~20 updates per second. */
export function usePlayback() {
  const playing = useReplay((state) => state.playing);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      useReplay.getState().advance(Math.min(MAX_STEP_SECONDS, (now - last) / 1000));
      last = now;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);
}
