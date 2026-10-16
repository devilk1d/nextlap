"use client";

import type { HTMLAttributes, ReactNode, Ref } from "react";
import { RollingText } from "@/components/ui/RollingText";
import { cn } from "@/components/ui/cn";
import { fmtGap, fmtLap, fmtLapsDown, fmtSigned, fmtTimer } from "@/lib/format";
import { EVENT, tyreOf } from "@/lib/race/constants";
import {
  isNeutralised,
  lapToneOf,
  noForecast,
  sectorProgress,
  sectorShares,
  sectorToneOf,
  SECTOR_TONE_COLOR,
  SECTOR_TONE_MEANING,
  type SectorTone,
} from "@/lib/race/laps";
import { PIT_PHASE_LABEL } from "@/lib/race/pit";
import type { Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import type { Focus } from "./focus";
import { useForecastWhy } from "./ForecastWhy";

const GO = "var(--color-go)";
/** How long a finished lap stays on the bar before the next lap starts (race seconds). */
const LAP_HOLD_SECONDS = 5;

/** What the car is doing right now, with the colour it deserves. */
function status(x: Standing): { text: string; color: string } {
  if (x.retired) return { text: "Retired", color: "var(--color-stop)" };
  if (x.done) return { text: "Chequered flag", color: "var(--color-accent)" };
  if (x.pit)
    return {
      text: PIT_PHASE_LABEL[x.pit.phase],
      color: "var(--color-caution)",
    };
  const flag = x.lap.flag;
  if (isNeutralised(flag))
    return { text: EVENT[flag].name, color: EVENT[flag].color };
  return { text: "Racing", color: GO };
}

function raceNote(x: Standing, leaderCode: string): string {
  if (x.retired)
    return `${x.run.status ?? "DNF"} · ${x.lapCount} laps completed`;
  if (x.done) {
    if (x.position === 1) return "Race winner";
    return `${x.lapsDown >= 1 ? fmtLapsDown(x.lapsDown) : `${fmtGap(x.toLeader)} s`} behind ${leaderCode}`;
  }
  return `${tyreOf(x.lap.compound).name} · ${x.lap.tyre_life ?? "–"} laps`;
}

export function Cell({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & Omit<
  HTMLAttributes<HTMLDivElement>,
  "className" | "children"
> & {
    ref?: Ref<HTMLDivElement>;
  }) {
  return (
    <div
      {...rest}
      className={cn(
        "flex min-w-0 flex-col justify-center border-r border-hairline px-3 py-2 last:border-r-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

const LABEL = "whitespace-nowrap text-[12px] leading-none text-ink-mute";

type BoxState = "done" | "current" | "pending";

/**
 * One sector of the lap as a segment of a bar: it fills as the car drives it, and turns purple,
 * green, yellow or white when finished. Name and time sit above it, the verdict below.
 */
function Sector({
  name,
  time,
  tone,
  state,
  fill,
  grow,
}: {
  name: string;
  time: number | null;
  tone: SectorTone;
  state: BoxState;
  fill: number;
  grow: number;
}) {
  const meaning = tone === "none" ? null : SECTOR_TONE_MEANING[tone];
  const done = state === "done" && meaning !== null;
  const color = done ? SECTOR_TONE_COLOR[tone] : "var(--color-accent)";
  const caption = done ? meaning.short : state === "current" ? "NOW" : "";
  return (
    <div
      data-tip={done ? `${name}: ${meaning.text}` : undefined}
      className="min-w-0"
      style={{ flexGrow: grow, flexBasis: 0 }}
    >
      <div className="flex items-baseline justify-between gap-1 leading-none">
        <span className="text-[11px] font-bold text-ink-mute">{name}</span>
        <span
          className="font-mono text-[12.5px] font-semibold"
          style={{ color: done ? color : "var(--color-ink-faint)" }}
        >
          {done && time !== null ? time.toFixed(3) : "—"}
        </span>
      </div>
      <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-divider">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(done ? 1 : state === "current" ? fill : 0) * 100}%`,
            background: color,
          }}
        />
      </div>
      <div
        className="mt-1 h-[9px] truncate text-[10px] font-bold leading-[9px]"
        style={{ color: state === "current" ? "var(--color-accent)" : color }}
      >
        {caption}
      </div>
    </div>
  );
}

/** Lap counter and what the car is doing, as a chip over the map. */
export function StatusChip({
  x,
  totalLaps,
}: {
  x: Standing;
  totalLaps: number;
}) {
  const state = status(x);
  return (
    <div className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-overlay bg-[rgba(22,22,25,.92)] px-2.5 py-1.5 text-[13px]">
      <span className="text-ink-mute">
        Lap {x.currentLap} of {totalLaps}
      </span>
      <span
        className="size-1.5 rounded-full"
        style={{ background: state.color }}
      />
      <span className="font-bold" style={{ color: state.color }}>
        {state.text}
      </span>
    </div>
  );
}

type Props = { x: Standing; focus: Focus; time: number; leaderCode: string };

/**
 * Timing bar under the circuit map: lap status, the forecast turning into the real lap time, the
 * three sectors (held for a few seconds after the lap), and how the last forecast fared.
 */
export function ForecastBar({ x, focus, time, leaderCode }: Props) {
  const { timeline, detail } = useRace();
  const { run, currentLap: lapNumber, done, retired, completed } = x;
  const { currentLap, lastLap } = focus;
  const tolerance = detail.metrics[0]?.rmse ?? null;

  const predicted = currentLap.prediction?.predicted_lap_time_sec ?? null;
  const lastPredicted = lastLap?.prediction?.predicted_lap_time_sec ?? null;
  const lastDelta =
    lastPredicted !== null && lastLap?.lap_time_sec != null
      ? lastLap.lap_time_sec - lastPredicted
      : null;
  const inside =
    lastDelta !== null && tolerance !== null
      ? Math.abs(lastDelta) <= tolerance
      : null;
  const deltaColor =
    lastDelta === null
      ? "var(--color-ink-mute)"
      : inside === false
        ? "var(--color-caution)"
        : lastDelta < 0
          ? GO
          : "var(--color-stop)";

  const live = !done && !retired;
  const elapsed = live ? Math.max(0, time - run.cum[lapNumber - 1]) : 0;
  const progress = sectorProgress(x.lap, elapsed, sectorShares(timeline));

  // Like the TV graphic: a finished lap stays on screen for a few seconds with its lap time.
  const holding =
    lastLap !== null &&
    completed >= 1 &&
    (!live || time - run.cum[completed] < LAP_HOLD_SECONDS);
  const shown = holding && lastLap ? lastLap : x.lap;
  const lapTone =
    holding && lastLap ? lapToneOf(timeline, run, lastLap.lap_number) : "white";
  const sectorTimes = [
    shown.sector1_time_sec,
    shown.sector2_time_sec,
    shown.sector3_time_sec,
  ];

  // Headline: the forecast for the lap in progress, which turns into the real lap time when the
  // car crosses the line and stays for a moment, then moves on to the next forecast.
  const reveal =
    live && holding && lastLap !== null && lastLap.lap_time_sec !== null;
  const reason =
    live && !reveal && predicted === null
      ? noForecast(run, x.lap, timeline.totalLaps)
      : null;
  const next = reason
    ? run.laps.find((l) => l.lap_number > lapNumber && l.prediction)
    : null;

  const headline = retired
    ? "DNF"
    : done
      ? `P${x.position}`
      : reveal && lastLap
        ? fmtLap(lastLap.lap_time_sec)
        : predicted !== null
          ? fmtLap(predicted)
          : "No forecast";
  const headlineLabel = done
    ? "Result"
    : reveal && lastLap
      ? `L${lastLap.lap_number} lap time`
      : "Forecast";
  const flash =
    reveal && lapTone === "purple"
      ? "color-mix(in srgb, var(--color-best) 45%, transparent)"
      : reveal && lapTone === "green"
        ? "color-mix(in srgb, var(--color-go) 40%, transparent)"
        : "rgba(255,255,255,.16)";
  const headlineColor =
    reveal && (lapTone === "purple" || lapTone === "green")
      ? SECTOR_TONE_COLOR[lapTone]
      : headline === "No forecast"
        ? "var(--color-ink-dim)"
        : undefined;

  const subline = reveal
    ? lastPredicted !== null && lastDelta !== null
      ? `Forecast ${fmtLap(lastPredicted)} · ${fmtSigned(lastDelta)} s`
      : "No forecast was made"
    : reason
      ? `${reason.title}${reason.progress ? ` ${reason.progress.have}/${reason.progress.need}` : ""}`
      : raceNote(x, leaderCode);
  const subTitle = reason
    ? `${reason.title}. ${reason.text}${next ? ` Next forecast: lap ${next.lap_number}.` : ""}`
    : undefined;

  // The strip explains the forecast of the lap being shown: the lap that just finished while its
  // time is on screen, otherwise the lap in progress.
  const why = useForecastWhy(
    x,
    reveal && lastLap ? lastLap.lap_number : lapNumber,
  );

  return (
    <div
      data-tour="forecast"
      className="relative z-[2] flex items-stretch border-t border-divider bg-[rgba(22,22,25,.96)]"
    >
      <Cell
        {...(why?.cellProps ?? {})}
        data-tour="why"
        className={cn("relative w-[168px] shrink-0", why && "cursor-help")}
      >
        {why?.node}
        <span className={LABEL}>{headlineLabel}</span>
        <span
          className="mt-1 flex h-[28px] items-center"
          style={{ color: headlineColor }}
        >
          <RollingText
            value={headline}
            flash={reveal ? flash : undefined}
            className={cn(
              "font-cond font-semibold",
              headline === "No forecast" ? "text-[22px]" : "text-[28px]",
            )}
          />
        </span>
        <span
          data-tip={subTitle}
          className="mt-1 truncate text-[12px] leading-none"
          style={{
            color:
              reveal && lastDelta !== null
                ? deltaColor
                : "var(--color-ink-dim)",
          }}
        >
          {subline}
        </span>
      </Cell>

      <Cell className="min-w-0 flex-1">
        <span className={cn(LABEL, "flex items-baseline justify-between")}>
          <span>
            {holding && lastLap ? `L${lastLap.lap_number} sectors` : "Sectors"}
          </span>
          <span
            className="font-mono text-[12px]"
            style={{
              color:
                holding && live
                  ? "var(--color-ink-mute)"
                  : "var(--color-accent)",
            }}
          >
            {holding && live ? "lap complete" : done ? "—" : fmtTimer(elapsed)}
          </span>
        </span>
        <span className="mt-2 flex gap-2">
          {[0, 1, 2].map((k) => {
            const finished = holding || (live && progress.done[k]);
            const lap = holding && lastLap ? lastLap.lap_number : lapNumber;
            return (
              <Sector
                key={k}
                name={`S${k + 1}`}
                time={sectorTimes[k]}
                tone={
                  finished
                    ? sectorToneOf(timeline, run, lap, k as 0 | 1 | 2)
                    : "none"
                }
                state={
                  finished
                    ? "done"
                    : live && progress.current === k
                      ? "current"
                      : "pending"
                }
                fill={progress.fill[k]}
                grow={progress.durations[k]}
              />
            );
          })}
        </span>
      </Cell>

      <Cell className="shrink-0">
        <span className={LABEL}>
          {lastLap ? `Last lap L${lastLap.lap_number}` : "Last lap"}
        </span>
        <span
          className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap leading-none"
          data-tip={
            lastDelta === null
              ? "The last lap had no forecast"
              : `Against its forecast: ${inside ? "within" : "outside"} the model's typical error of ±${tolerance?.toFixed(2)} s`
          }
        >
          <span className="font-mono text-[15px] font-semibold">
            {lastLap ? fmtLap(lastLap.lap_time_sec) : "—"}
          </span>
          <span
            className="font-mono text-[12px] font-semibold"
            style={{ color: deltaColor }}
          >
            {lastDelta === null ? "" : fmtSigned(lastDelta)}
          </span>
        </span>
        <span className="mt-1 whitespace-nowrap font-mono text-[12px] leading-none text-ink-mute">
          Pred {fmtLap(lastPredicted)}
        </span>
      </Cell>
    </div>
  );
}
