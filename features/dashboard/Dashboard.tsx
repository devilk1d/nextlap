"use client";

import { useEffect, useMemo } from "react";
import type { RaceInfo } from "@/server/races/types";
import { useRaceDetail } from "@/lib/api";
import { buildTimeline, initialTime } from "@/lib/race/timeline";
import { H2HView } from "@/features/h2h/H2HView";
import { HistoryView } from "@/features/history/HistoryView";
import { OverviewView } from "@/features/overview/OverviewView";
import { ReplayView } from "@/features/replay/ReplayView";
import { StrategyView } from "@/features/strategy/StrategyView";
import { useReplay } from "@/features/replay/store";
import { usePlayback } from "@/features/replay/usePlayback";
import { Header } from "./Header";
import { RaceProvider } from "./race-context";
import { defaultRace, raceForSeason, useSelection, type View } from "./selection";
import { Transport } from "./Transport";
import { Notice } from "./Notice";

const TRANSPORT_VIEWS: View[] = ["replay", "h2h", "strat"];

export function Dashboard({ races }: { races: RaceInfo[] }) {
  const [selection, update] = useSelection();
  const race = races.find((r) => r.race_id === selection.raceId) ?? defaultRace(races);
  const raceId = race?.predictable && selection.view !== "hist" ? race.race_id : null;
  const { data: detail, error, isLoading } = useRaceDetail(raceId);

  const timeline = useMemo(() => (detail ? buildTimeline(detail) : null), [detail]);
  usePlayback();

  useEffect(() => {
    if (timeline) useReplay.getState().load(timeline.end, initialTime(timeline));
  }, [timeline]);

  if (!race) {
    return (
      <div className="shell" data-layout="page">
        <Notice
          title="No races found"
          body="The database returned no races. Load the dataset first."
        />
      </div>
    );
  }

  const { view } = selection;
  const driver = timeline?.byCode.get(selection.driver ?? "") ?? timeline?.runs[0] ?? null;
  const ready = detail && timeline && timeline.runs.length > 0 && driver;
  const codes = timeline?.runs.map((run) => run.driver_code) ?? [];
  const rivalA = codes.includes(selection.a ?? "")
    ? (selection.a as string)
    : (driver?.driver_code ?? "");
  const rivalB =
    codes.includes(selection.b ?? "") && selection.b !== rivalA
      ? (selection.b as string)
      : (codes.find((code) => code !== rivalA) ?? "");
  const layout =
    !ready || view === "ov" || view === "hist"
      ? "page"
      : view === "strat"
        ? "page-transport"
        : undefined;

  const selectRace = (raceId: number) => update({ raceId, driver: null, a: null, b: null });

  return (
    <div className="shell" data-layout={layout}>
      <Header
        races={races}
        race={race}
        view={view}
        onView={(next) => update({ view: next === "replay" ? null : next })}
        onSeason={(year) => {
          const next = raceForSeason(races, year, race.circuit_key);
          if (next) selectRace(next.race_id);
        }}
        onRace={selectRace}
        runs={timeline?.runs ?? []}
        driver={driver}
        onDriver={(code) => update({ driver: code })}
        loading={isLoading}
      />

      {view === "hist" ? (
        <HistoryView
          race={race}
          races={races}
          onOpenRace={(raceId) => update({ raceId, view: "ov", driver: null, a: null, b: null })}
        />
      ) : !race.predictable ? (
        <Notice
          title={`${race.event_name} ${race.year}`}
          eyebrow={
            race.exclusion_reason === "wet"
              ? "WET RACE · NO PREDICTION"
              : "NOT MODELLED · NO PREDICTION"
          }
          body={
            race.exclusion_reason === "wet"
              ? "The model is trained on dry running only. Mixed conditions make lap times unpredictable, so this race is excluded."
              : "This race is outside the model output, so no forecasts are available for it."
          }
          actions={races
            .filter((r) => r.circuit_key === race.circuit_key && r.predictable)
            .map((r) => ({ label: `Try ${r.year}`, onClick: () => selectRace(r.race_id) }))}
        />
      ) : error ? (
        <Notice
          title="Could not load the race"
          body="The race data request failed. Try again in a moment."
        />
      ) : !ready ? (
        <Notice title="Loading race…" body="Fetching laps, telemetry and forecasts." />
      ) : (
        <RaceProvider
          value={{
            race,
            detail,
            timeline,
            driver,
            setDriver: (code) => update({ driver: code }),
            compare: {
              a: rivalA,
              b: rivalB,
              setA: (code) => update({ a: code }),
              setB: (code) => update({ b: code }),
            },
          }}
        >
          {view === "replay" && <ReplayView />}
          {view === "h2h" && <H2HView />}
          {view === "strat" && <StrategyView />}
          {view === "ov" && <OverviewView />}
          {TRANSPORT_VIEWS.includes(view) && <Transport run={driver} />}
        </RaceProvider>
      )}
    </div>
  );
}
