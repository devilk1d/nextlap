"use client";

import { useMemo } from "react";
import { SECTOR_COLORS } from "@/lib/race/constants";
import { sectorShares } from "@/lib/race/laps";
import { cardinal, fmtDate } from "@/lib/format";
import { geometryFor } from "@/lib/race/track";
import { TrackPanel } from "@/features/common/TrackPanel";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { focusOf } from "./focus";
import { ForecastCard } from "./ForecastCard";
import { LapChart } from "./LapChart";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";

function WeatherCell({ value, unit, name }: { value: string; unit: string; name: string }) {
  return (
    <div className="min-w-[92px] border-r border-divider px-4 py-[9px]">
      <div className="flex items-baseline gap-[3px] whitespace-nowrap text-accent">
        <span className="font-cond text-[22px] font-semibold leading-none">{value}</span>
        <span className="text-[11px] font-semibold">{unit}</span>
      </div>
      <div className="mt-[3px] whitespace-nowrap text-[11.5px] text-ink-mute">{name}</div>
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
    { value: String(x.done ? 0 : timeline.totalLaps - x.currentLap), unit: "laps", name: "To go" },
  ];

  return (
    <section className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-stage wide:min-h-0 wide:flex-[1.7_1_0]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--color-accent) 20%, transparent) 1px, transparent 1.3px)",
          backgroundSize: "9px 9px",
        }}
      />
      <div className="relative flex flex-wrap border-b border-divider bg-[rgba(23,23,26,.94)]">
        {weather.map((cell) => (
          <WeatherCell key={cell.name} {...cell} />
        ))}
        <div className="ml-auto px-4 py-[9px] text-right">
          <div className="text-[11.5px] text-ink-mute">Circuit</div>
          <div className="mt-[3px] text-[13px] font-semibold">
            {race.circuit.official_name ?? race.circuit.short_name}
          </div>
        </div>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3.5 wide:grid-cols-[minmax(250px,272px)_minmax(0,1fr)]">
        <ForecastCard
          x={x}
          focus={focus}
          time={frame.time}
          leaderCode={frame.leader.run.driver_code}
        />
        <TrackPanel
          geometry={geometry}
          sectors={sectors}
          frame={frame}
          totalLaps={timeline.totalLaps}
          highlight={{ [driver.driver_code]: { ring: "#ffffff", glow: "var(--color-accent)" } }}
          footer={
            <>
              {lengthKm && (
                <span>
                  <span className="text-ink-mute">Length </span>
                  {lengthKm.toFixed(3)} km
                </span>
              )}
              <span>
                <span className="text-ink-mute">Laps </span>
                {timeline.totalLaps}
              </span>
              <span>
                <span className="text-ink-mute">Race </span>
                {fmtDate(race.event_date)}
              </span>
              <span className="flex items-center gap-2">
                {["S1", "S2", "S3"].map((name, i) => (
                  <span key={name} className="flex items-center gap-1">
                    <span className="h-[3px] w-3" style={{ background: SECTOR_COLORS[i] }} />
                    {name}
                  </span>
                ))}
              </span>
            </>
          }
        />
      </div>
    </section>
  );
}

function CenterColumn() {
  const { driver } = useRace();
  const frame = useFrame();
  const x = frame.byCode.get(driver.driver_code);
  return (
    <main className="flex min-h-0 min-w-0 flex-col gap-2 [grid-area:main]">
      <Hero />
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
