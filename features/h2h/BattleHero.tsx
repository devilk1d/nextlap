"use client";

import { useMemo } from "react";
import { TeamBar, TyreDot } from "@/components/ui/Swatch";
import { fmtLap, stripGrandPrix } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import { sectorShares } from "@/lib/race/laps";
import { geometryFor } from "@/lib/race/track";
import type { Frame, Standing } from "@/lib/race/timeline";
import { TrackPanel } from "@/features/common/TrackPanel";
import { useRace } from "@/features/dashboard/race-context";
import { sectorMedians, type Battle } from "./battle";

type Props = { battle: Battle; frame: Frame };

function SideRow({ x, color }: { x: Standing; color: string }) {
  const last = x.completed >= 1 ? x.run.laps[x.completed - 1] : null;
  return (
    <div className="grid grid-cols-[3px_36px_30px_minmax(0,1fr)_auto] items-center gap-2 border-b border-divider px-3.5 py-[9px]">
      <TeamBar color={color} height={16} />
      <span className="font-bold">{x.run.driver_code}</span>
      <span className="font-cond text-[15px] font-bold text-ink-dim">P{x.position}</span>
      <span className="font-mono text-[12px]">
        {fmtLap(last?.lap_time_sec)}
        {last?.flag ? " *" : ""}
      </span>
      <span className="flex items-center gap-1 text-[11.5px] text-ink-dim">
        <TyreDot color={tyreOf(x.lap.compound).color} />
        {x.inPit ? "PIT" : `${x.lap.tyre_life ?? "–"} laps`}
      </span>
    </div>
  );
}

/** Live interval between the two drivers beside the track with sector dominance. */
export function BattleHero({ battle, frame }: Props) {
  const { race, timeline } = useRace();
  const { a, b, colorA, colorB, front, lapsApart, interval, trend } = battle;
  const geometry = useMemo(() => geometryFor(race.circuit.short_name), [race.circuit.short_name]);
  const sectors = useMemo(() => sectorShares(timeline), [timeline]);

  const medianA = sectorMedians(a);
  const medianB = sectorMedians(b);
  const faster = [0, 1, 2].map((k) => {
    const ta = medianA[k];
    const tb = medianB[k];
    if (ta === null || tb === null) return null;
    return ta <= tb
      ? { x: a, color: colorA, delta: tb - ta }
      : { x: b, color: colorB, delta: ta - tb };
  });

  return (
    <section className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-stage wide:min-h-0 wide:flex-[1.7_1_0]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--color-accent) 18%, transparent) 1px, transparent 1.3px)",
          backgroundSize: "9px 9px",
        }}
      />
      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3.5 wide:grid-cols-[minmax(250px,272px)_minmax(0,1fr)]">
        <div className="relative z-[2] self-start overflow-hidden rounded-xl border border-overlay bg-[rgba(22,22,25,.92)] backdrop-blur-[10px]">
          <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
            <span className="whitespace-nowrap text-[11px] font-bold tracking-[.1em] text-accent">
              LIVE INTERVAL
            </span>
            <span className="whitespace-nowrap text-[11.5px] text-ink-mute">
              {stripGrandPrix(race.event_name)} {race.year}
            </span>
          </div>
          <div className="px-3.5 pb-3.5 pt-3">
            <div className="text-[12px] text-ink-dim">
              <span className="font-bold" style={{ color: front === a ? colorA : colorB }}>
                {front.run.driver_code}
              </span>{" "}
              ahead by
            </div>
            <div className="mt-1.5 font-cond text-[52px] font-semibold leading-none">
              {lapsApart >= 1 ? lapsApart : interval.toFixed(3)}
              <span className="text-[18px] text-ink-mute">
                {" "}
                {lapsApart >= 1 ? (lapsApart > 1 ? "laps" : "lap") : "s"}
              </span>
            </div>
            <div className="mt-2.5 text-[12.5px] font-semibold" style={{ color: trend.color }}>
              {trend.text}
            </div>
            <div className="mt-[3px] text-[11.5px] text-ink-dim [text-wrap:pretty]">
              {trend.sub}
            </div>
          </div>
          <div className="border-t border-hairline">
            <SideRow x={a} color={colorA} />
            <SideRow x={b} color={colorB} />
            <div className="px-3.5 py-2 text-[11px] text-ink-mute">
              Last completed lap · tyre age
            </div>
          </div>
        </div>

        <TrackPanel
          geometry={geometry}
          sectors={sectors}
          frame={frame}
          totalLaps={timeline.totalLaps}
          highlight={{
            [a.run.driver_code]: { ring: colorA, glow: a.run.color },
            [b.run.driver_code]: { ring: colorB, glow: b.run.color },
          }}
          colors={faster.map((f) => f?.color ?? "#55555c")}
          labels={faster.map((f, k) =>
            f ? `S${k + 1} · ${f.x.run.driver_code} −${f.delta.toFixed(3)}` : `S${k + 1}`,
          )}
          footer={
            <>
              {race.circuit.official_name ?? race.circuit.short_name} ·{" "}
              <span className="text-ink-mute">sector colour = faster on median clean lap</span>
            </>
          }
        />
      </div>
    </section>
  );
}
