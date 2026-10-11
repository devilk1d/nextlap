"use client";

import { useState } from "react";
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

const ROW = "grid grid-cols-[20px_28px_3px_minmax(0,1fr)_auto_38px] items-center gap-2 px-3";

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

/** Running order with grid delta, interval or gap to leader, and current tyre age. */
export function LiveOrder({ standings, highlight, onPick }: Props) {
  const [mode, setMode] = useState<GapMode>("interval");

  return (
    <section className="flex-none overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-divider px-3.5 py-[9px]">
        <span className="whitespace-nowrap text-[13px] font-semibold">Live order</span>
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
          "pb-1 pt-1.5 text-[10px] font-bold tracking-[.06em] text-ink-mute gap-2",
        )}
      >
        <span>POS</span>
        <span>GRID</span>
        <span />
        <span>DRIVER</span>
        <span className="text-right">GAP</span>
        <span className="text-right">TYRE</span>
      </div>
      <div className="pb-1">
        {standings.map((s) => {
          const code = s.run.driver_code;
          const on = highlight.has(code);
          const grid = s.run.grid_position;
          const change = grid === null ? 0 : grid - s.position;
          const tyre = tyreText(s);
          const interval = mode === "interval";
          const attacking = interval && s.position > 1 && (s.gapAhead ?? 9) < 1 && !s.lapsAhead;
          return (
            <div
              key={code}
              onClick={() => onPick(code)}
              className={cn(ROW, "cursor-pointer py-[5px]")}
              style={{
                background: on
                  ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                  : undefined,
                boxShadow: on ? "inset 2px 0 0 var(--color-accent)" : undefined,
              }}
            >
              <span className="font-cond text-[15px] font-bold">{s.position}</span>
              <span
                className="text-[10.5px] font-bold"
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
              <span className="text-[12.5px] font-bold">{code}</span>
              <span
                className={cn(
                  "whitespace-nowrap text-right font-mono text-[11.5px]",
                  attacking ? "text-accent" : "text-ink",
                  s.position === 1 && "text-ink-mute",
                )}
              >
                {gapText(s, mode)}
              </span>
              <span
                className="flex items-center justify-end gap-1 text-[11px] font-semibold"
                style={{ color: tyre.color }}
              >
                <TyreDot color={tyreOf(s.lap.compound).color} />
                {tyre.text}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
