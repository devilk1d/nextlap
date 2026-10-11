"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TeamBar } from "@/components/ui/Swatch";
import { Tile } from "@/components/ui/Tile";
import { downloadCsv } from "@/lib/download";
import { fmtClock, fmtDate, fmtLap } from "@/lib/format";
import { circuitCharacter } from "@/lib/circuits";
import { eventBands, raceEventsByLap } from "@/lib/race/events";
import { useRace } from "@/features/dashboard/race-context";
import { summarizeRace } from "@/server/races/summary";
import { driverRows, raceControl, teamPace, trafficBins, type DriverRow } from "./analysis";
import { Classification } from "./Classification";
import {
  GapToLeaderChart,
  LapTimeBoxPlot,
  MetricExplorer,
  PositionChart,
  toBands,
  WeatherCharts,
} from "./OverviewCharts";
import {
  LapComparison,
  QualifyingTable,
  RaceControlFeed,
  SectorDominance,
  TeamPaceBars,
  TrafficPanel,
} from "./OverviewPanels";

function classificationCsv(rows: DriverRow[]) {
  const header = [
    "FinishPosition",
    "ClassifiedPosition",
    "Driver",
    "Team",
    "GridPosition",
    "QPos",
    "Status",
    "LapsCompleted",
    "Points",
    "RaceTime_or_Gap",
    "BestLap_sec",
    "BestLapNumber",
    "TheoreticalBest_sec",
    "MedianLap_sec",
    "LapTimeStd_sec",
    "PitStops",
    "Compounds",
    "LapsLed",
    "PctLapsInTraffic",
    "DRSLaps",
    "SpeedMax",
    "SpeedI1",
    "SpeedI2",
    "SpeedFL",
    "SpeedST",
    "PctFullThrottle",
    "PctBraking",
    "GearShiftsPerLap",
    "Q1",
    "Q2",
    "Q3",
    "QGapToPole_pct",
  ];
  const fixed = (v: number | null, digits: number) => (v === null ? "" : v.toFixed(digits));
  return [
    header,
    ...rows.map((r) => [
      r.position,
      r.run.classified_position,
      r.run.driver_code,
      r.run.team,
      r.run.grid_position,
      r.run.q_pos,
      r.run.status,
      r.run.laps.length,
      r.run.points,
      r.position === 1
        ? r.finishSeconds.toFixed(3)
        : r.retired
          ? "DNF"
          : r.lapsDown
            ? `+${r.lapsDown}L`
            : fixed(r.gapSeconds, 3),
      fixed(r.best, 3),
      r.bestLap,
      fixed(r.theoretical, 3),
      fixed(r.median, 3),
      fixed(r.stdDev, 3),
      r.pits,
      r.strategy.join("-"),
      r.led,
      r.traffic.toFixed(1),
      r.drsLaps,
      fixed(r.top, 1),
      fixed(r.i1, 1),
      fixed(r.i2, 1),
      fixed(r.fl, 1),
      fixed(r.st, 1),
      fixed(r.throttle, 2),
      fixed(r.braking, 2),
      fixed(r.shifts, 2),
      fixed(r.run.q1_sec, 3),
      fixed(r.run.q2_sec, 3),
      fixed(r.run.q3_sec, 3),
      fixed(r.run.q_gap_to_pole_pct, 3),
    ]),
  ];
}

export function OverviewView() {
  const { race, detail, timeline, driver } = useRace();
  const rows = useMemo(() => driverRows(timeline), [timeline]);
  const summary = useMemo(() => summarizeRace(detail), [detail]);
  const bands = useMemo(
    () => toBands(eventBands(raceEventsByLap(timeline), timeline.totalLaps)),
    [timeline],
  );
  const traffic = useMemo(() => trafficBins(timeline), [timeline]);
  const events = useMemo(() => raceControl(timeline, rows), [timeline, rows]);
  const teams = useMemo(() => teamPace(rows), [rows]);
  const [selection, setSelection] = useState<string[] | null>(null);

  const top3 = rows.slice(0, 3).map((r) => r.run.driver_code);
  const selected = (
    selection ?? [...top3, ...(top3.includes(driver.driver_code) ? [] : [driver.driver_code])]
  ).filter((code) => rows.some((r) => r.run.driver_code === code));
  const toggle = (code: string) =>
    setSelection(
      selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code],
    );

  const winner = rows[0];
  const pole = rows.find((r) => r.run.q_pos === 1);
  const fastest = rows.reduce<DriverRow | null>(
    (best, r) => (r.best !== null && (!best || r.best < (best.best as number)) ? r : best),
    null,
  );
  const topSpeed = rows.reduce<DriverRow | null>(
    (best, r) => (r.top !== null && (!best || r.top > (best.top as number)) ? r : best),
    null,
  );
  const gainer = rows.reduce<DriverRow | null>(
    (best, r) => (r.gained !== null && (!best || r.gained > (best.gained as number)) ? r : best),
    null,
  );
  const retired = rows.filter((r) => r.retired);
  const stops = rows.reduce((sum, r) => sum + r.pits, 0);
  const laps = timeline.runs.flatMap((run) => run.laps);
  const range = (values: (number | null)[]) => {
    const present = values.filter((v): v is number => v !== null);
    return present.length ? [Math.min(...present), Math.max(...present)] : null;
  };
  const trackRange = range(laps.map((l) => l.track_temp));
  const airRange = range(laps.map((l) => l.air_temp));
  const lengthKm =
    race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null);
  const character = circuitCharacter(race.circuit.short_name);
  const { incidents } = summary;

  return (
    <main className="min-h-0 min-w-0 overflow-auto [grid-area:main]">
      <div className="flex flex-col gap-2 pb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-panel px-4 py-3">
          <div>
            <div className="text-[11px] font-bold tracking-[.1em] text-accent">RACE OVERVIEW</div>
            <div className="mt-1 font-display text-[18px]">
              {race.event_name} {race.year}
            </div>
          </div>
          <div className="text-[12px] leading-relaxed text-ink-dim">
            {race.circuit.official_name ?? race.circuit.short_name} · {race.country}
            <br />
            {fmtDate(race.event_date)} · {timeline.totalLaps} laps
            {lengthKm ? ` · ${(lengthKm * timeline.totalLaps).toFixed(1)} km` : ""}
            {character ? ` · ${character}` : ""}
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button
              title="Final classification with summary columns"
              onClick={() =>
                downloadCsv(
                  `classification_${race.year}_${race.circuit.short_name}.csv`,
                  classificationCsv(rows),
                )
              }
            >
              ↓ Classification CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 wide:grid-cols-5">
          <Tile
            label="Winner"
            value={winner?.run.name ?? "—"}
            valueColor="var(--color-accent)"
            sub={
              winner
                ? `${fmtClock(winner.finishSeconds)} · from P${winner.run.grid_position ?? "–"}`
                : ""
            }
          />
          <Tile
            label="Pole position"
            value={pole ? `${pole.run.driver_code} · ${fmtLap(pole.run.q_best_sec)}` : "—"}
            sub={
              pole
                ? `${pole.run.name} · finished ${pole.retired ? "DNF" : `P${pole.position}`}`
                : ""
            }
          />
          <Tile
            label="Fastest lap"
            value={fmtLap(fastest?.best)}
            valueColor="var(--color-best)"
            sub={fastest ? `${fastest.run.driver_code} · lap ${fastest.bestLap}` : ""}
          />
          <Tile
            label="Top speed"
            value={topSpeed ? `${topSpeed.top?.toFixed(0)} km/h` : "—"}
            sub={topSpeed ? `${topSpeed.run.driver_code} · speed max` : ""}
          />
          <Tile
            label="Biggest gainer"
            value={
              gainer ? `${(gainer.gained as number) > 0 ? "+" : ""}${gainer.gained} places` : "—"
            }
            valueColor="var(--color-go)"
            sub={
              gainer
                ? `${gainer.run.driver_code} · P${gainer.run.grid_position} → P${gainer.position}`
                : ""
            }
          />
          <Tile
            label="Lead changes"
            value={String(summary.lead_changes)}
            sub={`${rows.filter((r) => r.led > 0).length} drivers led a lap`}
          />
          <Tile
            label="Pit stops"
            value={String(stops)}
            sub={`${(stops / rows.length).toFixed(1)} per driver`}
          />
          <Tile
            label="Neutralised periods"
            value={String(incidents.safety_car + incidents.vsc)}
            valueColor={incidents.safety_car + incidents.vsc ? "var(--color-caution)" : undefined}
            sub={`SC ${incidents.safety_car} · VSC ${incidents.vsc} · yellow ${incidents.yellow}`}
          />
          <Tile
            label="Retirements"
            value={String(retired.length)}
            valueColor={retired.length ? "var(--color-stop)" : undefined}
            sub={
              retired.length
                ? retired.map((r) => r.run.driver_code).join(", ")
                : "All cars classified"
            }
          />
          <Tile
            label="Track temp"
            value={trackRange ? `${trackRange[0].toFixed(1)}–${trackRange[1].toFixed(1)}°` : "—"}
            sub={airRange ? `Air ${airRange[0].toFixed(1)}–${airRange[1].toFixed(1)} °C` : ""}
          />
        </div>

        <Card
          title="Classification & race summary"
          sub="Click a column to sort · click a row to compare the driver below"
          bodyClassName="p-0"
        >
          <Classification rows={rows} selected={selected} onToggle={toggle} />
        </Card>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card title="Qualifying" sub="Q1 · Q2 · Q3 and the starting grid">
            <QualifyingTable rows={rows} />
          </Card>
          <Card title="Team race pace" sub="Clean laps · sorted by median">
            <TeamPaceBars teams={teams} />
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2.5">
          <div className="mb-1 w-full text-[11.5px] text-ink-dim">
            Drivers compared in the charts below (teammates drawn dashed)
          </div>
          {rows.map((row) => {
            const on = selected.includes(row.run.driver_code);
            return (
              <button
                key={row.run.driver_code}
                type="button"
                title={row.run.name}
                onClick={() => toggle(row.run.driver_code)}
                className="flex cursor-pointer items-center gap-[5px] rounded-md border px-2 py-1 text-[11.5px] font-bold"
                style={{
                  borderColor: on ? row.run.color : "var(--color-control)",
                  background: on
                    ? `color-mix(in srgb, ${row.run.color} 14%, transparent)`
                    : "var(--color-inset)",
                  color: on ? "#fff" : "var(--color-ink-dim)",
                }}
              >
                <TeamBar color={row.run.color} height={12} />
                {row.run.driver_code}
              </button>
            );
          })}
          <Button onClick={() => setSelection(rows.slice(0, 3).map((r) => r.run.driver_code))}>
            Top 3
          </Button>
          <Button onClick={() => setSelection(rows.slice(0, 10).map((r) => r.run.driver_code))}>
            Top 10
          </Button>
          <Button onClick={() => setSelection([])}>Clear</Button>
        </div>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-2">
          <Card title="Position by lap" sub="All drivers · selected highlighted">
            <PositionChart timeline={timeline} rows={rows} selected={selected} bands={bands} />
          </Card>
          <Card title="Gap to leader" sub="Seconds behind the race leader at each lap">
            <GapToLeaderChart timeline={timeline} rows={rows} selected={selected} bands={bands} />
          </Card>
        </div>

        <Card title="Lap metric explorer" sub="Every lap column of the dataset">
          <MetricExplorer timeline={timeline} rows={rows} selected={selected} bands={bands} />
        </Card>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-2">
          <Card
            title="Lap time distribution"
            sub="Clean laps · box = middle 50% · line = median · sorted by median"
          >
            <LapTimeBoxPlot rows={rows} />
          </Card>
          <Card title="Sector dominance" sub="Each sector coloured by the fastest selected driver">
            <SectorDominance
              timeline={timeline}
              circuitName={race.circuit.short_name}
              rows={rows}
              selected={selected}
            />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-2">
          <Card title="Lap comparison" sub="Every lap metric side by side">
            <LapComparison key={race.race_id} rows={rows} />
          </Card>
          <Card title="Traffic" sub="Effect of running close to the car ahead">
            <TrafficPanel bins={traffic} rows={rows} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card title="Weather through the race">
            <WeatherCharts timeline={timeline} rows={rows} selected={selected} bands={bands} />
          </Card>
          <Card
            title="Race control"
            sub="Grid, flags, retirements, leaders, fastest laps, pit stops"
          >
            <RaceControlFeed events={events} />
          </Card>
        </div>
      </div>
    </main>
  );
}
