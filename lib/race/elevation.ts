import { trackKey } from "./track";

/** Real racing line of a circuit: metres, from the start/finish line, z relative to the lowest point. */
export type ElevationTrace = {
  year: number;
  driver: string;
  lap: number;
  length_m: number;
  range_m: number;
  x: number[];
  y: number[];
  z: number[];
};

export type ElevationData = Record<string, ElevationTrace>;

/** Vertical exaggeration of the 3D view; real relief is tiny next to the length of a lap. */
export const HEIGHT_SCALE = 5;

let cache: Promise<ElevationData> | null = null;

/** Loads `data/track-elevation.json` in its own chunk, only when the landing page needs it. */
export function loadElevation(): Promise<ElevationData> {
  cache ??= import("@/data/track-elevation.json").then((m) => m.default as ElevationData);
  return cache;
}

export const traceFor = (data: ElevationData | null, circuitShortName: string) =>
  data?.[trackKey(circuitShortName)] ?? null;
