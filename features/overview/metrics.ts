import { fmtLap, fmtLapAxis } from "@/lib/format";
import type { RunLap } from "@/lib/race/timeline";

export type LapMetric = {
  key: string;
  label: string;
  group: string;
  unit: string;
  digits: number;
  /** -1: lower is better, 1: higher is better, 0: no preferred direction. */
  better: -1 | 0 | 1;
  value: (lap: RunLap) => number | null | undefined;
  /** Meaningless on pit, start and flag laps unless the user asks for them. */
  racingOnly?: boolean;
  format?: (value: number) => string;
  axis?: (value: number) => string;
};

const tel = (
  key: keyof RunLap,
  label: string,
  group: string,
  unit: string,
  digits: number,
  better: LapMetric["better"],
  racingOnly = false,
): LapMetric => ({
  key: String(key),
  label,
  group,
  unit,
  digits,
  better,
  racingOnly,
  value: (lap) => lap[key] as number | null,
});

/** Every per-lap quantity of the dataset that varies from lap to lap. */
export const LAP_METRICS: LapMetric[] = [
  {
    key: "lap_time",
    label: "Lap time",
    group: "Timing",
    unit: "",
    digits: 3,
    better: -1,
    racingOnly: true,
    value: (l) => l.lap_time_sec,
    format: fmtLap,
    axis: fmtLapAxis,
  },
  {
    key: "s1",
    label: "Sector 1",
    group: "Timing",
    unit: "s",
    digits: 3,
    better: -1,
    racingOnly: true,
    value: (l) => l.sector1_time_sec,
  },
  {
    key: "s2",
    label: "Sector 2",
    group: "Timing",
    unit: "s",
    digits: 3,
    better: -1,
    racingOnly: true,
    value: (l) => l.sector2_time_sec,
  },
  {
    key: "s3",
    label: "Sector 3",
    group: "Timing",
    unit: "s",
    digits: 3,
    better: -1,
    racingOnly: true,
    value: (l) => l.sector3_time_sec,
  },
  tel("speed_i1", "Speed trap I1", "Speed traps", "km/h", 0, 1),
  tel("speed_i2", "Speed trap I2", "Speed traps", "km/h", 0, 1),
  tel("speed_fl", "Finish line speed", "Speed traps", "km/h", 0, 1),
  tel("speed_st", "Speed trap ST", "Speed traps", "km/h", 0, 1),
  tel("tel_speed_max", "Speed max", "Speed", "km/h", 0, 1),
  tel("tel_speed_min", "Speed min", "Speed", "km/h", 0, 1),
  tel("tel_speed_mean", "Speed mean", "Speed", "km/h", 1, 1, true),
  tel("tel_speed_std", "Speed std", "Speed", "km/h", 1, 0),
  tel("tel_throttle_mean", "Throttle mean", "Throttle & brake", "%", 1, 1),
  tel("tel_throttle_std", "Throttle std", "Throttle & brake", "%", 1, 0),
  tel("tel_pct_full_throttle", "Full throttle", "Throttle & brake", "%", 1, 1),
  tel("tel_pct_coast", "Coasting", "Throttle & brake", "%", 1, -1),
  tel("tel_pct_braking", "Braking", "Throttle & brake", "%", 1, 0),
  tel("tel_n_brake_zones", "Brake zones", "Throttle & brake", "", 0, 0),
  tel("tel_n_gear_mode", "Gear mode", "Gear & engine", "", 0, 0),
  tel("tel_gear_mean", "Gear mean", "Gear & engine", "", 2, 0),
  tel("tel_n_gear_shifts", "Gear shifts", "Gear & engine", "", 0, 0),
  tel("tel_rpm_max", "RPM max", "Gear & engine", "", 0, 0),
  tel("tel_rpm_mean", "RPM mean", "Gear & engine", "", 0, 0),
  tel("tel_rpm_std", "RPM std", "Gear & engine", "", 0, 0),
  tel("tel_pct_drs_open", "DRS open", "DRS", "%", 1, 0),
  tel("tel_n_drs_activations", "DRS activations", "DRS", "", 0, 0),
  tel("tel_pct_slow", "Time below 150 km/h", "Lap profile", "%", 1, -1),
  tel("tel_pct_fast", "Time above 250 km/h", "Lap profile", "%", 1, 1),
  tel("tel_accel_p99", "Accel p99", "Lap profile", "m/s²", 2, 0),
  tel("tel_decel_p01", "Decel p1", "Lap profile", "m/s²", 2, 0),
  tel("tyre_life", "Tyre life", "Tyres & race", "laps", 0, 0),
  tel("gap_ahead_sec", "Gap ahead", "Tyres & race", "s", 2, 0),
  tel("gap_behind_sec", "Gap behind", "Tyres & race", "s", 2, 0),
  tel("position", "Position", "Tyres & race", "", 0, -1),
  tel("track_temp", "Track temp", "Weather", "°C", 1, 0),
  tel("air_temp", "Air temp", "Weather", "°C", 1, 0),
  tel("humidity", "Humidity", "Weather", "%", 0, 0),
  tel("pressure", "Pressure", "Weather", "hPa", 1, 0),
  tel("wind_speed", "Wind speed", "Weather", "m/s", 1, 0),
];

export function formatMetric(metric: LapMetric, value: number): string {
  if (metric.format) return metric.format(value);
  const text = value.toFixed(metric.digits);
  return metric.unit && metric.unit !== "s"
    ? `${text} ${metric.unit}`
    : metric.unit === "s"
      ? `${text} s`
      : text;
}

export const METRIC_GROUPS = [...new Set(LAP_METRICS.map((metric) => metric.group))];
