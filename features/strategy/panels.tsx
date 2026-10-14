"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plot } from "@/components/charts/Plot";
import { Swatch, TeamBar, TyreDot } from "@/components/ui/Swatch";
import { Table, Td, Th } from "@/components/ui/Table";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { DRY_COMPOUNDS, EVENT, tyreOf } from "@/lib/race/constants";
import { median, niceTicks, percentOf, quantileSorted } from "@/lib/stats";
import type { Compound } from "@/server/db/schema";
import type { CompoundFits, CompoundRow, DegradationPoint, PitStop, StintRow } from "./analysis";

const signed = (value: number, digits = 3) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

const MIN_TREND = 0.002; // s per lap below which a trend is called flat
const MIN_LINE_LAPS = 20; // a compound needs this many laps before its trend is drawn

const seconds1 = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} s`;
const axisSeconds = (value: number) =>
  Math.abs(value) < 0.005 ? "0 s" : `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}s`;

/** One sentence about a compound's trend, in plain words. */
function trendSentence(name: string, slope: number) {
  if (Math.abs(slope) < MIN_TREND) return `${name} barely changes with age`;
  const amount = Math.abs(slope).toFixed(3);
  return slope > 0
    ? `${name} loses about ${amount} s every lap`
    : `${name} gets about ${amount} s quicker every lap`;
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="How this is calculated"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid size-[15px] cursor-help place-items-center rounded-full border border-control bg-transparent p-0 text-[10px] font-bold text-ink-mute"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 top-full z-20 mt-2 w-[270px] rounded-lg border border-popover bg-tooltip p-2.5 text-[11.5px] font-normal leading-[1.45] text-ink-dim shadow-[0_12px_30px_rgba(0,0,0,.5)]"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** A hover card: `x`/`y` is the point it refers to, in screen coordinates. */
type Hover = { x: number; y: number; title: string; lines: string[]; color: string };

/**
 * Floats next to a point of the screen and picks the side with room: above it when it fits,
 * else below, else beside it; it is always kept inside the window. Fixed and in the body, so no
 * card with `overflow: hidden` can cut it off.
 */
function HoverCard({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, lo), Math.max(lo, hi));
    let left = clamp(x - w / 2, margin, vw - w - margin);
    let top = y - h - gap;
    if (top < margin) top = y + gap;
    if (top + h > vh - margin) {
      // Neither above nor below fits: put it beside the point, on the roomier side.
      top = clamp(y - h / 2, margin, vh - h - margin);
      left =
        vw - x - gap > x - gap
          ? clamp(x + gap, margin, vw - w - margin)
          : clamp(x - w - gap, margin, vw - w - margin);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, children]);
  return createPortal(
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[80] w-[230px] rounded-lg border border-popover bg-tooltip px-2.5 py-2 text-[11.5px] leading-[1.45] shadow-[0_12px_30px_rgba(0,0,0,.55)]"
    >
      {children}
    </div>,
    document.body,
  );
}

export function DegradationChart({
  points,
  fits,
  focusCode,
  fill = false,
}: {
  points: DegradationPoint[];
  fits: CompoundFits;
  focusCode: string;
  /** Take the height of the card (which must be a flex column) instead of a fixed 230 px. */
  fill?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  if (points.length < 8) {
    return (
      <div className="py-5 text-[12px] text-ink-mute">
        Not enough clean laps yet. Move the replay forward.
      </div>
    );
  }

  const fitted = DRY_COMPOUNDS.filter((compound) => (fits[compound]?.n ?? 0) >= MIN_LINE_LAPS);
  const ageMax = Math.max(...points.map((p) => p.age)) + 1;
  const toX = (age: number) => percentOf(age, 0, ageMax);

  /**
   * Every stint is measured from its own fresh-tyre time: the median of its laps once the
   * compound's wear trend is taken out. This way a quick driver and a slow one both start at 0,
   * and a dot shows how much slower that lap was than the same set of tyres when it was new.
   */
  const baseline = new Map<string, number>();
  const offsets = new Map<string, number[]>();
  for (const p of points) {
    const fit = fits[p.compound];
    if (!fit) continue;
    const key = `${p.code}:${p.stint}`;
    offsets.set(key, [...(offsets.get(key) ?? []), p.seconds - fit.slope * p.age]);
  }
  for (const [key, values] of offsets) baseline.set(key, median(values) ?? 0);
  const relative = (p: DegradationPoint) => {
    const base = baseline.get(`${p.code}:${p.stint}`);
    return base === undefined ? null : p.seconds - base;
  };
  const mine = points.filter((p) => p.code === focusCode && relative(p) !== null);
  const others = showAll ? points.filter((p) => p.code !== focusCode && relative(p) !== null) : [];
  const shown = [...mine, ...others];

  const lineEnds = fitted.map((compound) => {
    const fit = fits[compound]!;
    return fit.slope * Math.max(fit.xMax, 1);
  });
  const spread = shown.map((p) => relative(p) as number).sort((a, b) => a - b);
  const low = quantileSorted(spread, 0.03) ?? 0;
  const high = quantileSorted(spread, 0.97) ?? 0;
  const yMin = Math.min(0, low, ...lineEnds) - 0.06;
  const yMax = Math.max(0.1, high, ...lineEnds) + 0.08;

  const moveOnLine = (compound: Compound) => (event: React.MouseEvent<SVGLineElement>) => {
    const plot = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    const fit = fits[compound];
    if (!plot || !fit) return;
    const age = Math.min(
      Math.max(((event.clientX - plot.left) / plot.width) * ageMax, 0),
      Math.max(fit.xMax, 1),
    );
    const loss = fit.slope * age;
    const tyre = tyreOf(compound);
    setHover({
      x: event.clientX,
      y: event.clientY,
      color: tyre.color,
      title: `${tyre.name} trend`,
      lines: [
        trendSentence(tyre.name, fit.slope),
        `About ${seconds1(loss)} ${loss >= 0 ? "slower" : "quicker"} after ${Math.round(age)} laps`,
        `${fit.n} laps measured`,
      ],
    });
  };

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <div className="mb-0.5 flex items-center justify-between gap-2 px-0.5 text-[11.5px] text-ink-mute">
        <span>How much slower the car gets as the tyres age</span>
        <span className="flex items-center gap-2.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-ink-dim">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
              className="size-3 cursor-pointer accent-[var(--color-accent)]"
            />
            Show all laps
          </label>
          <InfoTip text="Lap times are corrected for the fuel the car burns off (0.05 s per lap is assumed). Every stint is measured from its own fresh-tyre time, so quick and slow cars start at the same zero. Each line is the median trend of the drivers' stints on that compound. Dots are single clean laps. A trend that goes down means the lighter car gains more than the tyres lose." />
        </span>
      </div>
      <Plot
        height={fill ? undefined : 230}
        className={
          fill ? "mx-2 mb-6 mt-1.5 ml-[52px] min-h-[100px] flex-1" : "mx-2 mb-6 mt-1.5 ml-[52px]"
        }
        yMin={yMin}
        yMax={yMax}
        yFormat={axisSeconds}
        ticks={niceTicks(yMin, yMax, 5).filter((t) => t >= yMin && t <= yMax)}
      >
        {(toY) => (
          <>
            {niceTicks(0, ageMax, 6)
              .filter((age) => age <= ageMax * 0.84)
              .map((age) => (
                <span
                  key={age}
                  className="absolute -bottom-[19px] -translate-x-1/2 font-mono text-[10.5px] text-ink-mute"
                  style={{ left: `${toX(age)}%` }}
                >
                  {age}
                </span>
              ))}
            <span className="absolute -bottom-[19px] right-0 text-[10.5px] text-ink-mute">
              tyre age (laps) →
            </span>
            {/* fresh tyres */}
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-ink-faint"
              style={{ top: `${toY(0)}%` }}
            />
            {shown
              .filter((p) => (relative(p) as number) >= yMin && (relative(p) as number) <= yMax)
              .map((p) => {
                const mineLap = p.code === focusCode;
                const color = tyreOf(p.compound).color;
                const value = relative(p) as number;
                const fit = fits[p.compound]!;
                const vsTrend = value - fit.slope * p.age;
                return (
                  <span
                    key={`${p.code}-${p.lap}`}
                    onMouseEnter={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      setHover({
                        x: box.left + box.width / 2,
                        y: box.top + box.height / 2,
                        color,
                        title: `${p.code} · lap ${p.lap}`,
                        lines: [
                          `${tyreOf(p.compound).name} tyres, ${p.age} laps old`,
                          `${fmtLapAxis(p.seconds)} (fuel-corrected)`,
                          Math.abs(vsTrend) < 0.005
                            ? "Right on the trend for this age"
                            : `${Math.abs(vsTrend).toFixed(2)} s ${vsTrend < 0 ? "quicker" : "slower"} than the trend of its tyres at this age`,
                        ],
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full"
                    style={{
                      left: `${toX(p.age)}%`,
                      top: `${toY(value)}%`,
                      width: mineLap ? 10 : 5,
                      height: mineLap ? 10 : 5,
                      zIndex: mineLap ? 3 : 1,
                      background: mineLap ? color : `color-mix(in srgb, ${color} 40%, transparent)`,
                      boxShadow: mineLap
                        ? "0 0 0 2px #17171a, 0 0 0 3.5px var(--color-accent)"
                        : "none",
                    }}
                  />
                );
              })}
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
              style={{ zIndex: 2 }}
            >
              {fitted.map((compound) => {
                const fit = fits[compound]!;
                const end = Math.max(fit.xMax, 1);
                const coords = {
                  x1: toX(0) * 10,
                  y1: toY(0) * 10,
                  x2: toX(end) * 10,
                  y2: toY(fit.slope * end) * 10,
                };
                return (
                  <g key={compound}>
                    <line
                      {...coords}
                      style={{
                        stroke: tyreOf(compound).color,
                        strokeWidth: 3,
                        vectorEffect: "non-scaling-stroke",
                      }}
                    />
                    <line
                      {...coords}
                      onMouseMove={moveOnLine(compound)}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        stroke: "transparent",
                        strokeWidth: 16,
                        vectorEffect: "non-scaling-stroke",
                        pointerEvents: "stroke",
                        cursor: "help",
                      }}
                    />
                  </g>
                );
              })}
            </svg>
            {fitted.map((compound) => {
              const fit = fits[compound]!;
              const end = Math.max(fit.xMax, 1);
              const tyre = tyreOf(compound);
              return (
                <span
                  key={compound}
                  className="pointer-events-none absolute whitespace-nowrap text-[11px] font-bold"
                  style={{
                    left: `${toX(end)}%`,
                    top: `${toY(fit.slope * end)}%`,
                    transform: "translate(-100%, calc(-100% - 5px))",
                    color: tyre.color,
                    zIndex: 4,
                  }}
                >
                  {tyre.name} {seconds1(fit.slope * end)}
                </span>
              );
            })}
            {hover && (
              <HoverCard x={hover.x} y={hover.y}>
                <div className="flex items-center gap-1.5 font-bold text-ink">
                  <span className="size-2 rounded-full" style={{ background: hover.color }} />
                  {hover.title}
                </div>
                {hover.lines.map((line) => (
                  <div key={line} className="text-ink-dim">
                    {line}
                  </div>
                ))}
              </HoverCard>
            )}
          </>
        )}
      </Plot>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-soft">
        {DRY_COMPOUNDS.map((compound) => {
          const fit = fits[compound];
          const tyre = tyreOf(compound);
          const enough = fit !== undefined && fit.n >= MIN_LINE_LAPS;
          return (
            <span key={compound} className="flex items-center gap-1.5">
              <Swatch color={tyre.color} size={[14, 3]} radius={1} />
              {enough ? (
                <>
                  {trendSentence(tyre.name, fit.slope)}
                  <span className="text-ink-mute">({fit.n} laps)</span>
                </>
              ) : (
                <span className="text-ink-mute">
                  {tyre.name}: not enough laps yet{fit ? ` (${fit.n})` : ""}
                </span>
              )}
            </span>
          );
        })}
        <span className="flex items-center gap-1.5 text-ink-mute">
          <span className="size-2 rounded-full shadow-[0_0_0_2px_var(--color-accent)]" />
          {focusCode}: one dot = one clean lap
        </span>
      </div>
    </div>
  );
}

export function PitStopsTable({
  stops,
  focusCode,
  fill = false,
}: {
  stops: PitStop[];
  focusCode: string;
  /** Scroll inside the height of the card (a flex column) instead of a 320 px cap. */
  fill?: boolean;
}) {
  if (!stops.length) return <div className="text-[12px] text-ink-mute">No pit stops yet.</div>;
  const fastest = Math.min(...stops.map((s) => s.laneSeconds ?? Infinity));
  return (
    <div className={fill ? "min-h-0 flex-1 overflow-auto" : "max-h-[320px] overflow-auto"}>
      <Table>
        <thead>
          <tr>
            {["LAP", "DRIVER", "TYRES", "STINT", "PIT LANE", "LOSS", "POS", "NOTE"].map(
              (name, i) => (
                <Th key={name} left={i === 1 || i === 7}>
                  {name}
                </Th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {stops.map((stop) => {
            const gained = (stop.positionBefore ?? 0) - (stop.positionAfter ?? 0);
            return (
              <tr
                key={`${stop.code}-${stop.lap}`}
                className={stop.code === focusCode ? "bg-accent/8" : undefined}
              >
                <Td>L{stop.lap}</Td>
                <Td left text>
                  <span className="flex items-center gap-1.5">
                    <TeamBar color={stop.color} />
                    <b>{stop.code}</b>
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <TyreDot color={tyreOf(stop.from).color} />→
                    <TyreDot color={tyreOf(stop.to).color} />
                  </span>
                </Td>
                <Td>{stop.stintLaps} laps</Td>
                <Td className={stop.laneSeconds === fastest ? "text-best" : undefined}>
                  {stop.laneSeconds === null ? "—" : `${stop.laneSeconds.toFixed(1)} s`}
                </Td>
                <Td>{stop.lossSeconds === null ? "—" : `${stop.lossSeconds.toFixed(1)} s`}</Td>
                <Td
                  className={gained > 0 ? "text-go" : gained < 0 ? "text-stop" : "text-ink-mute"}
                >{`P${stop.positionBefore ?? "–"}→P${stop.positionAfter ?? "–"}`}</Td>
                <Td
                  left
                  text
                  style={{ color: stop.under ? EVENT[stop.under].color : "var(--color-ink-mute)" }}
                >
                  {stop.under ? `Under ${stop.under}` : ""}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

export function CompoundTable({ rows }: { rows: CompoundRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            {["TYRE", "STINTS", "AVG LEN", "LAPS", "WEAR"].map((name, i) => (
              <Th key={name} left={i === 0}>
                {name}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.compound}>
              <Td left text>
                <span className="flex items-center gap-1.5">
                  <TyreDot color={tyreOf(row.compound).color} size={9} />
                  {tyreOf(row.compound).name}
                </span>
              </Td>
              <Td>{row.stints}</Td>
              <Td>{row.averageLength?.toFixed(1) ?? "—"}</Td>
              <Td>{row.laps}</Td>
              <Td>{row.slope === null ? "—" : signed(row.slope)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export function StintsTable({ rows }: { rows: StintRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          {["STINT", "LAPS", "BEST", "AVG", "WEAR"].map((name, i) => (
            <Th key={name} left={i === 0}>
              {name}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.index}>
            <Td left text>
              <span className="flex items-center gap-1.5">
                <TyreDot color={tyreOf(row.compound).color} size={9} />
                {`${row.index + 1} · L${row.start}–${row.end}`}
              </span>
            </Td>
            <Td>{row.laps}</Td>
            <Td>{row.best === null ? "—" : fmtLap(row.best)}</Td>
            <Td>{row.average === null ? "—" : fmtLap(row.average)}</Td>
            <Td>{row.slope === null ? "—" : signed(row.slope)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
