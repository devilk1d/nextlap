"use client";

import { useId, useState } from "react";
import { Card } from "@/components/ui/Card";
import { TyreStrip } from "@/components/ui/TyreStrip";
import { tyreOf } from "@/lib/race/constants";
import {
  compareToReference,
  PROFILE_METRICS,
  referenceLaps,
  type Comparison,
} from "@/lib/race/lap-profile";
import type { RunLap, Standing } from "@/lib/race/timeline";
import { LiveOrder } from "@/features/common/LiveOrder";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { CarData } from "./CarData";
import { focusOf, type Focus } from "./focus";
import { LapStats } from "./LapStats";

const num = (value: number | null | undefined, digits = 0, unit = "") =>
  value == null ? "—" : `${value.toFixed(digits)}${unit}`;

function Tyres({ x, focus }: { x: Standing; focus: Focus }) {
  const { timeline } = useRace();
  const { stint, currentLap } = focus;
  const tyre = tyreOf(currentLap.compound);
  const { run } = x;

  return (
    <Card
      title="Tyres & strategy"
      sub={`Lap ${x.done ? timeline.totalLaps : x.currentLap}`}
      className="flex-none"
      bodyClassName="flex flex-col gap-3 pb-3.5"
    >
      <div className="flex items-center gap-3">
        <div
          className="grid size-12 flex-none place-items-center rounded-full bg-[#0f0f11] font-cond text-[18px] font-bold"
          style={{
            border: `5px solid ${tyre.color}`,
            color: tyre.color,
            boxShadow: `0 0 16px color-mix(in srgb, ${tyre.color} 30%, transparent)`,
          }}
        >
          {tyre.short}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{tyre.name}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-mute">
            {stint.fresh === false ? "Used set" : "New set"} · fitted L{stint.start}
          </div>
        </div>
        <div className="text-right">
          <div className="font-cond text-[26px] font-semibold leading-none">
            {currentLap.tyre_life ?? "–"}
          </div>
          <div className="text-[11px] text-ink-mute">laps old</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[11.5px]">
          <span className="text-ink-mute">Race strategy</span>
          <span>
            {run.stints.length - 1}-stop ·{" "}
            {run.stints.map((s) => tyreOf(s.compound).short).join("–")}
          </span>
        </div>
        <TyreStrip
          stints={run.stints}
          totalLaps={timeline.totalLaps}
          currentLap={x.currentLap}
          distance={x.distance}
        />
      </div>
    </Card>
  );
}

/** On wide screens the car data is a card beside the hero; below that it sits here. */
const BESIDE_HERO = "min-[1450px]:hidden";

const ARROW = { up: "▲", down: "▼", same: "●" } as const;

/** "+6", "−0.4" or "±0": the difference at the precision the value itself is shown in. */
function deltaText(comparison: Comparison, digits: number): string {
  if (comparison.direction === "same") return "±0";
  const sign = comparison.delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(comparison.delta).toFixed(digits)}`;
}

/**
 * The lap aggregates the forecast model reads, folded away until asked for. Each value is set
 * against the average of the driver's own earlier clean laps, so it can be read as "how unusual
 * was this lap for this driver". It says nothing about how the model weighs the numbers.
 */
function ModelInputs({ x, lap }: { x: Standing; lap: RunLap }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const references = referenceLaps(x.run, lap.lap_number);
  const rows = PROFILE_METRICS.map((metric) => ({
    metric,
    value: lap[metric.key] as number | null,
    comparison: compareToReference(lap[metric.key] as number | null, references, metric),
  }));
  const compared = rows.find((row) => row.comparison)?.comparison?.laps ?? 0;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-control px-2.5 py-1.5 text-left text-[12px] text-ink-dim hover:bg-raised"
      >
        <span>
          Model inputs · {rows.length} values
          {open && compared > 0 && (
            <span className="text-ink-mute"> · vs previous {compared} clean laps</span>
          )}
        </span>
        <span aria-hidden className="text-[10px] text-ink-mute">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div id={panel} className="mt-1.5">
          <p className="mb-1 text-[11px] leading-[1.45] text-ink-mute">
            What the forecast model reads from the last lap.{" "}
            {compared > 0
              ? `▲ ▼ show this lap minus this driver's average over the previous ${compared} clean laps. It shows how unusual the lap was, not how the model weighs it.`
              : "Not enough earlier clean laps to compare with yet."}
          </p>
          {rows.map(({ metric, value, comparison }) => (
            <div
              key={metric.key}
              className="flex items-baseline justify-between gap-2 border-b border-rowline py-1 text-[12px]"
              title={
                comparison
                  ? `Average of the previous ${comparison.laps} clean laps: ${comparison.reference.toFixed(metric.digits)}${metric.unit}`
                  : undefined
              }
            >
              <span className="text-ink-dim">{metric.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-mono">{num(value, metric.digits, metric.unit)}</span>
                <span className="w-[58px] text-right font-mono text-[11px] text-ink-mute">
                  {comparison ? (
                    <>
                      <span className="text-[9px]">{ARROW[comparison.direction]}</span>{" "}
                      {deltaText(comparison, metric.digits)}
                    </>
                  ) : (
                    ""
                  )}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Telemetry({ x, focus, time }: { x: Standing; focus: Focus; time: number }) {
  const lap = focus.lastLap ?? focus.currentLap;

  const traps = [
    ["I1", lap.speed_i1],
    ["I2", lap.speed_i2],
    ["FL", lap.speed_fl],
    ["ST", lap.speed_st],
  ] as const;

  return (
    <Card
      title="Telemetry"
      sub={`Last lap · L${lap.lap_number}`}
      className="flex-[1_0_auto]"
      bodyClassName="flex flex-col gap-3 pb-3.5"
    >
      <div className={BESIDE_HERO}>
        <CarData x={x} focus={focus} time={time} />
      </div>
      <LapStats focus={focus} />
      <div>
        <div className="text-[11.5px] text-ink-mute">Speed traps · km/h</div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {traps.map(([name, value]) => (
            <div key={name} className="rounded-md bg-raised px-2 py-1.5">
              <div className="text-[10px] font-bold text-ink-mute">{name}</div>
              <div className="mt-0.5 font-mono text-[12px]">{num(value)}</div>
            </div>
          ))}
        </div>
      </div>
      <ModelInputs x={x} lap={lap} />
    </Card>
  );
}

export function RightPanel() {
  const { driver, setDriver } = useRace();
  const frame = useFrame();
  const x = frame.byCode.get(driver.driver_code);
  if (!x) return null;
  const focus = focusOf(x);

  return (
    <aside className="flex min-h-0 flex-col gap-2 [grid-area:right] wide:overflow-auto">
      <LiveOrder
        standings={frame.standings}
        highlight={new Set([driver.driver_code])}
        onPick={setDriver}
      />
      <Tyres x={x} focus={focus} />
      <Telemetry x={x} focus={focus} time={frame.time} />
    </aside>
  );
}
