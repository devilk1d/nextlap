"use client";

import { cn } from "@/components/ui/cn";
import { cardinal, fmtDate } from "@/lib/format";
import type { RunLap } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";

function WeatherCell({
  value,
  unit,
  name,
  className,
}: {
  value: string;
  unit: string;
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-r border-divider px-2 py-1.5 min-[1700px]:px-4 min-[1700px]:py-[9px]",
        className,
      )}
    >
      <div className="flex items-baseline gap-[3px] whitespace-nowrap text-accent">
        <span className="font-cond text-[22px] font-semibold leading-none">{value}</span>
        <span className="text-[11px] font-semibold">{unit}</span>
      </div>
      <div className="mt-[3px] truncate whitespace-nowrap text-[11.5px] text-ink-mute">{name}</div>
    </div>
  );
}

/**
 * Weather of the lap in progress along the top of a hero, with the circuit and race length at the
 * right. One row on every width; the extra cells appear only where there is room.
 */
export function WeatherBar({ lap, lapsToGo }: { lap: RunLap; lapsToGo: number }) {
  const { race, timeline } = useRace();
  const lengthKm =
    race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null);
  const weather = [
    {
      value: lap.track_temp?.toFixed(1) ?? "—",
      unit: "°C",
      name: "Track",
    },
    { value: lap.air_temp?.toFixed(1) ?? "—", unit: "°C", name: "Air" },
    {
      value: lap.wind_speed?.toFixed(1) ?? "—",
      unit: `m/s ${lap.wind_direction === null ? "" : cardinal(lap.wind_direction)}`,
      name: "Wind",
    },
    {
      value: lap.humidity === null ? "—" : String(Math.round(lap.humidity)),
      unit: "%",
      name: "Humidity",
    },
    { value: lap.pressure?.toFixed(0) ?? "—", unit: "hPa", name: "Pressure" },
    { value: lap.rainfall ? "Yes" : "No", unit: "", name: "Rainfall" },
    {
      value: String(lapsToGo),
      unit: "laps",
      name: "To go",
      // Left out where the weather would not fit one row; the lap chip says the same.
      className: "max-[1699px]:hidden",
    },
  ];

  return (
    <div className="@container relative grid grid-cols-[repeat(6,minmax(0,1fr))_minmax(0,1.5fr)] border-b border-divider bg-[rgba(23,23,26,.94)] min-[1700px]:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,2fr)]">
      {weather.map((cell) => (
        <WeatherCell key={cell.name} {...cell} />
      ))}
      <div className="min-w-0 px-2 py-1.5 text-right @min-[900px]:px-4 @min-[900px]:py-[9px]">
        <div className="whitespace-nowrap text-[11.5px] text-ink-mute">
          {lengthKm ? `${lengthKm.toFixed(3)} km · ` : ""}
          {timeline.totalLaps} laps
          <span className="hidden @min-[1000px]:inline"> · {fmtDate(race.event_date)}</span>
        </div>
        <div className="mt-[3px] whitespace-nowrap text-[13px] font-semibold">
          <span className="@min-[1100px]:hidden">{race.circuit.short_name}</span>
          <span className="hidden @min-[1100px]:inline">
            {race.circuit.official_name ?? race.circuit.short_name}
          </span>
        </div>
      </div>
    </div>
  );
}
