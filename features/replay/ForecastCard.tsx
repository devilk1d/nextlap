"use client";

import { fmtGap, fmtLap, fmtLapsDown, fmtSigned, fmtTimer } from "@/lib/format";
import { EVENT, tyreOf } from "@/lib/race/constants";
import { isNeutralised, noForecast, sectorShares } from "@/lib/race/laps";
import { spans } from "@/lib/stats";
import type { Standing } from "@/lib/race/timeline";
import { useRace } from "@/features/dashboard/race-context";
import type { Focus } from "./focus";

const GO = "var(--color-go)";

function title(x: Standing): string {
  if (x.retired) return "RETIRED";
  if (x.done) return "CHEQUERED FLAG";
  const flag = x.lap.flag;
  return `${isNeutralised(flag) ? EVENT[flag].name.toUpperCase() : "LAP IN PROGRESS"} · L${x.currentLap}`;
}

function note(x: Standing, leaderCode: string, totalLaps: number): string {
  const { run, lap } = x;
  if (x.retired)
    return `${run.status ?? "DNF"} on lap ${x.lapCount + 1} · ${x.lapCount} laps completed`;
  if (x.done) {
    if (x.position === 1) return "Race winner";
    return `Finished ${x.lapsDown >= 1 ? fmtLapsDown(x.lapsDown) : `${fmtGap(x.toLeader)} s`} behind ${leaderCode}`;
  }
  return lap.prediction
    ? `Forecast on ${tyreOf(lap.compound).name} tyres, ${lap.tyre_life ?? "–"} laps old`
    : `No forecast for this lap. ${noForecast(run, lap, totalLaps).text}`;
}

type Props = { x: Standing; focus: Focus; time: number; leaderCode: string };

/** The model's forecast for the lap in progress, plus how the last forecast fared. */
export function ForecastCard({ x, focus, time, leaderCode }: Props) {
  const { timeline, detail } = useRace();
  const { run, currentLap: lapNumber, done, retired, fraction } = x;
  const { currentLap, lastLap, stint } = focus;
  const windowSize = detail.model?.window_size ?? 3;
  const tolerance = detail.metrics[0]?.rmse ?? null;

  const predicted = currentLap.prediction?.predicted_lap_time_sec ?? null;
  const lastPredicted = lastLap?.prediction?.predicted_lap_time_sec ?? null;
  const lastDelta =
    lastPredicted !== null && lastLap?.lap_time_sec != null
      ? lastLap.lap_time_sec - lastPredicted
      : null;
  const inside = lastDelta !== null && tolerance !== null ? Math.abs(lastDelta) <= tolerance : null;

  const inputs = run.laps
    .filter((lap) => lap.clean && lap.lap_number < lapNumber && lap.lap_number >= stint.start)
    .slice(-windowSize);
  const skipped = run.laps.filter(
    (lap) => isNeutralised(lap.flag) && lap.lap_number < lapNumber && lap.lap_number >= stint.start,
  ).length;

  const sectors = spans(sectorShares(timeline)).map(({ start, end }, i) => ({
    name: `S${i + 1}`,
    share: end - start,
    passed: done || fraction >= end,
    current: !done && fraction >= start && fraction < end,
  }));

  const bandText = !lastLap
    ? "NO COMPLETED LAP YET"
    : lastDelta === null
      ? "LAST LAP · NOT PREDICTED"
      : inside === null
        ? `LAST LAP · ${fmtSigned(lastDelta)} s vs FORECAST`
        : `LAST LAP · ${inside ? "WITHIN" : "OUTSIDE"} ±${tolerance?.toFixed(2)} s`;
  const bandTone = lastDelta === null || inside === null ? "idle" : inside ? "good" : "slow";

  return (
    <div className="relative z-[2] self-start overflow-hidden rounded-xl border border-overlay bg-[rgba(22,22,25,.92)] backdrop-blur-[10px]">
      <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
        <span className="whitespace-nowrap text-[11px] font-bold tracking-[.1em] text-accent">
          {title(x)}
        </span>
        <span className="whitespace-nowrap text-[11.5px] text-ink-mute">
          of {timeline.totalLaps}
        </span>
      </div>

      <div className="px-3.5 pb-3.5 pt-3">
        <div className="text-[11.5px] text-ink-mute">
          {done ? "Final classification" : "Predicted time for this lap"}
        </div>
        <div className="mt-1.5 font-cond text-[52px] font-semibold leading-none">
          {retired ? "DNF" : done ? `P${x.position}` : fmtLap(predicted)}
        </div>
        <div className="mt-1.5 text-[11.5px] text-ink-dim [text-wrap:pretty]">
          {note(x, leaderCode, timeline.totalLaps)}
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-[11.5px]">
            <span className="text-ink-mute">Lap timer</span>
            <span className="font-mono font-semibold text-accent">
              {done ? "—" : fmtTimer(Math.max(0, time - run.cum[lapNumber - 1]))}
            </span>
          </div>
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-[3px] bg-hairline">
            <div
              className="absolute inset-y-0 left-0 rounded-[3px] bg-accent"
              style={{ width: `${(done ? 1 : fraction) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex gap-1">
            {sectors.map(({ name, share, passed, current }) => (
              <div
                key={name}
                className="rounded py-[3px] text-center text-[10.5px] font-bold"
                style={{
                  flex: share,
                  background: current
                    ? "var(--color-accent)"
                    : passed
                      ? "color-mix(in srgb, var(--color-accent) 22%, transparent)"
                      : "var(--color-divider)",
                  color: current
                    ? "#111"
                    : passed
                      ? "var(--color-accent)"
                      : "var(--color-ink-mute)",
                }}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!done && isNeutralised(currentLap.flag) && (
        <div
          className="px-3.5 py-2 text-[11.5px] font-bold tracking-[.04em] text-[#111]"
          style={{ background: EVENT[currentLap.flag].color }}
        >
          {EVENT[currentLap.flag].name}
          {predicted === null ? " — forecast suspended, lap excluded from metrics" : ""}
        </div>
      )}
      <div
        className="px-3.5 py-2 text-[11.5px] font-bold tracking-[.08em]"
        style={{
          background:
            bandTone === "good"
              ? GO
              : bandTone === "slow"
                ? "var(--color-caution)"
                : "var(--color-divider)",
          color: bandTone === "idle" ? "var(--color-ink-dim)" : "#0d0d0f",
        }}
      >
        {bandText}
      </div>

      <div className="px-3.5 pb-3.5 pt-3">
        <div className="grid grid-cols-3 gap-2">
          <Figure
            label={`L${lastLap?.lap_number ?? "–"} actual`}
            value={fmtLap(lastLap?.lap_time_sec)}
          />
          <Figure label="Predicted" value={fmtLap(lastPredicted)} color="var(--color-accent)" />
          <Figure
            label="Delta"
            value={lastDelta === null ? "—" : `${fmtSigned(lastDelta)} s`}
            color={lastDelta === null ? undefined : lastDelta < 0 ? GO : "var(--color-stop)"}
          />
        </div>
        <div className="mt-3 text-[11px] text-ink-mute">
          {inputs.length
            ? `Model input · last ${inputs.length} clean lap${inputs.length > 1 ? "s" : ""} on this set`
            : "Model input · waiting for clean laps"}
          {skipped ? ` · ${skipped} neutralised lap${skipped > 1 ? "s" : ""} skipped` : ""}
        </div>
        <div className="mt-1.5 flex gap-1">
          {inputs.map((lap) => (
            <div
              key={lap.lap_number}
              className="min-w-0 flex-1 rounded-md border border-control bg-[#1c1c20] px-1.5 py-[5px]"
            >
              <div className="text-[10px] text-ink-mute">L{lap.lap_number}</div>
              <div className="mt-0.5 font-mono text-[10.5px]">
                {fmtLap(lap.lap_time_sec).slice(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-mute">{label}</div>
      <div className="mt-1 font-mono text-[13px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
