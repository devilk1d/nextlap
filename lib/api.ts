"use client";

import useSWR, { type SWRConfiguration } from "swr";
import type { getRaceFactors } from "@/server/races/service";
import type { RaceDetail } from "@/server/races/types";

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json() as Promise<T>;
}

// The dataset is immutable between ETL loads: never revalidate on focus or reconnect.
const STATIC_DATA: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  keepPreviousData: true,
};

export const useRaceDetail = (raceId: number | null) =>
  useSWR<RaceDetail>(raceId ? `/api/races/${raceId}` : null, fetcher, STATIC_DATA);

export type RaceFactors = Awaited<ReturnType<typeof getRaceFactors>>;

/** Feature-group split of the forecasts of one race; loads only when `enabled`. */
export const useRaceFactors = (raceId: number | null, enabled = true) =>
  useSWR<RaceFactors>(
    raceId && enabled ? `/api/races/${raceId}/factors` : null,
    fetcher,
    STATIC_DATA,
  );
