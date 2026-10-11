import { create } from "zustand";
import { clamp } from "@/lib/stats";

type ReplayState = {
  /** Race time in seconds since the start. */
  time: number;
  /** Race time at which the last car finishes. */
  end: number;
  speed: number;
  playing: boolean;
  load: (end: number, time: number) => void;
  seek: (time: number) => void;
  toggle: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  advance: (seconds: number) => void;
};

/** Replay clock; kept outside React state so only subscribed panels re-render per tick. */
export const useReplay = create<ReplayState>((set, get) => ({
  time: 0,
  end: 0,
  speed: 1,
  playing: false,
  load: (end, time) => set({ end, time, playing: false }),
  seek: (time) => set({ time: clamp(time, 0, get().end), playing: false }),
  toggle: () => {
    const { playing, time, end } = get();
    if (playing) set({ playing: false });
    else set({ playing: true, time: time >= end - 0.01 ? 0 : time });
  },
  pause: () => set({ playing: false }),
  setSpeed: (speed) => set({ speed }),
  advance: (seconds) => {
    const { time, end, speed } = get();
    const next = Math.min(end, time + seconds * speed);
    set({ time: next, playing: next < end });
  },
}));
