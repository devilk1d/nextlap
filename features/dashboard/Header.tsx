"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/components/ui/cn";
import { fmtDate, stripGrandPrix } from "@/lib/format";
import { NEUTRAL_COLOR } from "@/lib/race/constants";
import type { Run } from "@/lib/race/timeline";
import { useReplay } from "@/features/replay/store";
import type { RaceInfo } from "@/server/races/types";
import { DriverFace, TeamLogo } from "@/features/common/Brand";
import { DRIVER_MENU_SIZE, DriverMenu } from "@/features/common/DriverMenu";
import { VIEWS, type View } from "./selection";

const VIEW_LABELS: Record<View, string> = {
  replay: "Lap replay",
  h2h: "Head to head",
  strat: "Strategy",
  ov: "Race overview",
};

type Props = {
  races: RaceInfo[];
  race: RaceInfo;
  view: View;
  onView: (view: View) => void;
  onSeason: (year: number) => void;
  onRace: (raceId: number) => void;
  runs: Run[];
  driver: Run | null;
  onDriver: (code: string) => void;
  loading: boolean;
};

function ReplayStatus() {
  const playing = useReplay((s) => s.playing);
  const speed = useReplay((s) => s.speed);
  const loaded = useReplay((s) => s.end > 0);
  const finished = useReplay((s) => s.end > 0 && s.time >= s.end - 0.01);
  if (!loaded) return <Status color="var(--color-caution)" text="No data" />;
  if (playing) {
    return (
      <Status
        color="var(--color-go)"
        text={`Live replay · ${speed === 1 ? "real time" : `${speed}×`}`}
      />
    );
  }
  return finished ? (
    <Status color="var(--color-accent)" text="Chequered flag" />
  ) : (
    <Status color="#9a9aa3" text="Paused" />
  );
}

function Status({ color, text }: { color: string; text: string }) {
  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold"
      style={{ color }}
    >
      <span className="size-[7px] rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}

export function Header({
  races,
  race,
  view,
  onView,
  onSeason,
  onRace,
  runs,
  driver,
  onDriver,
  loading,
}: Props) {
  const years = [...new Set(races.map((r) => r.year))].sort();
  const seasonRaces = races.filter((r) => r.year === race.year);
  const teamColor = driver?.color ?? NEUTRAL_COLOR;
  const showDriver = (view === "replay" || view === "strat") && driver && race.predictable;

  return (
    <header className="relative z-50 flex min-h-[52px] flex-wrap items-center gap-x-[18px] gap-y-2.5 rounded-xl border border-line bg-panel px-3.5 py-2 [grid-area:head]">
      <div className="flex items-center gap-2.5">
        <div className="flex -skew-x-20 gap-[3px]">
          <span className="h-[18px] w-1 bg-accent" />
          <span className="h-[18px] w-1 bg-accent opacity-70" />
          <span className="h-[18px] w-1 bg-accent opacity-40" />
        </div>
        <span className="font-display text-[14px] tracking-[.04em]">NEXT LAP</span>
        <span className="rounded border border-popover px-1.5 py-0.5 text-[10px] font-semibold tracking-[.08em] text-ink-mute">
          PREDICTOR
        </span>
      </div>

      <Segmented
        value={view}
        onChange={onView}
        options={VIEWS.map((value) => ({ value, label: VIEW_LABELS[value] }))}
        className="rounded-lg"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          variant="season"
          value={race.year}
          onChange={onSeason}
          options={years.map((year) => ({ value: year, label: year }))}
        />

        <Dropdown
          width={320}
          trigger={
            <>
              <span className="text-[10px] font-bold tracking-[.06em] text-accent">
                {race.circuit.country_code ?? `R${race.round_number}`}
              </span>
              {stripGrandPrix(race.event_name)}
            </>
          }
        >
          {(close) =>
            seasonRaces.map((item) => {
              const active = item.race_id === race.race_id;
              return (
                <button
                  key={item.race_id}
                  type="button"
                  onClick={() => {
                    onRace(item.race_id);
                    close();
                  }}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border-0 px-2.5 py-[9px] text-left text-[12.5px]",
                    item.predictable ? "text-ink" : "text-ink-mute",
                    active ? "bg-accent/14" : "bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10.5px] font-bold tracking-[.06em]",
                      active ? "text-accent" : "text-ink-mute",
                    )}
                  >
                    {item.circuit.country_code ?? `R${item.round_number}`}
                  </span>
                  <span className="font-semibold">
                    {stripGrandPrix(item.event_name)}
                    {item.predictable
                      ? ""
                      : item.exclusion_reason === "wet"
                        ? " · wet"
                        : " · not modelled"}
                  </span>
                  <span className="text-[11px] text-ink-mute">{fmtDate(item.event_date)}</span>
                </button>
              );
            })
          }
        </Dropdown>

        {showDriver && (
          <Dropdown
            {...DRIVER_MENU_SIZE}
            trigger={
              <>
                <DriverFace code={driver.driver_code} color={teamColor} size={22} eager />
                {driver.driver_code}
              </>
            }
          >
            {(close) => (
              <DriverMenu
                runs={runs}
                current={driver.driver_code}
                onPick={(code) => {
                  onDriver(code);
                  close();
                }}
              />
            )}
          </Dropdown>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3.5">
        <ReplayStatus />
        {driver && (
          <div className="flex items-center gap-2.5 whitespace-nowrap rounded-lg border border-control bg-raised py-[5px] pl-3 pr-1.5 text-[12.5px] font-semibold">
            {driver.team}
            <TeamLogo team={driver.team} color={teamColor} size={24} />
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-x-3 -bottom-px h-0.5 overflow-hidden rounded-sm">
          <div
            className="absolute inset-y-0 w-[35%] animate-[load-sweep_0.9s_linear_infinite]"
            style={{
              background: "linear-gradient(90deg,transparent,var(--color-accent),transparent)",
            }}
          />
        </div>
      )}
    </header>
  );
}
