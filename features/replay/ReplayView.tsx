"use client";

import { useMemo } from "react";
import { sectorShares } from "@/lib/race/laps";
import { geometryFor } from "@/lib/race/track";
import { TrackPanel } from "@/features/common/TrackPanel";
import { WeatherBar } from "@/features/common/WeatherBar";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { CarData } from "./CarData";
import { focusOf } from "./focus";
import { ForecastBar, StatusChip } from "./ForecastBar";
import { LapChart } from "./LapChart";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";

function Hero() {
  const { race, timeline, driver } = useRace();
  const frame = useFrame();
  const x = frame.byCode.get(driver.driver_code);
  const geometry = useMemo(() => geometryFor(race.circuit.short_name), [race.circuit.short_name]);
  const sectors = useMemo(() => sectorShares(timeline), [timeline]);
  if (!x) return null;

  const focus = focusOf(x);
  const lap = focus.currentLap;
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
      <WeatherBar lap={lap} lapsToGo={x.done ? 0 : timeline.totalLaps - x.currentLap} />

      <div className="relative flex min-h-0 flex-1 p-2.5">
        <div className="relative min-w-0 flex-1">
          <TrackPanel
            geometry={geometry}
            sectors={sectors}
            frame={frame}
            totalLaps={timeline.totalLaps}
            highlight={{
              [driver.driver_code]: {
                ring: "#ffffff",
                glow: "var(--color-accent)",
              },
            }}
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
    <main className="flex min-h-0 min-w-0 flex-col gap-2 [grid-area:main] wide:overflow-y-auto">
      <div className="flex gap-2 wide:min-h-[330px] wide:flex-[1.7_1_0]">
        <Hero />
        {x && (
          // Wide screens: car data is a card of its own beside the hero, so the map keeps its height.
          <aside className="hidden w-[236px] shrink-0 overflow-y-auto rounded-xl border border-line bg-stage p-3 min-[1450px]:flex min-[1450px]:flex-col">
            <CarData x={x} time={frame.time} />
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
