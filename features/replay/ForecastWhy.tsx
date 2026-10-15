"use client";

import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";
import { useRaceFactors } from "@/lib/api";
import { fmtLap } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import { TOUR_STEPS } from "@/features/tour/steps";
import { useTour } from "@/features/tour/store";

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

/**
 * "Why this forecast": a thin strip along the bottom of the forecast cell that shows how each
 * factor moved the number, and a popover with the list behind it. The split comes from the final
 * model (Shapley values per feature group, stored in `prediction_factors`); each value is relative
 * to a typical lap of the same race, not an absolute effect.
 *
 * Returns null while the split is not available for this lap (no forecast, or not stored yet).
 */
export function useForecastWhy(
  x: Standing,
  lapNumber: number,
): {
  cellProps: HTMLAttributes<HTMLDivElement> & { ref: React.Ref<HTMLDivElement> };
  node: ReactNode;
} | null {
  const { race, timeline } = useRace();
  const { data } = useRaceFactors(race.race_id);
  const cell = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const [place, setPlace] = useState({ left: 8, bottom: 8, room: 400 });

  const row = useMemo(
    () =>
      data?.factors.find(
        (factor) => factor.driver_code === x.run.driver_code && factor.lap_number === lapNumber,
      ),
    [data, x.run.driver_code, lapNumber],
  );

  useEffect(() => {
    if (!pinned) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (cell.current?.contains(target) || popover.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [pinned]);

  const locate = () => {
    const box = cell.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(8, Math.min(box.left, window.innerWidth - 356)),
      bottom: window.innerHeight - box.top + 8,
      room: Math.max(160, box.top - 16),
    });
  };

  // The guided tour shows this popover by itself on its "Why this number?" step.
  const touring = useTour((s) => s.open && TOUR_STEPS[s.step]?.target === "why");
  useEffect(() => {
    if (touring) locate();
  }, [touring, row]);

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
    { key: "telemetry", name: "Car data", value: row.c_telemetry, why: "Speed, throttle, braking" },
    {
      key: "tyres",
      name: "Tyres",
      value: row.c_tyres,
      why:
        before?.tyre_life != null
          ? `${tyreOf(before.compound).name}, ${before.tyre_life} laps${usual(row.ref_tyre_life)}`
          : "Compound and age",
    },
    { key: "track", name: "Track", value: row.c_track, why: "Field pace this lap" },
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
    { key: "drift", name: "Baseline", value: row.baseline_shift, why: "Usual change per lap" },
  ];
  const items = [...all].sort((p, q) => Math.abs(q.value) - Math.abs(p.value));
  const listed = items.filter((item) => item.key !== "drift" && Math.abs(item.value) >= MIN_LISTED);
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

  const forecast = row.window_mean_sec + items.reduce((sum, item) => sum + item.value, 0);
  const actual = lapNumber <= x.completed ? (lap(lapNumber)?.lap_time_sec ?? null) : null;

  // Strip: slower factors to the right of the centre line, faster to the left, width = seconds.
  const parts = items.filter((item) => item.key !== "drift" && Math.abs(item.value) >= 0.0005);
  const fasterSum = parts.filter((p) => p.value < 0).reduce((s, p) => s + Math.abs(p.value), 0);
  const slowerSum = parts.filter((p) => p.value > 0).reduce((s, p) => s + p.value, 0);
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

  const show = () => {
    locate();
    setOpen(true);
  };
  const hide = () => {
    if (!pinned) setOpen(false);
  };

  const cellProps = {
    ref: cell,
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": open,
    "aria-label": "Why this forecast",
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    onClick: () => {
      const next = !pinned;
      setPinned(next);
      if (next) show();
      else setOpen(false);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    },
  };

  const node = (
    <>
      <span className="pointer-events-none absolute right-3 top-2 text-[10px] font-semibold text-accent">
        Why?
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-divider">
        {segments.map(({ item, left, width }) => (
          <span
            key={item.key}
            className={cn("absolute inset-y-0", hot === item.key && "brightness-150")}
            style={{ left: `${left}%`, width: `${width}%`, background: colorOf(item) }}
          />
        ))}
      </span>
      {(open || touring) &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popover}
            role="dialog"
            aria-label="Why this forecast"
            className={cn(
              "fixed w-[340px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-popover bg-tooltip px-3.5 py-3 text-[12px] shadow-[0_12px_30px_rgba(0,0,0,.5)]",
              // Above the tour's dimming layer (z-250) while the tour is explaining it.
              touring ? "z-[280]" : "z-[100]",
              pinned ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{ left: place.left, bottom: place.bottom, maxHeight: place.room }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold">Why {fmtLap(forecast)}</span>
              <span className="text-[11px] text-ink-mute">
                Lap {lapNumber} · {x.run.driver_code}
              </span>
            </div>
            <div className="mt-2.5 flex justify-between text-ink-dim">
              <span>Average of last 5 laps</span>
              <span className="font-mono">{fmtLap(row.window_mean_sec)}</span>
            </div>
            <div className="mt-1.5 border-t border-hairline pt-1.5">
              {lines.map((item) => (
                <div
                  key={item.key}
                  onMouseEnter={() => setHot(item.key)}
                  onMouseLeave={() => setHot(null)}
                  className={cn(
                    "grid grid-cols-[8px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 rounded-md px-1 py-[5px]",
                    hot === item.key && "bg-raised",
                  )}
                >
                  <span
                    className="size-2 self-center rounded-[2px]"
                    style={{ background: colorOf(item) }}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold">{item.name}</span>
                    <span className="block text-[11px] leading-[1.35] text-ink-mute">
                      {item.why}
                    </span>
                  </span>
                  <span
                    className="whitespace-nowrap text-right font-mono font-semibold"
                    style={{ color: colorOf(item) }}
                  >
                    {signed(item.value)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between border-t border-hairline pt-2 text-ink-dim">
              <span>
                Forecast <b className="font-mono text-[14px] text-ink">{fmtLap(forecast)}</b>
              </span>
              <span className="font-mono">
                {actual === null
                  ? "In progress"
                  : `Actual ${fmtLap(actual)} (${actual - forecast >= 0 ? "+" : MINUS}${Math.abs(actual - forecast).toFixed(2)})`}
              </span>
            </div>
            <div className="mt-2 text-[10.5px] text-ink-mute">
              Compared with a typical lap of this race.
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  return { cellProps, node };
}
