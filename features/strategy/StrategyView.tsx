"use client";

import { Card } from "@/components/ui/Card";
import { Legend } from "@/components/ui/Legend";
import { Swatch, TeamBar } from "@/components/ui/Swatch";
import { cn } from "@/components/ui/cn";
import { EVENT, tyreOf } from "@/lib/race/constants";
import { raceEventsByLap } from "@/lib/race/events";
import { niceTicks, percentOf } from "@/lib/stats";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import {
  compoundFits,
  compoundTable,
  degradationPoints,
  pitStops,
  stintRows,
  teamPitLane,
} from "./analysis";
import { CompoundTable, DegradationChart, PitStopsTable, StintsTable, TeamPitLane } from "./panels";

const ROW = "grid grid-cols-[46px_minmax(0,1fr)_44px] items-stretch gap-2";

/**
 * Strategy of the whole field, one bar per driver. The rows share the height of the card (between
 * 18 and 28 px each), so twenty drivers fit without the page growing.
 */
function Gantt() {
  const { timeline, driver, setDriver } = useRace();
  const frame = useFrame();
  const total = timeline.totalLaps;
  const events = raceEventsByLap(timeline);
  const eventLaps = [...events.entries()].filter(([lap]) => lap <= frame.leaderLap);
  const nowPercent = percentOf(Math.min(total, frame.leader.distance), 0, total);
  const ticks = [1, ...niceTicks(1, total, 6).filter((v) => v > 1 && v < total), total];

  return (
    <Card
      title="Race strategy · full field"
      sub={`Sorted by current position · click a row to select · lap ${frame.leaderLap}/${total}`}
      className="min-h-0"
      bodyClassName="flex min-h-0 flex-col py-2.5"
    >
      <div
        className={cn(ROW, "shrink-0 pb-1 text-[10px] font-bold tracking-[.06em] text-ink-mute")}
      >
        <span>DRIVER</span>
        <span className="relative h-3">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2"
              style={{ left: `${percentOf(tick - 0.5, 0, total)}%` }}
            >
              {tick}
            </span>
          ))}
        </span>
        <span className="text-right">STOPS</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {frame.standings.map((x) => {
          const selected = x.run.driver_code === driver.driver_code;
          return (
            <div
              key={x.run.driver_code}
              onClick={() => setDriver(x.run.driver_code)}
              className={cn(
                ROW,
                "min-h-[18px] max-h-[28px] flex-1 cursor-pointer rounded-md py-px",
                selected && "bg-accent/8",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[12px] font-bold",
                  x.retired ? "text-ink-mute" : "text-ink",
                )}
              >
                <TeamBar color={x.run.color} />
                {x.run.driver_code}
              </span>
              <div className="relative overflow-hidden rounded bg-inset">
                {eventLaps.map(([lap, kind]) => (
                  <div
                    key={lap}
                    className="pointer-events-none absolute inset-y-0"
                    style={{
                      left: `${percentOf(lap - 1, 0, total)}%`,
                      width: `${100 / total}%`,
                      background: `color-mix(in srgb, ${EVENT[kind].color} ${kind === "YEL" ? 8 : 14}%, transparent)`,
                    }}
                  />
                ))}
                {x.run.stints.map((stint) => {
                  const length = stint.end - stint.start + 1;
                  const tyre = tyreOf(stint.compound);
                  return (
                    <div
                      key={stint.index}
                      title={`${x.run.driver_code} · stint ${stint.index + 1} · ${tyre.name} · laps ${stint.start}–${stint.end} (${length} laps)${stint.fresh === false ? " · used set" : " · new set"}`}
                      className="absolute inset-y-0.5 flex items-center overflow-hidden rounded-[3px] pl-1 text-[9.5px] font-extrabold text-[#111]"
                      style={{
                        left: `calc(${percentOf(stint.start - 1, 0, total)}% + 1px)`,
                        width: `calc(${(length / total) * 100}% - 2px)`,
                        background: tyre.color,
                        opacity: stint.start <= x.currentLap ? 0.9 : 0.25,
                      }}
                    >
                      {length >= 4 ? `${tyre.short} ${length}` : ""}
                    </div>
                  );
                })}
                {x.retired && (
                  <div
                    className="absolute inset-y-0 right-0 flex items-center pl-1.5 text-[9.5px] font-bold text-stop"
                    style={{ left: `${percentOf(x.lapCount, 0, total)}%` }}
                  >
                    DNF · {x.run.status}
                  </div>
                )}
                <div
                  className="absolute inset-y-0 border-l-2 border-accent"
                  style={{ left: `${nowPercent}%` }}
                />
              </div>
              <span className="flex items-center justify-end font-mono text-[12px] text-ink-soft">
                {x.pitStops} / {x.run.stints.length - 1}
              </span>
            </div>
          );
        })}
      </div>
      <div className="shrink-0">
        <Legend
          items={[
            [<Swatch key="s" color={tyreOf("SOFT").color} />, "Soft"],
            [<Swatch key="m" color={tyreOf("MEDIUM").color} />, "Medium"],
            [<Swatch key="h" color={tyreOf("HARD").color} />, "Hard"],
            [
              <Swatch key="e" color="color-mix(in srgb, #F5C518 50%, transparent)" />,
              "SC / VSC / yellow",
            ],
            [
              <span key="n" className="h-2.5 w-0.5 bg-accent" />,
              `Now (leader lap ${frame.leaderLap})`,
            ],
            [<Swatch key="f" color="#555" />, "Faded = stint not started yet"],
          ]}
        />
      </div>
    </Card>
  );
}

/**
 * Race strategy page. On wide screens it fills the window without scrolling: the field's Gantt with
 * the pit stops and the selected driver's stints beside it, and tyre degradation, pit-lane times
 * and compounds in a row beneath. Below the minimum heights the page scrolls instead of clipping.
 */
export function StrategyView() {
  const { timeline, driver } = useRace();
  const frame = useFrame();
  const points = degradationPoints(frame);
  const fits = compoundFits(points);
  const stops = pitStops(frame, timeline);
  const focus = frame.byCode.get(driver.driver_code);

  return (
    <main className="grid min-h-0 min-w-0 grid-cols-1 gap-2 overflow-auto pb-2 [grid-area:main] wide:grid-rows-[minmax(430px,1.6fr)_minmax(290px,1fr)]">
      <div className="grid min-h-0 grid-cols-1 gap-2 wide:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Gantt />
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <Card
            title="Pit stops"
            sub="Lane = PitOut − PitIn · loss = in-lap + out-lap vs median"
            className="max-h-[420px] min-h-[180px] flex-[1.6_1_0] wide:max-h-none"
            bodyClassName="flex min-h-0 flex-col py-2"
          >
            <PitStopsTable stops={stops} focusCode={driver.driver_code} fill />
          </Card>
          {focus && (
            <Card
              title={`${driver.driver_code} · stints so far`}
              sub="Trend = s per lap of tyre life"
              className="flex-none"
              bodyClassName="py-2"
            >
              <StintsTable rows={stintRows(focus)} />
            </Card>
          )}
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-2 wide:grid-cols-3">
        <Card
          title="Tyre degradation"
          sub="Lap time vs tyre life · clean laps so far"
          className="min-h-[300px] wide:min-h-0"
          bodyClassName="flex min-h-0 flex-col py-2"
        >
          <DegradationChart points={points} fits={fits} focusCode={driver.driver_code} fill />
        </Card>
        <Card
          title="Pit lane times by team"
          sub="Best and median so far"
          className="min-h-[220px] wide:min-h-0"
          bodyClassName="min-h-0 overflow-auto py-2"
        >
          <TeamPitLane teams={teamPitLane(stops)} />
        </Card>
        <Card
          title="Compounds"
          sub="Field-wide · median clean lap, no fuel correction"
          className="min-h-[160px] wide:min-h-0"
          bodyClassName="min-h-0 overflow-auto py-2"
        >
          <CompoundTable rows={compoundTable(frame, points, fits)} />
        </Card>
      </div>
    </main>
  );
}
