"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import importance from "@/data/permutation-importance.json";
import { fmtLap, fmtSigned, fmtTimer } from "@/lib/format";
import { EVENT, tyreOf } from "@/lib/race/constants";
import {
  sectorBests,
  sectorShares,
  sectorTone,
  SECTOR_TIME_KEYS,
  TONE_COLOR,
} from "@/lib/race/laps";
import { spans } from "@/lib/stats";
import type { RunLap, Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import { useReplay } from "./store";
import type { Focus } from "./focus";

type Tab = "log" | "sec" | "ctx";

const TABS: { id: Tab; label: string }[] = [
  { id: "log", label: "Lap log" },
  { id: "sec", label: "Sectors" },
  { id: "ctx", label: "Context" },
];

/** Permutation importance of the final model, exported from the training notebook. */
const IMPORTANCE = importance as { feature: string; label: string; importance: number }[];

function positionText(lap: RunLap): string {
  if (lap.position === null) return "";
  return lap.driver_ahead && lap.gap_ahead_sec !== null
    ? `P${lap.position} · +${lap.gap_ahead_sec.toFixed(3)} to ${lap.driver_ahead}`
    : `P${lap.position} · Leading`;
}

function LogEntry({
  lap,
  bests,
  best,
  tolerance,
  onSeek,
}: {
  lap: RunLap;
  bests: (number | null)[];
  best: number | null;
  tolerance: number | null;
  onSeek: () => void;
}) {
  const predicted = lap.prediction?.predicted_lap_time_sec ?? null;
  const delta =
    predicted !== null && lap.lap_time_sec !== null ? lap.lap_time_sec - predicted : null;
  const inside = delta !== null && tolerance !== null ? Math.abs(delta) <= tolerance : null;
  const sectors = SECTOR_TIME_KEYS.map((key, i) =>
    lap.flag ? "none" : sectorTone(lap[key], bests[i]),
  );

  return (
    <div
      className="cursor-pointer border-l-2 border-transparent py-[9px] pl-3 pr-3.5"
      onClick={onSeek}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] text-ink-mute">L{lap.lap_number}</span>
        <span
          className="font-mono text-[13.5px] font-semibold"
          style={{
            color: lap.clean && lap.lap_time_sec === best ? "var(--color-best)" : undefined,
          }}
        >
          {fmtLap(lap.lap_time_sec)}
        </span>
        <span className="ml-auto text-[10.5px] font-bold tracking-[.06em] text-caution">
          {lap.flag ?? ""}
        </span>
      </div>
      <div className="mt-[3px] font-mono text-[11.5px] leading-[1.65] text-ink-mute">
        <div>
          {SECTOR_TIME_KEYS.map((key, i) => (
            <span key={key}>
              {i > 0 && "  "}S{i + 1}{" "}
              <span style={{ color: TONE_COLOR[sectors[i] as keyof typeof TONE_COLOR] }}>
                {lap[key]?.toFixed(3) ?? "——"}
              </span>
            </span>
          ))}
        </div>
        <div
          style={{
            color:
              lap.gap_ahead_sec !== null && lap.gap_ahead_sec < 1
                ? "var(--color-accent)"
                : undefined,
          }}
        >
          {positionText(lap)}
        </div>
        {predicted !== null && (
          <div>
            Pred {fmtLap(predicted)}{" "}
            {delta !== null && (
              <span
                style={{ color: inside === false ? "var(--color-caution)" : "var(--color-go)" }}
              >
                {fmtSigned(delta)} {inside === null ? "" : inside ? "within" : "outside"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LapLog({
  x,
  focus,
  tolerance,
  time,
}: {
  x: Standing;
  focus: Focus;
  tolerance: number | null;
  time: number;
}) {
  const seek = useReplay((s) => s.seek);
  const { timeline } = useRace();
  const { run, completed, currentLap, fraction, done } = x;
  const bests = sectorBests(focus.cleanDone);
  const best = focus.best?.lap_time_sec ?? null;
  const elapsed = Math.max(0, time - run.cum[currentLap - 1]);
  const passed = spans(sectorShares(timeline)).map(({ end }) => fraction >= end);
  const predicted = focus.currentLap.prediction?.predicted_lap_time_sec;

  return (
    <>
      {!done && (
        <div className="border-l-2 border-accent bg-accent/8 py-[9px] pl-3 pr-3.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-ink-mute">L{currentLap}</span>
            <span className="font-mono text-[13.5px] font-semibold text-accent">
              {fmtTimer(elapsed)}
            </span>
            <span className="ml-auto text-[10.5px] font-bold tracking-[.06em] text-accent">
              IN PROGRESS
            </span>
          </div>
          <div className="mt-[3px] font-mono text-[11.5px] leading-[1.65] text-ink-mute">
            <div>
              {SECTOR_TIME_KEYS.map((key, i) => (
                <span key={key}>
                  {i > 0 && "  "}S{i + 1}{" "}
                  <span
                    style={{
                      color:
                        passed[i] && i < 2
                          ? TONE_COLOR[sectorTone(focus.currentLap[key], bests[i])]
                          : "var(--color-ink-faint)",
                    }}
                  >
                    {passed[i] && i < 2 ? (focus.currentLap[key]?.toFixed(3) ?? "——") : "——"}
                  </span>
                </span>
              ))}
            </div>
            <div className="text-ink-soft">P{x.position} now</div>
            {predicted != null && (
              <div>
                Pred {fmtLap(predicted)} <span>forecast</span>
              </div>
            )}
          </div>
        </div>
      )}
      {Array.from({ length: completed }, (_, k) => completed - 1 - k).map((index) => {
        const lap = run.laps[index];
        return (
          <LogEntry
            key={lap.lap_number}
            lap={lap}
            bests={bests}
            best={best}
            tolerance={tolerance}
            onSeek={() => seek(run.cum[lap.lap_number] + 0.02)}
          />
        );
      })}
    </>
  );
}

function SectorsTab({ focus }: { focus: Focus }) {
  const { lastLap, cleanDone } = focus;
  const bests = sectorBests(cleanDone);
  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-2.5">
      <div className="text-[11.5px] text-ink-mute">
        Last completed lap{lastLap ? ` (L${lastLap.lap_number})` : ""} vs your best
      </div>
      {SECTOR_TIME_KEYS.map((key, i) => {
        const time = lastLap?.[key] ?? null;
        const tone = lastLap?.flag ? "none" : sectorTone(time, bests[i]);
        const delta = time !== null && bests[i] !== null && !lastLap?.flag ? time - bests[i] : null;
        return (
          <div
            key={key}
            className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border border-hairline bg-inset px-3 py-2.5"
          >
            <span className="font-cond text-[16px] font-bold" style={{ color: TONE_COLOR[tone] }}>
              S{i + 1}
            </span>
            <div>
              <div className="font-mono text-[14px] font-semibold">{time?.toFixed(3) ?? "—"}</div>
              <div className="mt-0.5 text-[11px] text-ink-mute">
                Best {bests[i]?.toFixed(3) ?? "—"}
              </div>
            </div>
            <span className="font-mono text-[12px]" style={{ color: TONE_COLOR[tone] }}>
              {delta === null ? "—" : fmtSigned(delta)}
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-[11px] text-ink-mute">
        {(
          [
            ["best", "Own best"],
            ["good", "Within 0.15 s"],
            ["slow", "Slower"],
          ] as const
        ).map(([tone, label]) => (
          <span key={tone} className="flex items-center gap-[5px]">
            <span className="size-2 rounded-sm" style={{ background: TONE_COLOR[tone] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ContextRow({ name, value, color }: { name: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-rowline py-1.5 text-[12px]">
      <span className="text-ink-dim">{name}</span>
      <span className="font-mono" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function trackStatus(lap: RunLap): { text: string; color?: string } {
  if (lap.is_safety_car) return { text: EVENT.SC.name, color: EVENT.SC.color };
  if (lap.is_vsc) return { text: EVENT.VSC.name, color: EVENT.VSC.color };
  if (lap.is_red_flag) return { text: EVENT.RED.name, color: EVENT.RED.color };
  if (lap.is_yellow) return { text: EVENT.YEL.name, color: EVENT.YEL.color };
  return { text: "Green" };
}

function ContextTab({ focus }: { focus: Focus }) {
  const { lastLap, currentLap } = focus;
  const max = Math.max(...IMPORTANCE.map((item) => item.importance), 0);

  return (
    <div className="flex flex-col gap-3 px-3.5 py-3">
      <div>
        <div className="text-[11px] font-bold tracking-[.08em] text-accent">
          WHAT THE MODEL SEES FOR L{currentLap.lap_number}
        </div>
        <div className="mt-1 text-[11.5px] leading-[1.45] text-ink-mute">
          Conditions at the end of the last completed lap
          {lastLap ? ` (L${lastLap.lap_number})` : ""}; the forecast is made from these signals.
        </div>
      </div>
      {lastLap ? (
        <div>
          <ContextRow
            name="Gap to car ahead"
            value={lastLap.gap_ahead_sec === null ? "—" : `${lastLap.gap_ahead_sec.toFixed(3)} s`}
          />
          <ContextRow
            name="Dirty air (< 1 s)"
            value={lastLap.dirty_air ? "Yes" : "No"}
            color={lastLap.dirty_air ? "var(--color-caution)" : undefined}
          />
          <ContextRow
            name="Tyre"
            value={`${tyreOf(lastLap.compound).name} · ${lastLap.tyre_life ?? "–"} laps`}
          />
          <ContextRow
            name="Track status"
            value={trackStatus(lastLap).text}
            color={trackStatus(lastLap).color}
          />
          <ContextRow
            name="Track temperature"
            value={lastLap.track_temp === null ? "—" : `${lastLap.track_temp.toFixed(1)} °C`}
          />
          <ContextRow
            name="Air temperature"
            value={lastLap.air_temp === null ? "—" : `${lastLap.air_temp.toFixed(1)} °C`}
          />
          <ContextRow name="Rainfall" value={lastLap.rainfall ? "Yes" : "No"} />
        </div>
      ) : (
        <div className="rounded-lg bg-raised px-3 py-2 text-[11.5px] text-ink-dim">
          No completed lap yet.
        </div>
      )}

      {IMPORTANCE.length > 0 && (
        <div>
          <div className="text-[11px] font-bold tracking-[.08em] text-accent">
            FEATURE IMPORTANCE
          </div>
          <div className="mt-1 text-[11.5px] leading-[1.45] text-ink-mute">
            Permutation importance of the final model (increase in error when a feature is
            shuffled).
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {IMPORTANCE.map((item) => (
              <div key={item.feature}>
                <div className="flex justify-between text-[12px]">
                  <span>{item.label}</span>
                  <span className="font-mono text-ink-mute">{item.importance.toFixed(3)}</span>
                </div>
                <div className="mt-[5px] h-1.5 rounded-[3px] bg-hairline">
                  <div
                    className="h-full rounded-[3px] bg-accent"
                    style={{ width: `${max ? (item.importance / max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LapTabs({ x, focus, time }: { x: Standing; focus: Focus; time: number }) {
  const [tab, setTab] = useState<Tab>("log");
  const { detail } = useRace();
  const tolerance = detail.metrics[0]?.rmse ?? null;

  return (
    <>
      <div className="grid flex-none grid-cols-3 border-b border-divider">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "cursor-pointer border-0 bg-transparent py-2.5 text-[12px] font-semibold",
              tab === id ? "text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-ink-mute",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-[200px] flex-1 overflow-auto py-1 max-[1179px]:max-h-[420px]">
        {tab === "log" && <LapLog x={x} focus={focus} tolerance={tolerance} time={time} />}
        {tab === "sec" && <SectorsTab focus={focus} />}
        {tab === "ctx" && <ContextTab focus={focus} />}
      </div>
    </>
  );
}
