import { create } from "zustand";

const SEEN_KEY = "nextlap.tour.v1";

/** Whether this browser has already finished or skipped the tour. */
export function tourSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* the tour will simply show again next time */
  }
}

type TourState = {
  open: boolean;
  step: number;
  start: () => void;
  go: (step: number) => void;
  close: () => void;
};

/** Open state of the first-visit tour; the header's "?" button and the auto-start share it. */
export const useTour = create<TourState>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  go: (step) => set({ step }),
  close: () => {
    markSeen();
    set({ open: false });
  },
}));
