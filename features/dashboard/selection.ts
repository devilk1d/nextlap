"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { RaceInfo } from "@/server/races/types";

export const VIEWS = ["replay", "h2h", "strat", "ov", "hist"] as const;
export type View = (typeof VIEWS)[number];

export type Selection = {
  view: View;
  raceId: number | null;
  driver: string | null;
  /** Head-to-head slots. */
  a: string | null;
  b: string | null;
};

type Patch = { [K in keyof Selection]?: Selection[K] | null };

const KEYS = { view: "view", raceId: "race", driver: "drv", a: "a", b: "b" } as const;

function parse(params: URLSearchParams): Selection {
  const view = params.get(KEYS.view);
  const raceId = Number(params.get(KEYS.raceId));
  return {
    view: VIEWS.find((v) => v === view) ?? "replay",
    raceId: Number.isInteger(raceId) && raceId > 0 ? raceId : null,
    driver: params.get(KEYS.driver),
    a: params.get(KEYS.a),
    b: params.get(KEYS.b),
  };
}

/**
 * Dashboard selection kept in the URL query string so every view is linkable.
 * Updates use `history.replaceState`, which Next.js syncs without a server round trip.
 */
export function useSelection(): [Selection, (patch: Patch) => void] {
  const searchParams = useSearchParams();
  const selection = useMemo(() => parse(searchParams), [searchParams]);

  const update = useCallback((patch: Patch) => {
    const params = new URLSearchParams(window.location.search);
    for (const [field, value] of Object.entries(patch) as [keyof Selection, unknown][]) {
      if (value === null || value === undefined) params.delete(KEYS[field]);
      else params.set(KEYS[field], String(value));
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []);

  return [selection, update];
}

/** Race shown when the URL names none: Monza 2024 (the prototype default), else the first dry race. */
export function defaultRace(races: RaceInfo[]): RaceInfo | undefined {
  return (
    races.find((r) => r.year === 2024 && r.circuit.short_name === "Monza" && r.predictable) ??
    races.find((r) => r.predictable) ??
    races[0]
  );
}

/** Same circuit in another season when it exists, otherwise the first dry race of that season. */
export function raceForSeason(races: RaceInfo[], year: number, circuitKey: number) {
  const inSeason = races.filter((r) => r.year === year);
  return (
    inSeason.find((r) => r.circuit_key === circuitKey) ??
    inSeason.find((r) => r.predictable) ??
    inSeason[0]
  );
}
