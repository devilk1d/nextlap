"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui/cn";
import { sectorShares } from "@/lib/race/laps";
import { cardinal, fmtDate } from "@/lib/format";
import { geometryFor } from "@/lib/race/track";
import { TrackPanel } from "@/features/common/TrackPanel";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { CarData } from "./CarData";
import { focusOf } from "./focus";
import { ForecastBar, StatusChip } from "./ForecastBar";
import { LapChart } from "./LapChart";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";

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

function Hero() {
  const { race, timeline, driver } = useRace();
  const frame = useFrame();
  const x = frame.byCode.get(driver.driver_code);
  const geometry = useMemo(() => geometryFor(race.circuit.short_name), [race.circuit.short_name]);
  const sectors = useMemo(() => sectorShares(timeline), [timeline]);
  if (!x) return null;

  const focus = focusOf(x);
  const lap = focus.currentLap;
  const lengthKm =
    race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null);
  const weather = [
    { value: lap.track_temp?.toFixed(1) ?? "—", unit: "°C", name: "Track temp" },
    { value: lap.air_temp?.toFixed(1) ?? "—", unit: "°C", name: "Air temp" },
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
      value: String(x.done ? 0 : timeline.totalLaps - x.currentLap),
      unit: "laps",
      name: "To go",
      // Left out where the weather would not fit one row; the lap chip says the same.
      className: "max-[1699px]:hidden",
    },
  ];

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-stage">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--color-accent) 20%, transparent) 1px, transparent 1.3px)",
          backgroundSize: "9px 9px",
        }}
      />
      <div className="relative grid grid-cols-[repeat(6,minmax(0,1fr))_minmax(0,1.5fr)] border-b border-divider bg-[rgba(23,23,26,.94)] min-[1700px]:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,2fr)]">
        {weather.map((cell) => (
          <WeatherCell key={cell.name} {...cell} />
        ))}
        <div className="min-w-0 px-2 py-1.5 text-right min-[1700px]:px-4 min-[1700px]:py-[9px]">
          <div className="truncate text-[11.5px] text-ink-mute">
            {lengthKm ? `${lengthKm.toFixed(3)} km · ` : ""}
            {timeline.totalLaps} laps
            <span className="hidden min-[1700px]:inline"> · {fmtDate(race.event_date)}</span>
          </div>
          <div className="mt-[3px] truncate text-[13px] font-semibold">
            <span className="min-[1700px]:hidden">{race.circuit.short_name}</span>
            <span className="hidden min-[1700px]:inline">
              {race.circuit.official_name ?? race.circuit.short_name}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 p-2.5">
        <div className="relative min-w-0 flex-1">
          <TrackPanel
            geometry={geometry}
            sectors={sectors}
            frame={frame}
            totalLaps={timeline.totalLaps}
            highlight={{ [driver.driver_code]: { ring: "#ffffff", glow: "var(--color-accent)" } }}
            topLeft={<StatusChip x={x} totalLaps={timeline.totalLaps} />}
          />
        </div>
      </div>

      <ForecastBar
        x={x}
        focus={focus}
        time={frame.time}
        leaderCode={frame.leader.run.driver_code}
      />
    </section>
  );
}

function CenterColumn() {
  const { driver } = useRace();
  const frame = useFrame();
  const x = frame.byCode.get(driver.driver_code);
  return (
    <main className="flex min-h-0 min-w-0 flex-col gap-2 [grid-area:main]">
      <div className="flex gap-2 wide:min-h-0 wide:flex-[1.7_1_0]">
        <Hero />
        {x && (
          // Wide screens: car data is a card of its own beside the hero, so the map keeps its height.
          <aside className="hidden w-[236px] shrink-0 overflow-y-auto rounded-xl border border-line bg-stage p-3 min-[1450px]:flex min-[1450px]:flex-col">
            <CarData x={x} focus={focusOf(x)} time={frame.time} />
          </aside>
        )}
      </div>
      {x && <LapChart x={x} focus={focusOf(x)} />}
    </main>
  );
}

export function ReplayView() {
  return (
    <>
      <LeftPanel />
      <CenterColumn />
      <RightPanel />
    </>
  );
}
