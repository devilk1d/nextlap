"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { TyreStrip } from "@/components/ui/TyreStrip";
import { median } from "@/lib/stats";
import { tyreOf } from "@/lib/race/constants";
import type { RunLap, Standing, Timeline } from "@/lib/race/timeline";
import { LiveOrder } from "@/features/common/LiveOrder";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { focusOf, type Focus } from "./focus";

const num = (value: number | null | undefined, digits = 0, unit = "") =>
  value == null ? "—" : `${value.toFixed(digits)}${unit}`;

function fieldReference(timeline: Timeline) {
  const laps = timeline.runs.flatMap((run) => run.laps.filter((lap) => lap.clean));
  const values = (pick: (lap: RunLap) => number | null | undefined) =>
    laps.map(pick).filter((v): v is number => v != null);
  return {
    topSpeed: Math.max(0, ...values((lap) => lap.tel_speed_max)),
    fullThrottle: median(values((lap) => lap.tel_pct_full_throttle)),
  };
}

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

function Telemetry({ focus }: { focus: Focus }) {
  const { race, timeline } = useRace();
  const reference = useMemo(() => fieldReference(timeline), [timeline]);
  const lap = focus.lastLap ?? focus.currentLap;
  const lengthKm =
    race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null);

  const stats = [
    {
      name: "Top speed",
      value: num(lap.tel_speed_max),
      unit: "km/h",
      sub: `Field best ${num(reference.topSpeed)}`,
    },
    {
      name: "Avg speed",
      value: num(lap.tel_speed_mean),
      unit: "km/h",
      sub: lengthKm ? `${lengthKm.toFixed(3)} km lap` : "",
    },
    {
      name: "Full throttle",
      value: num(lap.tel_pct_full_throttle),
      unit: "%",
      sub: `Field median ${num(reference.fullThrottle)}%`,
    },
    { name: "Braking", value: num(lap.tel_pct_braking, 1), unit: "%", sub: "Of lap time" },
    { name: "Gear shifts", value: num(lap.tel_n_gear_shifts), unit: "", sub: "Per lap" },
    {
      name: "DRS open",
      value: num(lap.tel_pct_drs_open),
      unit: "%",
      sub: lap.tel_n_drs_activations
        ? `${lap.tel_n_drs_activations} activations`
        : "No activations",
      accent: !!lap.tel_n_drs_activations,
    },
  ];
  const traps = [
    ["I1", lap.speed_i1],
    ["I2", lap.speed_i2],
    ["FL", lap.speed_fl],
    ["ST", lap.speed_st],
  ] as const;
  const profile = [
    ["Min speed", num(lap.tel_speed_min, 0, " km/h")],
    ["Speed std", num(lap.tel_speed_std, 1, " km/h")],
    ["Throttle mean", num(lap.tel_throttle_mean, 1, " %")],
    ["Throttle std", num(lap.tel_throttle_std, 1, " %")],
    ["Coasting", num(lap.tel_pct_coast, 1, " %")],
    ["Brake zones", num(lap.tel_n_brake_zones)],
    ["Gear mode", num(lap.tel_n_gear_mode)],
    ["Gear mean", num(lap.tel_gear_mean, 2)],
    ["RPM max", num(lap.tel_rpm_max)],
    ["RPM mean", num(lap.tel_rpm_mean)],
    ["RPM std", num(lap.tel_rpm_std)],
    ["Time < 150 km/h", num(lap.tel_pct_slow, 1, " %")],
    ["Time > 250 km/h", num(lap.tel_pct_fast, 1, " %")],
    ["Accel p99", num(lap.tel_accel_p99, 1, " m/s²")],
    ["Decel p1", num(lap.tel_decel_p01, 1, " m/s²")],
  ];

  return (
    <Card
      title="Telemetry"
      sub={`Last lap · L${lap.lap_number}`}
      className="flex-[1_0_auto]"
      bodyClassName="flex flex-col gap-3 pb-3.5"
    >
      <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-hairline">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="-mb-px -mr-px border-b border-r border-hairline px-2.5 py-2"
          >
            <div className="text-[11.5px] text-ink-mute">{stat.name}</div>
            <div className="mt-0.5 whitespace-nowrap font-cond text-[20px] font-semibold">
              {stat.value}
              <span className="text-[11px] text-ink-mute"> {stat.unit}</span>
            </div>
            <div
              className="mt-px whitespace-nowrap text-[11px]"
              style={{ color: stat.accent ? "var(--color-accent)" : "var(--color-ink-mute)" }}
            >
              {stat.sub}
            </div>
          </div>
        ))}
      </div>
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
      <div>
        <div className="mb-1 text-[11.5px] text-ink-mute">Lap profile</div>
        {profile.map(([name, value]) => (
          <div
            key={name}
            className="flex justify-between gap-2 border-b border-rowline py-1 text-[12px]"
          >
            <span className="text-ink-dim">{name}</span>
            <span className="font-mono">{value}</span>
          </div>
        ))}
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
      <Telemetry focus={focus} />
    </aside>
  );
}
