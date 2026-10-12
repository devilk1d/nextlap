/** One lap of resampled car data: values every `step` seconds from the start of the lap. */
export type TelemetryLap = {
  /** Speed in km/h. */
  s: number[];
  /** Engine RPM. */
  r: number[];
  /** Throttle 0..100. */
  t: number[];
  /** Brake pressed, one "0" or "1" per sample. */
  b: string;
  /** Gear, one digit per sample. */
  g: string;
  /** DRS open, one "0" or "1" per sample. */
  d: string;
};

export type TelemetryFile = {
  year: number;
  event: string;
  driver: string;
  step: number;
  laps: Record<string, TelemetryLap>;
};

export type CarSample = {
  speed: number;
  rpm: number;
  throttle: number;
  brake: boolean;
  gear: number;
  drs: boolean;
  /** Highest speed so far on this lap. */
  topSpeed: number;
};

/** Folder name of a race in `public/telemetry` (`2024_italian-grand-prix`). */
export function telemetryFolder(year: number, eventName: string): string {
  const slug = eventName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${year}_${slug}`;
}

/**
 * Car data `elapsed` seconds into lap `lap`, or null when that lap was not recorded. Speed, RPM and
 * throttle are interpolated between samples; gear, brake and DRS hold the last recorded value.
 */
export function sampleTelemetry(
  file: TelemetryFile,
  lap: number,
  elapsed: number,
): CarSample | null {
  const data = file.laps[String(lap)];
  if (!data || data.s.length === 0) return null;
  const last = data.s.length - 1;
  const position = Math.min(last, Math.max(0, elapsed / file.step));
  const i = Math.floor(position);
  const j = Math.min(last, i + 1);
  const u = position - i;
  const mix = (values: number[]) => values[i] + (values[j] - values[i]) * u;

  const speed = mix(data.s);
  // The mark must never fall behind the speed shown: include the interpolated value too, or the
  // mark would trail the needle while the car accelerates and jump forward at every sample.
  let topSpeed = speed;
  for (let k = 0; k <= i; k += 1) topSpeed = Math.max(topSpeed, data.s[k]);
  return {
    speed,
    rpm: mix(data.r),
    throttle: mix(data.t),
    brake: data.b[i] === "1",
    gear: Number(data.g[i]),
    drs: data.d[i] === "1",
    topSpeed,
  };
}
