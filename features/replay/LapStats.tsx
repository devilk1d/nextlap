"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui/cn";
import { median } from "@/lib/stats";
import type { RunLap, Timeline } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import type { Focus } from "./focus";

const num = (value: number | null | undefined, digits = 0) =>
  value == null ? "—" : value.toFixed(digits);

/** Best top speed and median full-throttle share of the field's clean laps, for comparison. */
function fieldReference(timeline: Timeline) {
  const laps = timeline.runs.flatMap((run) => run.laps.filter((lap) => lap.clean));
  const values = (pick: (lap: RunLap) => number | null | undefined) =>
    laps.map(pick).filter((v): v is number => v != null);
  return {
    topSpeed: Math.max(0, ...values((lap) => lap.tel_speed_max)),
    fullThrottle: median(values((lap) => lap.tel_pct_full_throttle)),
  };
}

type Props = { focus: Focus; className?: string };

/** Four headline numbers of the last completed lap: top speed, full throttle, braking, DRS. */
export function LapStats({ focus, className }: Props) {
  const { timeline } = useRace();
  const reference = useMemo(() => fieldReference(timeline), [timeline]);
  const lap = focus.lastLap ?? focus.currentLap;

  const stats = [
    {
      name: "Top speed",
      value: num(lap.tel_speed_max),
      unit: "km/h",
      sub: `Field best ${num(reference.topSpeed)}`,
    },
    {
      name: "Full throttle",
      value: num(lap.tel_pct_full_throttle),
      unit: "%",
      sub: `Field median ${num(reference.fullThrottle)}%`,
    },
    { name: "Braking", value: num(lap.tel_pct_braking, 1), unit: "%", sub: "Of lap time" },
    {
      name: "DRS open",
      value: num(lap.tel_pct_drs_open),
      unit: "%",
      sub: lap.tel_n_drs_activations
        ? `${lap.tel_n_drs_activations} ${lap.tel_n_drs_activations === 1 ? "activation" : "activations"}`
        : "No activations",
      accent: !!lap.tel_n_drs_activations,
    },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-[10px] border border-hairline",
        className,
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.name}
          className="-mb-px -mr-px min-w-0 border-b border-r border-hairline px-2.5 py-1.5"
        >
          <div className="truncate text-[11.5px] text-ink-mute">{stat.name}</div>
          <div className="mt-0.5 whitespace-nowrap font-cond text-[20px] font-semibold">
            {stat.value}
            <span className="text-[11px] text-ink-mute"> {stat.unit}</span>
          </div>
          <div
            className="mt-px truncate text-[11px]"
            style={{ color: stat.accent ? "var(--color-accent)" : "var(--color-ink-mute)" }}
          >
            {stat.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
