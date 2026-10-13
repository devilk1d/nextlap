"use client";

import { useState } from "react";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Run, Standing } from "@/lib/race/timeline";
import { clamp } from "@/lib/stats";
import { linePath } from "@/lib/svg";
import { useRace } from "@/features/dashboard/race-context";
import type { Battle } from "./battle";

const AXIS = "absolute font-mono text-[10.5px] text-ink-mute";

function xTicks(totalLaps: number) {
  return Array.from({ length: totalLaps }, (_, i) => i + 1).filter(
    (lap) => lap === 1 || lap === totalLaps || lap % 10 === 0,
  );
}

const Header = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider px-3.5 py-[9px]">
    {children}
  </div>
);

function LineKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px]">
      <span className="h-0.5 w-4" style={{ background: color }} />
      {label}
    </span>
  );
}

export function LapTimesChart({ battle }: { battle: Battle }) {
  const { timeline } = useRace();
  const [hover, setHover] = useState<number | null>(null);
  const { a, b, colorA, colorB } = battle;
  const total = timeline.totalLaps;

  const clean = (run: Run) => run.laps.filter((l) => l.clean && l.lap_time_sec !== null);
  const values = [a.run, b.run].flatMap((run) =>
    clean(run).flatMap((l) => [
      l.lap_time_sec as number,
      ...(l.prediction ? [l.prediction.predicted_lap_time_sec] : []),
    ]),
  );
  const yMin = Math.min(...values) - 0.3;
  const yMax = Math.max(...values) + 0.3;
  const X = (lap: number) => ((lap - 0.5) / total) * 100;
  const Y = (v: number) => clamp((1 - (v - yMin) / (yMax - yMin)) * 100, 0, 100);

  const actual = (x: typeof a) =>
    linePath(
      x.run.laps.map((l) =>
        l.clean && l.lap_number <= x.completed
          ? [X(l.lap_number) * 10, Y(l.lap_time_sec as number) * 10]
          : null,
      ),
    );
  const predicted = (x: typeof a) =>
    linePath(
      x.run.laps.map((l) =>
        l.prediction && l.lap_number <= x.currentLap
          ? [X(l.lap_number) * 10, Y(l.prediction.predicted_lap_time_sec) * 10]
          : null,
      ),
    );
  const pits = [
    { x: a, color: colorA, top: 4 },
    { x: b, color: colorB, top: 20 },
  ].flatMap(({ x, color, top }) =>
    x.run.stints
      .slice(1)
      .filter((s) => s.start <= x.currentLap)
      .map((s) => ({ key: `${x.run.driver_code}${s.index}`, left: X(s.start - 0.5), color, top })),
  );

  const lap = hover;
  const rows =
    lap === null
      ? []
      : [
          { x: a, color: colorA },
          { x: b, color: colorB },
        ].map(({ x, color }) => {
          const row = x.run.laps[lap - 1];
          const raced = !!row && lap <= x.completed;
          return {
            code: x.run.driver_code,
            color,
            tyre: row ? tyreOf(row.compound).color : "#333",
            time: raced
              ? `${fmtLap(row.lap_time_sec)}${row.flag ? " *" : ""}`
              : row
                ? "not raced"
                : x.run.retired
                  ? "retired"
                  : "finished",
            predicted:
              raced && row.prediction ? fmtLap(row.prediction.predicted_lap_time_sec) : "—",
            lap: raced ? row : null,
          };
        });
  const bothRaced = rows.length === 2 && rows[0].lap !== null && rows[1].lap !== null;
  const flagged = bothRaced && (rows[0].lap?.flag || rows[1].lap?.flag);
  const delta = bothRaced ? (rows[1].lap?.lap_time_sec ?? 0) - (rows[0].lap?.lap_time_sec ?? 0) : 0;
  const cursor = clamp(X(Math.max(a.distance, b.distance) + 0.5), 0, 100);
  const hoverX = lap === null ? 0 : X(lap);

  return (
    <section className="flex min-h-[280px] flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-line bg-panel wide:min-h-[200px]">
      <Header>
        <span className="text-[13px] font-semibold">Lap times</span>
        <LineKey color={colorA} label={a.run.driver_code} />
        <LineKey color={colorB} label={b.run.driver_code} />
        <span className="text-[11.5px] text-ink-mute">
          Dashed = predicted · pit &amp; start laps hidden
        </span>
      </Header>
      <div
        className="relative mb-7 ml-[60px] mr-4 mt-3.5 min-h-[120px] flex-1"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 1, 2, 3].map((q) => {
          const value = yMin + ((yMax - yMin) * (q + 0.5)) / 4;
          return (
            <div
              key={q}
              className="absolute inset-x-0 border-t border-dashed border-[#2a2a30]"
              style={{ top: `${Y(value)}%` }}
            >
              <span className={`${AXIS} -left-14 -top-[7px]`}>{fmtLapAxis(value)}</span>
            </div>
          );
        })}
        {pits.map((pit) => (
          <div
            key={pit.key}
            className="absolute inset-y-0 border-l border-dashed"
            style={{ left: `${pit.left}%`, borderColor: pit.color }}
          >
            <span
              className="absolute left-1 text-[10px] font-bold"
              style={{ top: pit.top, color: pit.color }}
            >
              PIT
            </span>
          </div>
        ))}
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {[
            { d: predicted(a), color: colorA },
            { d: predicted(b), color: colorB },
          ].map(({ d, color }) => (
            <path
              key={color + "p"}
              d={d}
              style={{
                fill: "none",
                stroke: color,
                strokeWidth: 1.5,
                strokeDasharray: "5 5",
                opacity: 0.7,
                vectorEffect: "non-scaling-stroke",
              }}
            />
          ))}
          {[
            { d: actual(a), color: colorA },
            { d: actual(b), color: colorB },
          ].map(({ d, color }) => (
            <path
              key={color + "a"}
              d={d}
              style={{
                fill: "none",
                stroke: color,
                strokeWidth: 2.2,
                strokeLinejoin: "round",
                vectorEffect: "non-scaling-stroke",
              }}
            />
          ))}
        </svg>
        <div
          className="pointer-events-none absolute inset-y-0 border-l-2 border-accent"
          style={{ left: `${cursor}%` }}
        />
        {xTicks(total).map((n) => (
          <span
            key={n}
            className={`${AXIS} -bottom-5 -translate-x-1/2`}
            style={{ left: `${X(n)}%` }}
          >
            L{n}
          </span>
        ))}
        <div className="absolute inset-0 z-[3] flex">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i + 1)} />
          ))}
        </div>
        {lap !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[4] border-l border-white/35"
            style={{ left: `${hoverX}%` }}
          >
            <div
              className="absolute left-0 top-1 w-[230px] rounded-[10px] border border-popover bg-tooltip px-3 py-2.5 text-[12px] shadow-[0_12px_30px_rgba(0,0,0,.5)]"
              style={{
                transform: `translateX(${hoverX > 70 ? "calc(-100% - 8px)" : hoverX < 30 ? "8px" : "-50%"})`,
              }}
            >
              <div className="font-bold">Lap {lap}</div>
              {rows.map((row) => (
                <div
                  key={row.code}
                  className="mt-1.5 grid grid-cols-[4px_34px_8px_1fr_auto] items-center gap-1.5 font-mono text-[11.5px]"
                >
                  <span className="h-3.5 w-[3px]" style={{ background: row.color }} />
                  <span className="font-sans font-bold">{row.code}</span>
                  <span className="size-2 rounded-full" style={{ background: row.tyre }} />
                  <span>{row.time}</span>
                  <span className="text-ink-mute">{row.predicted}</span>
                </div>
              ))}
              <div className="mt-2 border-t border-control pt-2 text-[11.5px]">
                {!bothRaced
                  ? "Lap not completed by both"
                  : flagged
                    ? "* pit, start or neutralised lap"
                    : `${delta > 0 ? a.run.driver_code : b.run.driver_code} faster by ${Math.abs(delta).toFixed(3)} s · gap ${Math.abs(
                        battle.gaps[lap - 1]?.seconds ?? 0,
                      ).toFixed(2)} s`}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type GapMode = "gap" | "lap";

const MINUS = "−";
/** "+4.2", "−0.350" or "0": a signed number for readouts. */
const signed = (value: number, digits: number) =>
  value === 0 ? "0" : `${value > 0 ? "+" : MINUS}${Math.abs(value).toFixed(digits)}`;
const axisSeconds = (value: number) => {
  if (value === 0) return "0";
  const size = Math.abs(value);
  return `${value > 0 ? "+" : MINUS}${Number.isInteger(size) ? size : size.toFixed(1)} s`;
};

const LIMIT_STEPS = [0.5, 1, 2, 5, 10, 20, 40, 80, 160];

/**
 * Half-height of a chart axis: the first step above the 90th percentile of the values, so the
 * battle itself fills the chart and a pit-stop spike runs off the edge instead of setting the scale.
 */
function axisLimit(values: number[], floor: number): number {
  if (values.length === 0) return floor;
  const sorted = [...values].sort((x, y) => x - y);
  const high = sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))] * 1.15;
  return LIMIT_STEPS.find((step) => step >= Math.max(high, floor)) ?? 160;
}

const isPitFlag = (flag: string | null | undefined) => flag === "PIT IN" || flag === "PIT OUT";

/**
 * How the two drivers stand against each other lap by lap. "Gap" is the distance at every lap
 * line, with the pit stops marked; "Per lap" is the time one took from the other on each lap,
 * which says why the gap grew or shrank. Laps with a pit stop are left out of the second view.
 */
export function GapChart({ battle }: { battle: Battle }) {
  const { timeline } = useRace();
  const [mode, setMode] = useState<GapMode>("gap");
  const [hover, setHover] = useState<number | null>(null);
  const { a, b, colorA, colorB, gaps, front, lapsApart, interval } = battle;
  const codeA = a.run.driver_code;
  const codeB = b.run.driver_code;
  const total = timeline.totalLaps;
  const raced = gaps.length;
  const X = (lap: number) => ((lap - 0.5) / total) * 100;

  const flagOf = (x: Standing, lap: number) => x.run.laps[lap - 1]?.flag ?? null;
  const pitLap = (lap: number) => isPitFlag(flagOf(a, lap)) || isPitFlag(flagOf(b, lap));
  /** Seconds A took from B on this lap (negative: B took them from A); null on lap 1. */
  const gainAt = (lap: number): number | null =>
    lap >= 2 && lap <= raced ? gaps[lap - 1].seconds - gaps[lap - 2].seconds : null;

  const gapLimit = axisLimit(
    gaps.map((g) => Math.abs(g.seconds)),
    2,
  );
  const gainLimit = axisLimit(
    Array.from({ length: Math.max(0, raced - 1) }, (_, i) => i + 2)
      .filter((lap) => !pitLap(lap))
      .map((lap) => Math.abs(gainAt(lap) ?? 0)),
    0.5,
  );
  const limit = mode === "gap" ? gapLimit : gainLimit;
  const Y = (value: number) => (0.5 - clamp(value, -limit, limit) / limit / 2) * 100;
  const ticks = [limit, limit / 2, 0, -limit / 2, -limit];

  // Gap view: the line, its two coloured areas, the pit stops, and what runs off the scale.
  const points = gaps.map((g) => [X(g.lap) * 10, Y(g.seconds) * 10] as [number, number]);
  const line = linePath(points);
  const area = points.length
    ? `M${points[0][0]},500L${points.map(([px, py]) => `${px},${py}`).join("L")}L${points[points.length - 1][0]},500Z`
    : "";
  const pitMarks = gaps.flatMap((g) =>
    [a, b]
      .filter((x) => flagOf(x, g.lap) === "PIT IN")
      .map((x, index, all) => ({
        key: `${x.run.driver_code}${g.lap}`,
        left: X(g.lap),
        top: Y(g.seconds),
        color: x === a ? colorA : colorB,
        shift: all.length === 2 ? (index === 0 ? -8 : 8) : 0,
        title: `${x.run.driver_code} pits on lap ${g.lap}`,
      })),
  );
  // Stretches that run off the scale, each reduced to its highest point (copies: `gaps` is shared).
  const offScale: { lap: number; seconds: number }[] = [];
  let previous: { lap: number; sign: number } | null = null;
  for (const g of gaps) {
    if (Math.abs(g.seconds) <= limit) {
      previous = null;
      continue;
    }
    const sign = Math.sign(g.seconds);
    if (previous && previous.sign === sign && g.lap - previous.lap <= 1) {
      const peak = offScale[offScale.length - 1];
      if (Math.abs(g.seconds) > Math.abs(peak.seconds)) offScale[offScale.length - 1] = { ...g };
    } else {
      offScale.push({ lap: g.lap, seconds: g.seconds });
    }
    previous = { lap: g.lap, sign };
  }

  // Per-lap view: the net of the last five laps without a pit stop, for the header.
  const recent: number[] = [];
  for (let lap = raced; lap >= 2 && recent.length < 5; lap -= 1) {
    const gain = gainAt(lap);
    if (!pitLap(lap) && gain !== null) recent.push(gain);
  }
  const recentNet = recent.reduce((sum, gain) => sum + gain, 0);

  const readout =
    mode === "gap"
      ? {
          text: `${front.run.driver_code} ahead by ${
            lapsApart >= 1
              ? `${lapsApart} ${lapsApart > 1 ? "laps" : "lap"}`
              : `${interval.toFixed(1)} s`
          }`,
          color: front === a ? colorA : colorB,
        }
      : recent.length === 0
        ? { text: "no clean laps yet", color: "var(--color-ink-mute)" }
        : Math.abs(recentNet) < 0.05
          ? { text: `last ${recent.length} laps: even`, color: "var(--color-ink-dim)" }
          : {
              text: `last ${recent.length} laps: ${recentNet > 0 ? codeA : codeB} ${signed(Math.abs(recentNet), 1)} s`,
              color: recentNet > 0 ? colorA : colorB,
            };

  const cursor = clamp(X(Math.max(a.distance, b.distance) + 0.5), 0, 100);
  const tint = (color: string) =>
    `color-mix(in srgb, ${color === "#ffffff" ? "#888888" : color} 7%, transparent)`;

  const lap = hover !== null && hover <= raced ? hover : null;
  const tip =
    lap === null
      ? null
      : (() => {
          const seconds = gaps[lap - 1].seconds;
          const gain = gainAt(lap);
          return {
            ahead: {
              code: seconds >= 0 ? codeA : codeB,
              color: seconds >= 0 ? colorA : colorB,
              seconds,
            },
            change:
              gain === null
                ? null
                : pitLap(lap)
                  ? "Pit stop lap: change not counted"
                  : `${gain >= 0 ? codeA : codeB} took ${Math.abs(gain).toFixed(3)} s`,
            notes: [a, b]
              .filter((x) => isPitFlag(flagOf(x, lap)))
              .map((x) => `${x.run.driver_code} ${String(flagOf(x, lap)).toLowerCase()}`),
          };
        })();
  const hoverX = lap === null ? 0 : X(lap);
  const barWidth = (100 / total) * 0.68;

  return (
    <section className="flex min-h-[200px] flex-[1_1_0] flex-col overflow-hidden rounded-xl border border-line bg-panel wide:min-h-[190px]">
      <Header>
        <span className="text-[13px] font-semibold">Gap between drivers</span>
        <span className="flex overflow-hidden rounded-md border border-control text-[11.5px] font-semibold">
          {(
            [
              ["gap", "Gap"],
              ["lap", "Per lap"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`cursor-pointer px-2.5 py-[3px] ${
                mode === value
                  ? "bg-pressed text-ink"
                  : "bg-transparent text-ink-mute hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </span>
        <span className="hidden text-[11.5px] text-ink-mute min-[1100px]:inline">
          {mode === "gap"
            ? "At each lap line · P = pit stop"
            : "Time taken from the other driver each lap · grey = pit lap"}
        </span>
        <span
          className="ml-auto whitespace-nowrap text-[12px] font-semibold"
          style={{ color: readout.color }}
        >
          {readout.text}
        </span>
      </Header>
      <div
        className="relative mb-[26px] ml-[60px] mr-4 mt-3 min-h-[100px] flex-1"
        onMouseLeave={() => setHover(null)}
      >
        <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: tint(colorA) }} />
        <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: tint(colorB) }} />
        <span
          className="pointer-events-none absolute left-1.5 top-1 z-[1] text-[10.5px] font-bold"
          style={{ color: colorA }}
        >
          {mode === "gap" ? `▲ ${codeA} ahead` : `▲ ${codeA} took time`}
        </span>
        <span
          className="pointer-events-none absolute bottom-1 left-1.5 z-[1] text-[10.5px] font-bold"
          style={{ color: colorB }}
        >
          {mode === "gap" ? `▼ ${codeB} ahead` : `▼ ${codeB} took time`}
        </span>
        {ticks.map((value) => (
          <div
            key={value}
            className="absolute inset-x-0 border-t"
            style={{
              top: `${Y(value)}%`,
              borderStyle: value === 0 ? "solid" : "dashed",
              borderColor: value === 0 ? "#4a4a52" : "var(--color-hairline)",
            }}
          >
            <span className={`${AXIS} -left-14 -top-[7px] w-12 text-right`}>
              {axisSeconds(value)}
            </span>
          </div>
        ))}

        {mode === "gap" ? (
          <>
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <defs>
                <clipPath id="gap-above">
                  <rect x="0" y="0" width="1000" height="500" />
                </clipPath>
                <clipPath id="gap-below">
                  <rect x="0" y="500" width="1000" height="500" />
                </clipPath>
              </defs>
              <path d={area} clipPath="url(#gap-above)" style={{ fill: colorA, opacity: 0.22 }} />
              <path d={area} clipPath="url(#gap-below)" style={{ fill: colorB, opacity: 0.26 }} />
              <path
                d={line}
                style={{
                  fill: "none",
                  stroke: "#ffffff",
                  strokeWidth: 2.2,
                  strokeLinejoin: "round",
                  vectorEffect: "non-scaling-stroke",
                }}
              />
            </svg>
            {pitMarks.map((mark) => (
              <span
                key={mark.key}
                title={mark.title}
                className="pointer-events-none absolute z-[2] grid size-[15px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{
                  left: `calc(${mark.left}% + ${mark.shift}px)`,
                  top: `${mark.top}%`,
                  background: mark.color,
                  boxShadow: "0 0 0 1.5px var(--color-panel)",
                }}
              >
                P
              </span>
            ))}
            {offScale.map((peak) => (
              <span
                key={`off${peak.lap}`}
                className="pointer-events-none absolute z-[2] -translate-x-1/2 font-mono text-[10px] font-semibold text-ink-dim"
                style={{ left: `${X(peak.lap)}%`, [peak.seconds > 0 ? "top" : "bottom"]: 1 }}
              >
                {peak.seconds > 0 ? "▲" : "▼"} {Math.abs(peak.seconds).toFixed(1)} s
              </span>
            ))}
          </>
        ) : (
          gaps.map((g) => {
            const gain = gainAt(g.lap);
            if (gain === null) return null;
            const pit = pitLap(g.lap);
            const share = Math.min(1, Math.abs(gain) / limit) * 0.5;
            const up = gain >= 0;
            return (
              <div
                key={g.lap}
                className="absolute rounded-[2px]"
                style={{
                  left: `${X(g.lap) - barWidth / 2}%`,
                  width: `${barWidth}%`,
                  top: pit ? "43%" : up ? `${50 - share * 100}%` : "50%",
                  height: pit ? "14%" : `max(2px, ${share * 100}%)`,
                  background: pit ? "var(--color-control)" : up ? colorA : colorB,
                }}
              />
            );
          })
        )}

        <div
          className="pointer-events-none absolute inset-y-0 border-l-2 border-accent"
          style={{ left: `${cursor}%` }}
        />
        {xTicks(total).map((n) => (
          <span
            key={n}
            className={`${AXIS} -bottom-5 -translate-x-1/2`}
            style={{ left: `${X(n)}%` }}
          >
            L{n}
          </span>
        ))}

        <div className="absolute inset-0 z-[3] flex">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i + 1)} />
          ))}
        </div>
        {tip && lap !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[4] border-l border-white/35"
            style={{ left: `${hoverX}%` }}
          >
            <div
              className="absolute left-0 top-1 w-[220px] rounded-[10px] border border-popover bg-tooltip px-3 py-2 text-[12px] shadow-[0_12px_30px_rgba(0,0,0,.5)]"
              style={{
                transform: `translateX(${hoverX > 70 ? "calc(-100% - 8px)" : hoverX < 30 ? "8px" : "-50%"})`,
              }}
            >
              <div className="font-bold">Lap {lap}</div>
              <div className="mt-1 font-mono text-[11.5px]" style={{ color: tip.ahead.color }}>
                {tip.ahead.code} ahead by {Math.abs(tip.ahead.seconds).toFixed(2)} s
              </div>
              {tip.change && (
                <div className="mt-0.5 font-mono text-[11.5px] text-ink-dim">{tip.change}</div>
              )}
              {tip.notes.length > 0 && (
                <div className="mt-0.5 text-[11px] text-ink-mute">{tip.notes.join(" · ")}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
