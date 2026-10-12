"use client";

import { useEffect, useState } from "react";
import { telemetryFolder, type TelemetryFile } from "@/lib/race/telemetry";

/**
 * Where the per-driver files live: the public Supabase Storage bucket in production
 * (`https://<project>.supabase.co/storage/v1/object/public/telemetry`), or `public/telemetry`
 * served by Next when the variable is not set. No trailing slash.
 */
const BASE_URL = (process.env.NEXT_PUBLIC_TELEMETRY_URL || "/telemetry").replace(/\/+$/, "");

const loads = new Map<string, Promise<TelemetryFile | null>>();

/** One request per file for the whole session; a missing file (404) resolves to null. */
function load(url: string): Promise<TelemetryFile | null> {
  let pending = loads.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? (response.json() as Promise<TelemetryFile>) : null))
      .catch(() => null);
    loads.set(url, pending);
  }
  return pending;
}

/**
 * Car data of one driver in one race, built by `scripts/telemetry/build_telemetry.py` and uploaded by
 * `upload_telemetry.py`. Null while
 * loading and for races that have no file, so callers can fall back to the lap averages.
 */
export function useDriverTelemetry(
  year: number,
  eventName: string,
  driver: string,
): TelemetryFile | null {
  const url = `${BASE_URL}/${telemetryFolder(year, eventName)}/${driver}.json`;
  const [state, setState] = useState<{ url: string; file: TelemetryFile | null }>({
    url,
    file: null,
  });

  useEffect(() => {
    let current = true;
    load(url).then((file) => {
      if (current) setState({ url, file });
    });
    return () => {
      current = false;
    };
  }, [url]);

  return state.url === url ? state.file : null;
}
