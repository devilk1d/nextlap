"use client";

import { useMemo } from "react";
import { TrackMap } from "@/components/charts/TrackMap";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/features/dashboard/Notice";
import { useCircuitHistory } from "@/lib/api";
import { circuitCharacter } from "@/lib/circuits";
import { fmtDate } from "@/lib/format";
import { geometryFor } from "@/lib/race/track";
import type { RaceInfo } from "@/server/races/types";
import { DriverRecord, PaceChart, RaceTable, TrendChart, UsageChart } from "./panels";

type Props = {
  race: RaceInfo;
  races: RaceInfo[];
  onOpenRace: (raceId: number) => void;
};

function Fact({ name, value, wide }: { name: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-[11.5px] text-ink-mute">{name}</div>
      <div className="mt-[3px] text-[13px] font-semibold">{value}</div>
    </div>
  );
}

export function HistoryView({ race, races, onOpenRace }: Props) {
  const { data, error, isLoading } = useCircuitHistory(race.circuit_key);
  const geometry = useMemo(() => geometryFor(race.circuit.short_name), [race.circuit.short_name]);
  const seasonsAtCircuit = races.filter((r) => r.circuit_key === race.circuit_key);

  if (error)
    return <Notice title="Could not load the history" body="The circuit history request failed." />;
  if (!data || isLoading)
    return <Notice title="Loading history…" body="Summarising every season at this circuit." />;

  const { seasons } = data;
  const dry = seasons.filter((s) => s.predictable);
  const lengthKm =
    race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null);
  const character = circuitCharacter(race.circuit.short_name);
  const years = seasons.map((s) => s.year);

  return (
    <main className="min-h-0 min-w-0 overflow-auto [grid-area:main]">
      <div className="flex flex-col gap-2 pb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line bg-panel px-4 py-3">
          <div>
            <div className="text-[11px] font-bold tracking-[.1em] text-accent">CIRCUIT HISTORY</div>
            <div className="mt-1 font-display text-[18px]">
              {race.event_name} · {years[0]}–{years[years.length - 1]}
            </div>
          </div>
          <div className="text-[12px] text-ink-dim">
            {dry.length} dry races · {seasons.length - dry.length} wet or not modelled
          </div>
        </div>

        <Card title="Circuit profile">
          <div className="grid grid-cols-1 items-center gap-3.5 wide:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="relative h-[240px] wide:h-[300px]">
              {geometry ? (
                <TrackMap
                  geometry={geometry}
                  sectors={[1 / 3, 1 / 3, 1 / 3]}
                  colors={["#55555c", "#55555c", "#55555c"]}
                  labels={["", "", ""]}
                />
              ) : (
                <div className="grid h-full place-items-center text-[12px] text-ink-mute">
                  Track outline is available for the ten study circuits.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact name="Circuit" value={race.circuit.official_name ?? race.circuit.short_name} />
              <Fact name="Country" value={race.country} />
              <Fact name="Lap length" value={lengthKm ? `${lengthKm.toFixed(3)} km` : "—"} />
              <Fact name="Race laps" value={String(race.total_laps)} />
              <Fact
                name="Race distance"
                value={lengthKm ? `${(lengthKm * race.total_laps).toFixed(1)} km` : "—"}
              />
              <Fact
                name="Corners"
                value={race.circ_num_corners === null ? "—" : String(race.circ_num_corners)}
              />
              <Fact
                name="Tight corners"
                value={
                  race.circ_pct_tight === null ? "—" : `${race.circ_pct_tight.toFixed(0)} % of lap`
                }
              />
              <Fact
                name="Medium corners"
                value={
                  race.circ_pct_medium === null
                    ? "—"
                    : `${race.circ_pct_medium.toFixed(0)} % of lap`
                }
              />
              <Fact
                name="Turn intensity"
                value={
                  race.circ_turn_deg_per_km === null
                    ? "—"
                    : `${race.circ_turn_deg_per_km.toFixed(0)} °/km`
                }
              />
              <Fact
                name="Elevation range"
                value={
                  race.circ_alt_range_m === null ? "—" : `${race.circ_alt_range_m.toFixed(0)} m`
                }
              />
              {character && <Fact name="Type" value={character} wide />}
            </div>
          </div>
        </Card>

        <Card title="Race by race" bodyClassName="p-0">
          <RaceTable
            seasons={seasons}
            currentYear={race.year}
            dates={Object.fromEntries(seasonsAtCircuit.map((r) => [r.year, fmtDate(r.event_date)]))}
            raceIds={Object.fromEntries(seasonsAtCircuit.map((r) => [r.year, r.race_id]))}
            onOpen={onOpenRace}
          />
        </Card>

        <div className="grid grid-cols-1 gap-2 wide:grid-cols-3">
          <Card title="Race pace by season">
            <PaceChart seasons={dry} />
          </Card>
          <Card
            title="Tyre lap-time trend by season"
            sub="s per lap of tyre life · fuel burn-off included"
          >
            <TrendChart seasons={dry} />
          </Card>
          <Card title="Tyre usage and stops">
            <UsageChart seasons={dry} />
          </Card>
        </div>

        <Card title={`Drivers' record here · ${race.year} grid`} sub="Sorted by average finish">
          <DriverRecord seasons={seasons} currentYear={race.year} />
        </Card>
      </div>
    </main>
  );
}
