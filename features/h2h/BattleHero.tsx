"use client";

import { useMemo } from "react";
import { TyreDot } from "@/components/ui/Swatch";
import { DriverFace } from "@/features/common/Brand";
import { fmtLap } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import { sectorShares } from "@/lib/race/laps";
import { geometryFor } from "@/lib/race/track";
import type { Frame, Standing } from "@/lib/race/timeline";
import { TrackPanel } from "@/features/common/TrackPanel";
import { WeatherBar } from "@/features/common/WeatherBar";
import { useRace } from "@/features/dashboard/race-context";
import { Cell, StatusChip } from "@/features/replay/ForecastBar";
import { sectorMedians, type Battle } from "./battle";

type Props = { battle: Battle; frame: Frame };

const LABEL = "whitespace-nowrap text-[11px] leading-none text-ink-mute";

/** One driver's last completed lap and tyre, as a cell of the interval bar. */
function DriverCell({ x, color }: { x: Standing; color: string }) {
  const last = x.completed >= 1 ? x.run.laps[x.completed - 1] : null;
  const tyre = tyreOf(x.lap.compound);
  return (
    <Cell className="min-w-[150px] flex-1">
      <span className={`${LABEL} flex items-center gap-1.5`}>
        <DriverFace code={x.run.driver_code} color={color} size={18} />
        <span className="font-bold text-ink-soft">{x.run.driver_code}</span>
        <span>P{x.position}</span>
        <span>· {last ? `last lap L${last.lap_number}` : "no lap yet"}</span>
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-2 whitespace-nowrap leading-none">
        <span className="font-mono text-[15px] font-semibold">
          {fmtLap(last?.lap_time_sec)}
          {last?.flag ? " *" : ""}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-dim">
          <TyreDot color={tyre.color} />
          {x.inPit ? "PIT" : `${tyre.name} · ${x.lap.tyre_life ?? "–"} laps`}
        </span>
      </span>
    </Cell>
  );
}

/** The gap between the two cars and how it is moving, then each driver's last lap. */
function IntervalBar({ battle }: { battle: Battle }) {
  const { a, b, colorA, colorB, front, lapsApart, interval, trend } = battle;
  const frontColor = front === a ? colorA : colorB;
  return (
    <div className="relative z-[2] flex items-stretch border-t border-divider bg-[rgba(22,22,25,.96)]">
      <Cell className="w-[270px] shrink-0">
        <span className={LABEL}>
          <span className="font-bold" style={{ color: frontColor }}>
            {front.run.driver_code}
          </span>{" "}
          ahead by
        </span>
        <span className="mt-1 flex items-baseline gap-2 leading-none">
          <span className="font-cond text-[26px] font-semibold">
            {lapsApart >= 1 ? lapsApart : interval.toFixed(3)}
            <span className="text-[12px] text-ink-mute">
              {" "}
              {lapsApart >= 1 ? (lapsApart > 1 ? "laps" : "lap") : "s"}
            </span>
          </span>
          <span
            data-tip={trend.sub}
            className="min-w-0 truncate text-[11px] font-semibold"
            style={{ color: trend.color }}
          >
            {trend.text}
          </span>
        </span>
      </Cell>
      <DriverCell x={a} color={colorA} />
      <DriverCell x={b} color={colorB} />
    </div>
  );
}

/**
 * The head-to-head hero, built like the replay's: weather along the top, the circuit with both
 * cars highlighted and sector dominance, and the interval bar underneath.
 */
export function BattleHero({ battle, frame }: Props) {
  const { race, timeline } = useRace();
  const { a, b, colorA, colorB, front } = battle;
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
    <section
      data-tour="h2h-battle"
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-stage"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--color-accent) 18%, transparent) 1px, transparent 1.3px)",
          backgroundSize: "9px 9px",
        }}
      />
      <WeatherBar
        lap={front.lap}
        lapsToGo={front.done ? 0 : timeline.totalLaps - front.currentLap}
      />

      <div className="relative flex min-h-0 flex-1 p-2.5">
        <div
          className="relative min-w-0 flex-1"
          data-tip="Labels on the circuit: the faster driver in each sector on the median clean lap, and by how much"
        >
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
            topLeft={<StatusChip x={front} totalLaps={timeline.totalLaps} />}
          />
        </div>
      </div>

      <IntervalBar battle={battle} />
    </section>
  );
}
