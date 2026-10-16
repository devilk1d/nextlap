"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { useRaceFactors } from "@/lib/api";
import { fmtLap } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";

const FASTER = "var(--color-go)";
const SLOWER = "var(--color-stop)";
const NEUTRAL = "var(--color-ink-faint)";
const MINUS = "−";

type Item = { key: string; name: string; value: number; why: string };

/** Seconds with a sign; anything that rounds to zero shows as a plain "0.000 s". */
const signed = (value: number) =>
  Math.abs(value) < 0.0005
    ? "0.000 s"
    : `${value > 0 ? "+" : MINUS}${Math.abs(value).toFixed(3)} s`;
const colorOf = (item: Item) =>
  item.key === "drift" || item.key === "other" || Math.abs(item.value) < 0.0005
    ? NEUTRAL
    : item.value < 0
      ? FASTER
      : SLOWER;

/** Factors smaller than this are folded into one "Other" line to keep the list short. */
const MIN_LISTED = 0.01;

/** One box of the strip: a label, a number, and optionally a bar showing how big it is. */
function Box({
  label,
  value,
  color,
  bar,
  tip,
  className,
}: {
  label: string;
  value: string;
  color?: string;
  /** Size of the bar as a share of the biggest factor, signed: negative grows to the left. */
  bar?: number;
  tip: string;
  className?: string;
}) {
  return (
    <div
      data-tip={tip}
      data-tip-color={color}
      className={cn(
        "relative min-w-[88px] flex-1 overflow-hidden rounded-lg bg-raised px-2.5 pb-2 pt-1",
        className,
      )}
    >
      <div className="truncate text-[12.5px] text-ink-mute">{label}</div>
      <div
        className="mt-0.5 whitespace-nowrap font-mono text-[15px] font-semibold leading-tight"
        style={{ color }}
      >
        {value}
      </div>
      {bar !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-[4px] bg-divider" aria-hidden>
          <span className="absolute inset-y-0 left-1/2 border-l border-ink-faint" />
          <span
            className="absolute inset-y-0"
            style={{
              background: color,
              width: `${Math.abs(bar) * 50}%`,
              ...(bar < 0 ? { right: "50%" } : { left: "50%" }),
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * "Why this forecast": how the number was built, always on screen under the forecast bar. It starts
 * from the average of the last five laps and shows how far each factor moved it, as a row of boxes
 * that ends in the forecast. The split comes from the final model (Shapley values per feature group,
 * stored in `prediction_factors`); each value is relative to a typical lap of the same race, not an
 * absolute effect. `hint` is the small marker for the forecast cell, `strip` the row itself.
 *
 * Returns null while the split is not available for this lap (no forecast, or not stored yet).
 */
export function useForecastWhy(
  x: Standing,
  lapNumber: number,
): { hint: ReactNode; strip: ReactNode } | null {
  const { race, timeline } = useRace();
  const { data } = useRaceFactors(race.race_id);

  const row = useMemo(
    () =>
      data?.factors.find(
        (factor) =>
          factor.driver_code === x.run.driver_code &&
          factor.lap_number === lapNumber,
      ),
    [data, x.run.driver_code, lapNumber],
  );

  if (!row) return null;

  const lap = (n: number) => x.run.laps[n - 1];
  const before = lap(lapNumber - 1);
  const recent = [lapNumber - 3, lapNumber - 2, lapNumber - 1]
    .map((n) => (n >= 1 ? lap(n)?.lap_time_sec : null))
    .filter((t): t is number => typeof t === "number");
  const trend = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : 0;
  const gap = before?.gap_ahead_sec ?? null;
  const usual = (value: number | null, digits = 0) =>
    value === null ? "" : ` · usual ${value.toFixed(digits)}`;

  const all: Item[] = [
    {
      key: "pace",
      name: "Recent pace",
      value: row.c_pace,
      why:
        recent.length === 0
          ? "Lap and sector times"
          : `${recent.map((t) => t.toFixed(2)).join(" · ")} · ${
              trend > 0.15 ? "slowing" : trend < -0.15 ? "quicker" : "steady"
            }`,
    },
    {
      key: "traffic",
      name: "Traffic",
      value: row.c_traffic,
      why:
        gap === null
          ? "Gaps to nearby cars"
          : gap > 10
            ? "No car within 10 s"
            : gap < 1
              ? `Dirty air · ${gap.toFixed(1)} s to car ahead`
              : `${gap.toFixed(1)} s to car ahead${usual(row.ref_gap_ahead, 1)}`,
    },
    {
      key: "telemetry",
      name: "Car data",
      value: row.c_telemetry,
      why: "Speed, throttle, braking",
    },
    {
      key: "tyres",
      name: "Tyres",
      value: row.c_tyres,
      why:
        before?.tyre_life != null
          ? `${tyreOf(before.compound).name}, ${before.tyre_life} laps${usual(row.ref_tyre_life)}`
          : "Compound and age",
    },
    {
      key: "track",
      name: "Track",
      value: row.c_track,
      why: "Field pace this lap",
    },
    {
      key: "progress",
      name: "Race progress",
      value: row.c_progress,
      why: `Lap ${lapNumber} of ${timeline.totalLaps} · fuel burns off`,
    },
    {
      key: "weather",
      name: "Weather",
      value: row.c_weather,
      why:
        before?.track_temp != null
          ? `Track ${before.track_temp.toFixed(1)} °C${usual(row.ref_track_temp, 1)}`
          : "Temperature, wind, humidity",
    },
    {
      key: "drift",
      name: "Baseline",
      value: row.baseline_shift,
      why: "Usual change per lap",
    },
  ];
  const items = [...all].sort((p, q) => Math.abs(q.value) - Math.abs(p.value));
  const listed = items.filter(
    (item) => item.key !== "drift" && Math.abs(item.value) >= MIN_LISTED,
  );
  const rest = items.filter((item) => !listed.includes(item));
  const lines: Item[] = rest.length
    ? [
        ...listed,
        {
          key: "other",
          name: "Other",
          value: rest.reduce((sum, item) => sum + item.value, 0),
          why: `${rest.length} smaller ${rest.length === 1 ? "factor" : "factors"}`,
        },
      ]
    : listed;

  const forecast =
    row.window_mean_sec + items.reduce((sum, item) => sum + item.value, 0);
  const actual =
    lapNumber <= x.completed ? (lap(lapNumber)?.lap_time_sec ?? null) : null;
  // The biggest factor fills half a bar, so the boxes can be compared at a glance.
  const reach = Math.max(0.05, ...lines.map((item) => Math.abs(item.value)));

  // A 3 px strip along the bottom of the forecast cell: slower factors to the right of the centre
  // line, faster to the left, width = seconds.
  const parts = items.filter(
    (item) => item.key !== "drift" && Math.abs(item.value) >= 0.0005,
  );
  const fasterSum = parts
    .filter((p) => p.value < 0)
    .reduce((s, p) => s + Math.abs(p.value), 0);
  const slowerSum = parts
    .filter((p) => p.value > 0)
    .reduce((s, p) => s + p.value, 0);
  const total = fasterSum + slowerSum || 1;
  const centre = (fasterSum / total) * 100;
  const segments: { item: Item; left: number; width: number }[] = [];
  let toLeft = centre;
  let toRight = centre;
  for (const item of parts) {
    const width = (Math.abs(item.value) / total) * 100;
    if (item.value < 0) {
      toLeft -= width;
      segments.push({ item, left: toLeft, width });
    } else {
      segments.push({ item, left: toRight, width });
      toRight += width;
    }
  }

  const hint = (
    <>
      <span className="pointer-events-none absolute right-3 top-2 rounded-full border border-accent/60 bg-accent/12 px-2 py-px text-[12px] font-bold text-accent">
        Why ↓
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-divider">
        {segments.map(({ item, left, width }) => (
          <span
            key={item.key}
            className="absolute inset-y-0"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: colorOf(item),
            }}
          />
        ))}
      </span>
    </>
  );

  const strip = (
    <div
      data-tour="why"
      className="flex items-stretch gap-2 border-t border-divider bg-[rgba(22,22,25,.96)] px-3 py-1.5"
    >
      <div className="flex w-[68px] shrink-0 flex-col justify-center text-[12.5px] font-bold leading-tight text-accent">
        Why this forecast
      </div>
      <div className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto">
        <Box
          label="Last 5 laps"
          value={fmtLap(row.window_mean_sec)}
          tip={
            "# Starting point\nThe average lap time of the last 5 laps.\nEvery factor below moves the forecast away from it."
          }
        />
        {lines.map((item) => (
          <Box
            key={item.key}
            label={item.name}
            value={signed(item.value)}
            color={colorOf(item)}
            bar={item.value / reach}
            tip={`# ${item.name}\n${item.why}\nEffect | ${signed(item.value)}\nCompared with a typical lap of this race.`}
          />
        ))}
        <Box
          label={
            actual === null ? "Forecast" : `Forecast · actual ${fmtLap(actual)}`
          }
          value={fmtLap(forecast)}
          className="border border-accent/60 bg-accent/10"
          tip={
            actual === null
              ? `# Forecast\nStarting point plus every factor.`
              : `# Forecast\nStarting point plus every factor.\nActual | ${fmtLap(actual)}\nDifference | ${actual - forecast >= 0 ? "+" : MINUS}${Math.abs(actual - forecast).toFixed(3)} s`
          }
        />
      </div>
    </div>
  );

  return { hint, strip };
}
