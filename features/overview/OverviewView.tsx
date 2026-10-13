"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TeamBar } from "@/components/ui/Swatch";
import { Tile } from "@/components/ui/Tile";
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
  PositionChart,
  toBands,
  WeatherCharts,
} from "./OverviewCharts";
import {
  QualifyingTable,
  RaceControlFeed,
  SectorDominance,
  TeamPaceBars,
  TrafficPanel,
} from "./OverviewPanels";

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
  const retired = rows.filter((r) => r.retired);
  const stops = rows.reduce((sum, r) => sum + r.pits, 0);
  const lengthKm =
    race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null);
  const character = circuitCharacter(race.circuit.short_name);
  const { incidents } = summary;

  return (
    <main className="min-h-0 min-w-0 overflow-auto [grid-area:main]">
      <div className="flex flex-col gap-2">
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
        </div>

        <div className="grid grid-cols-2 gap-2 wide:grid-cols-6">
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
            label="Neutralised"
            value={String(incidents.safety_car + incidents.vsc)}
            valueColor={incidents.safety_car + incidents.vsc ? "var(--color-caution)" : undefined}
            sub={`SC ${incidents.safety_car} · VSC ${incidents.vsc} · ${retired.length} DNF`}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card
            title="Classification"
            sub="Click a column to sort · click a row to compare"
            bodyClassName="p-0"
          >
            <Classification rows={rows} selected={selected} onToggle={toggle} />
          </Card>
          <Card title="Qualifying" sub="Q1 · Q2 · Q3 and grid">
            <QualifyingTable rows={rows} />
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2">
          <span className="mr-1 text-[11.5px] text-ink-dim">Compare in the charts</span>
          {rows.map((row) => {
            const on = selected.includes(row.run.driver_code);
            return (
              <button
                key={row.run.driver_code}
                type="button"
                title={row.run.name}
                onClick={() => toggle(row.run.driver_code)}
                className="flex cursor-pointer items-center gap-[5px] rounded-md border px-2 py-[3px] text-[11.5px] font-bold"
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

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          <Card title="Position by lap" sub="Selected drivers highlighted">
            <PositionChart timeline={timeline} rows={rows} selected={selected} bands={bands} />
          </Card>
          <Card title="Gap to leader" sub="Seconds behind the leader">
            <GapToLeaderChart timeline={timeline} rows={rows} selected={selected} bands={bands} />
          </Card>
          <Card
            title="Race control"
            sub="Flags, DNFs, leaders, stops"
            bodyClassName="relative min-h-[240px]"
          >
            <RaceControlFeed events={events} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-3">
          <Card title="Lap time spread" sub="Box = middle 50% · line = median">
            <LapTimeBoxPlot rows={rows} />
          </Card>
          <Card title="Team race pace" sub="Clean laps · sorted by median">
            <TeamPaceBars teams={teams} />
          </Card>
          <Card title="Sector dominance" sub="Fastest selected driver per sector">
            <SectorDominance
              timeline={timeline}
              circuitName={race.circuit.short_name}
              rows={rows}
              selected={selected}
            />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-2">
          <Card title="Traffic" sub="Pace lost when following closely">
            <TrafficPanel bins={traffic} rows={rows} />
          </Card>
          <Card title="Weather through the race">
            <WeatherCharts timeline={timeline} rows={rows} selected={selected} bands={bands} />
          </Card>
        </div>
      </div>
    </main>
  );
}
