"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
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

/** Width of the card: a name with its reason, a bar, and a value on one row. */
const CARD_WIDTH = 390;
/** Height the card needs for a full list; with less room it opens on the roomier side. */
const CARD_HEIGHT = 400;
const PINNED_KEY = "nextlap.why.pinned";

/** Whether the visitor left the card pinned open; kept in this browser. */
function readPinned(): boolean {
  try {
    return window.localStorage.getItem(PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

function writePinned(pinned: boolean) {
  try {
    window.localStorage.setItem(PINNED_KEY, pinned ? "1" : "0");
  } catch {
    /* the choice just is not remembered */
  }
}

/**
 * "Why this forecast": a "Why?" button on the forecast cell and a card that shows how the number
 * was built. The card opens on hover or focus and stays open when the cell is clicked (the choice
 * is remembered, so a visitor who wants it always on keeps it); the guided tour opens it by itself.
 * The split comes from the final model (Shapley values per feature group, stored in
 * `prediction_factors`); each value is relative to a typical lap of the same race, not an absolute
 * effect. A 3 px strip along the bottom of the cell previews the split.
 *
 * Returns null while the split is not available for this lap (no forecast, or not stored yet).
 */
export function useForecastWhy(
  x: Standing,
  lapNumber: number,
): {
  cellProps: HTMLAttributes<HTMLDivElement> & {
    ref: React.Ref<HTMLDivElement>;
  };
  node: ReactNode;
} | null {
  const { race, timeline } = useRace();
  const { data } = useRaceFactors(race.race_id);
  const cell = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(readPinned);
  const [place, setPlace] = useState<{
    left: number;
    edge: number;
    side: "above" | "below";
    room: number;
    compact: boolean;
  }>({ left: 8, edge: 8, side: "above", room: 400, compact: false });

  const row = useMemo(
    () =>
      data?.factors.find(
        (factor) =>
          factor.driver_code === x.run.driver_code &&
          factor.lap_number === lapNumber,
      ),
    [data, x.run.driver_code, lapNumber],
  );

  /** Opens above the cell, or below it when there is more room there (the card is tall). */
  const locate = () => {
    const box = cell.current?.getBoundingClientRect();
    if (!box) return;
    const above = box.top - 16;
    const below = window.innerHeight - box.bottom - 16;
    const side = above >= CARD_HEIGHT || above >= below ? "above" : "below";
    setPlace({
      left: Math.max(
        8,
        Math.min(box.left, window.innerWidth - CARD_WIDTH - 16),
      ),
      edge:
        side === "above" ? window.innerHeight - box.top + 8 : box.bottom + 8,
      side,
      room: Math.max(160, side === "above" ? above : below),
      // Little height (a small window): drop the reason lines so the whole list still fits.
      compact: (side === "above" ? above : below) < CARD_HEIGHT,
    });
  };

  // The guided tour shows the card by itself on its "Why this number?" step.
  const touring = useTour(
    (s) => s.open && TOUR_STEPS[s.step]?.target === "why",
  );
  const shown = hovered || pinned || touring;
  useEffect(() => {
    if (shown) locate();
  }, [shown, row]);

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

  const cellProps = {
    ref: cell,
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": shown,
    "aria-label": "Why this forecast",
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
    onClick: () => {
      const next = !pinned;
      setPinned(next);
      writePinned(next);
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        writePinned(false);
        setHovered(false);
      }
    },
  };

  const node = (
    <>
      <span
        className={cn(
          "pointer-events-none absolute right-3 top-2 rounded-full border px-2 py-px text-[12px] font-bold",
          pinned
            ? "border-accent bg-accent text-[#111]"
            : "border-accent/60 bg-accent/12 text-accent",
        )}
      >
        Why?
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
      {shown &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label="Why this forecast"
            className={cn(
              "fixed max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-accent/45 border-t-2 border-t-accent bg-[#1b1b1f] px-4 pb-3 pt-3 text-[13.5px] shadow-[0_18px_48px_rgba(0,0,0,.7)]",
              // Above the tour's dimming layer (z-250) while the tour is explaining it.
              touring ? "z-[280]" : "z-[100]",
              pinned ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{
              left: place.left,
              ...(place.side === "above"
                ? { bottom: place.edge }
                : { top: place.edge }),
              maxHeight: place.room,
              width: CARD_WIDTH,
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-cond text-[26px] font-semibold leading-none">
                Why {fmtLap(forecast)}
              </span>
              <span className="whitespace-nowrap text-[12.5px] text-ink-mute">
                Lap {lapNumber} · {x.run.driver_code}
              </span>
            </div>
            <div
              className={cn(
                "flex items-baseline justify-between rounded-lg bg-raised px-3",
                place.compact ? "mt-2 py-1" : "mt-2.5 py-1.5",
              )}
            >
              <span className="text-ink-soft">
                Starts from the average of the last 5 laps
              </span>
              <span className="font-mono text-[15px] font-semibold">
                {fmtLap(row.window_mean_sec)}
              </span>
            </div>
            <div className="mt-1">
              {lines.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_72px_80px] items-center gap-x-3 px-2",
                    place.compact ? "py-[5px]" : "py-1.5",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold">
                      {item.name}
                    </span>
                    {!place.compact && (
                      <span className="block text-[12.5px] leading-[1.35] text-ink-mute">
                        {item.why}
                      </span>
                    )}
                  </span>
                  <span
                    className="relative h-2 rounded-full bg-divider"
                    aria-hidden
                  >
                    <span className="absolute inset-y-[-3px] left-1/2 border-l border-ink-faint" />
                    <span
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        background: colorOf(item),
                        width: `${(Math.abs(item.value) / reach) * 50}%`,
                        ...(item.value < 0
                          ? { right: "50%" }
                          : { left: "50%" }),
                      }}
                    />
                  </span>
                  <span
                    className="whitespace-nowrap text-right font-mono text-[14.5px] font-semibold"
                    style={{ color: colorOf(item) }}
                  >
                    {signed(item.value)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-hairline pt-2.5">
              <span className="text-ink-soft">
                Forecast{" "}
                <b className="ml-1 font-mono text-[18px] text-ink">
                  {fmtLap(forecast)}
                </b>
              </span>
              <span className="font-mono text-[13px] text-ink-dim">
                {actual === null
                  ? "In progress"
                  : `Actual ${fmtLap(actual)} (${actual - forecast >= 0 ? "+" : MINUS}${Math.abs(actual - forecast).toFixed(2)})`}
              </span>
            </div>
            {!place.compact && (
              <div className="mt-1.5 text-[12px] text-ink-mute">
                Green made the lap faster, red slower, compared with a typical
                lap of this race.{" "}
                {pinned
                  ? "Click Why? to close."
                  : "Click Why? to keep it open."}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );

  return { cellProps, node };
}
