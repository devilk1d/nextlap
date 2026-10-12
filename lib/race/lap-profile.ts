import type { Run, RunLap } from "./timeline";

/** How many of the driver's earlier clean laps the last lap is compared with. */
export const REFERENCE_LAPS = 4;
/** Fewer earlier laps than this and a comparison would only be noise. */
export const MIN_REFERENCE_LAPS = 2;

type TelemetryKey = Extract<keyof RunLap, `tel_${string}`>;

export type ProfileMetric = {
  key: TelemetryKey;
  name: string;
  /** Unit with a leading space, or an empty string. */
  unit: string;
  digits: number;
};

/** The lap aggregates the forecast model reads, in the order the panel lists them. */
export const PROFILE_METRICS: ProfileMetric[] = [
  { key: "tel_speed_mean", name: "Avg speed", unit: " km/h", digits: 0 },
  { key: "tel_speed_min", name: "Min speed", unit: " km/h", digits: 0 },
  { key: "tel_n_gear_shifts", name: "Gear shifts", unit: "", digits: 0 },
  { key: "tel_speed_std", name: "Speed std", unit: " km/h", digits: 1 },
  { key: "tel_throttle_mean", name: "Throttle mean", unit: " %", digits: 1 },
  { key: "tel_throttle_std", name: "Throttle std", unit: " %", digits: 1 },
  { key: "tel_pct_coast", name: "Coasting", unit: " %", digits: 1 },
  { key: "tel_n_brake_zones", name: "Brake zones", unit: "", digits: 0 },
  { key: "tel_n_gear_mode", name: "Gear mode", unit: "", digits: 0 },
  { key: "tel_gear_mean", name: "Gear mean", unit: "", digits: 2 },
  { key: "tel_rpm_max", name: "RPM max", unit: "", digits: 0 },
  { key: "tel_rpm_mean", name: "RPM mean", unit: "", digits: 0 },
  { key: "tel_rpm_std", name: "RPM std", unit: "", digits: 0 },
  { key: "tel_pct_slow", name: "Time < 150 km/h", unit: " %", digits: 1 },
  { key: "tel_pct_fast", name: "Time > 250 km/h", unit: " %", digits: 1 },
  { key: "tel_accel_p99", name: "Accel p99", unit: " m/s²", digits: 1 },
  { key: "tel_decel_p01", name: "Decel p1", unit: " m/s²", digits: 1 },
];

/** The driver's clean laps before `lapNumber`, the latest {@link REFERENCE_LAPS} of them. */
export function referenceLaps(run: Run, lapNumber: number): RunLap[] {
  return run.laps.filter((lap) => lap.lap_number < lapNumber && lap.clean).slice(-REFERENCE_LAPS);
}

export type Comparison = {
  /** This lap's value minus the average of the reference laps, unrounded. */
  delta: number;
  /** Direction after rounding to the metric's own precision, so "same" never shows as +0.0. */
  direction: "up" | "down" | "same";
  /** Average of the reference laps. */
  reference: number;
  /** How many reference laps had a value. */
  laps: number;
};

/** How `value` differs from the same metric averaged over `references`, or null if unknown. */
export function compareToReference(
  value: number | null | undefined,
  references: RunLap[],
  metric: ProfileMetric,
): Comparison | null {
  if (value == null) return null;
  const values = references
    .map((lap) => lap[metric.key])
    .filter((v): v is number => typeof v === "number");
  if (values.length < MIN_REFERENCE_LAPS) return null;
  const reference = values.reduce((sum, v) => sum + v, 0) / values.length;
  const delta = value - reference;
  const shown = Number(delta.toFixed(metric.digits));
  return {
    delta,
    direction: shown > 0 ? "up" : shown < 0 ? "down" : "same",
    reference,
    laps: values.length,
  };
}
