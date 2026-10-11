const MINUS = "−";

/** 1:23.456 */
export function fmtLap(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, "0")}`;
}

/** Lap time without the millisecond digit, used on chart axes: 1:23.4 */
export const fmtLapAxis = (seconds: number) => fmtLap(seconds).slice(0, -2);

/** 1:23.4 — running lap timer. */
export function fmtTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

/** Race clock: 1:23:45 or 23:45 */
export function fmtClock(seconds: number): string {
  const t = Math.max(0, seconds);
  const hours = Math.floor(t / 3600);
  const minutes = Math.floor((t % 3600) / 60);
  const secs = String(Math.floor(t % 60)).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/** Signed seconds with a true minus sign: +0.123 / −0.123 / ±0.000 */
export function fmtSigned(value: number, digits = 3): string {
  const sign = value > 0.0005 ? "+" : value < -0.0005 ? MINUS : "±";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

export const fmtLapsDown = (laps: number) => `+${laps} LAP${laps > 1 ? "S" : ""}`;

/** Seconds as +12.345 gap text. */
export const fmtGap = (seconds: number) => `+${seconds.toFixed(3)}`;

export function hexAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** "11 Sep 2022" from an ISO date. */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const stripGrandPrix = (name: string) => name.replace(" Grand Prix", "");

export const CARDINALS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;
export const cardinal = (degrees: number) => CARDINALS[Math.round(degrees / 22.5) % 16];
