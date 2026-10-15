"use client";

import { Card } from "@/components/ui/Card";
import { TyreStrip } from "@/components/ui/TyreStrip";
import { tyreOf } from "@/lib/race/constants";
import type { Standing } from "@/lib/race/timeline";
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
      tour="tyres"
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
      tour="telemetry"
      sub={`Last lap · L${lap.lap_number}`}
      className="flex-[1_0_auto]"
      bodyClassName="flex flex-col gap-3 pb-3.5"
    >
      <div className={BESIDE_HERO}>
        <CarData x={x} time={time} />
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
