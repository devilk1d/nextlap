"use client";

import { useState, type CSSProperties } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { TeamBar, TyreDot } from "@/components/ui/Swatch";
import { cn } from "@/components/ui/cn";
import { fmtGap, fmtLapsDown } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Standing } from "@/lib/race/timeline";

type GapMode = "interval" | "leader";

type Props = {
  standings: Standing[];
  highlight: ReadonlySet<string>;
  onPick: (code: string) => void;
};

const ROW = "grid grid-cols-[24px_28px_3px_minmax(0,1fr)_auto_38px] items-center gap-2 px-3";
/** Fixed row height: rows are positioned by `index × ROW_HEIGHT` so they can slide. */
const ROW_HEIGHT = 28;
/** Moves further than this (a jump in the replay, not an overtake) slide without a flash. */
const MAX_FLASH_PLACES = 3;

/**
 * Keyframes live here so the list works wherever it is used (React hoists one `<style>` with
 * `href` and `precedence` into the head, however many rows there are).
 */
const CSS = `
@keyframes lo-gain { 0% { background-color: rgba(61, 220, 132, .38); } 100% { background-color: transparent; } }
@keyframes lo-loss { 0% { background-color: rgba(255, 90, 90, .32); } 100% { background-color: transparent; } }
.lo-row { transition: transform 420ms cubic-bezier(.2, .8, .2, 1); will-change: transform; }
.lo-gain { animation: lo-gain 1800ms ease-out both; }
.lo-loss { animation: lo-loss 1800ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .lo-row { transition: none; }
  .lo-gain, .lo-loss { animation: none; }
}
`;

function gapText(s: Standing, mode: GapMode): string {
  if (s.retired) return "OUT";
  if (s.position === 1) return "Leader";
  if (mode === "interval")
    return s.lapsAhead >= 1 ? fmtLapsDown(s.lapsAhead) : fmtGap(s.gapAhead ?? 0);
  return s.lapsDown >= 1 ? fmtLapsDown(s.lapsDown) : fmtGap(s.toLeader);
}

function tyreText(s: Standing): { text: string; color: string } {
  if (s.retired) return { text: "OUT", color: "var(--color-ink-dim)" };
  if (s.inPit) return { text: "PIT", color: "var(--color-caution)" };
  if (s.done) return { text: "FIN", color: "var(--color-ink-dim)" };
  return { text: String(s.lap.tyre_life ?? "–"), color: "var(--color-ink-dim)" };
}

type RowProps = {
  s: Standing;
  index: number;
  mode: GapMode;
  on: boolean;
  onPick: (code: string) => void;
};

/** One driver. Its row slides to `index` and flashes green or red when it gains or loses places. */
function LiveRow({ s, index, mode, on, onPick }: RowProps) {
  const code = s.run.driver_code;
  const [seen, setSeen] = useState({ index, flash: "" as "" | "lo-gain" | "lo-loss", run: 0 });
  if (seen.index !== index) {
    const moved = seen.index - index; // > 0: moved up the order
    setSeen({
      index,
      flash: Math.abs(moved) <= MAX_FLASH_PLACES ? (moved > 0 ? "lo-gain" : "lo-loss") : "",
      run: seen.run + 1,
    });
  }

  const grid = s.run.grid_position;
  const change = grid === null ? 0 : grid - s.position;
  const tyre = tyreText(s);
  const interval = mode === "interval";
  const attacking = interval && s.position > 1 && (s.gapAhead ?? 9) < 1 && !s.lapsAhead;

  return (
    <div
      onClick={() => onPick(code)}
      className={cn(ROW, "lo-row absolute inset-x-0 top-0 cursor-pointer")}
      style={
        {
          height: ROW_HEIGHT,
          transform: `translateY(${index * ROW_HEIGHT}px)`,
          background: on ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : undefined,
          boxShadow: on ? "inset 2px 0 0 var(--color-accent)" : undefined,
          // Rows on their way up pass over the ones they overtake.
          zIndex: seen.flash === "lo-gain" ? 2 : 1,
        } as CSSProperties
      }
    >
      {seen.flash && (
        <span
          key={seen.run}
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 -z-10", seen.flash)}
        />
      )}
      <span className="relative font-cond text-[15px] font-bold">{s.position}</span>
      <span
        className="relative text-[11.5px] font-bold"
        style={{
          color:
            change > 0
              ? "var(--color-go)"
              : change < 0
                ? "var(--color-stop)"
                : "var(--color-ink-mute)",
        }}
      >
        {change > 0 ? `▲${change}` : change < 0 ? `▼${-change}` : "–"}
      </span>
      <TeamBar color={s.run.color} height={16} />
      <span className="relative text-[13.5px] font-bold">{code}</span>
      <span
        className={cn(
          "relative whitespace-nowrap text-right font-mono text-[12.5px]",
          attacking ? "text-accent" : "text-ink",
          s.position === 1 && "text-ink-mute",
        )}
      >
        {gapText(s, mode)}
      </span>
      <span
        className="relative flex items-center justify-end gap-1 text-[12px] font-semibold"
        style={{ color: tyre.color }}
      >
        <TyreDot color={tyreOf(s.lap.compound).color} />
        {tyre.text}
      </span>
    </div>
  );
}

/** Running order with grid delta, interval or gap to leader, and current tyre age. */
export function LiveOrder({ standings, highlight, onPick }: Props) {
  const [mode, setMode] = useState<GapMode>("interval");

  // Rows keep a fixed place in the DOM and move with a transform, so the browser can animate
  // them; reordering the DOM nodes would make them jump instead.
  const stable = [...standings].sort(
    (a, b) =>
      (a.run.grid_position ?? 99) - (b.run.grid_position ?? 99) ||
      a.run.driver_code.localeCompare(b.run.driver_code),
  );
  const index = new Map(standings.map((s, i) => [s.run.driver_code, i]));

  return (
    <section
      data-tour="order"
      className="flex-none overflow-hidden rounded-xl border border-line bg-panel"
    >
      <style href="live-order" precedence="default">
        {CSS}
      </style>
      <div className="flex items-center justify-between gap-2 border-b border-divider px-3.5 py-[9px]">
        <span className="whitespace-nowrap text-[14px] font-semibold">Live order</span>
        <Segmented
          variant="compact"
          value={mode}
          onChange={setMode}
          options={[
            { value: "interval", label: "Interval" },
            { value: "leader", label: "To leader" },
          ]}
        />
      </div>
      <div
        className={cn(
          ROW,
          "pb-1 pt-1.5 text-[11px] font-bold tracking-[.06em] text-ink-mute gap-2",
        )}
      >
        <span>POS</span>
        <span>GRID</span>
        <span />
        <span>DRIVER</span>
        <span className="text-right">GAP</span>
        <span className="text-right">TYRE</span>
      </div>
      <div
        className="relative mb-1"
        style={{ height: standings.length * ROW_HEIGHT }}
        role="list"
        aria-label="Running order"
      >
        {stable.map((s) => (
          <LiveRow
            key={s.run.driver_code}
            s={s}
            index={index.get(s.run.driver_code) ?? 0}
            mode={mode}
            on={highlight.has(s.run.driver_code)}
            onPick={onPick}
          />
        ))}
      </div>
    </section>
  );
}
