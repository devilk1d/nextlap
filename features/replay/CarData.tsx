"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { Standing } from "@/lib/race/timeline";
import { TeamLogo } from "@/features/common/Brand";
import {
  BRAKE_COLOR,
  clamp01,
  FIGURE,
  Figure,
  LABEL,
  SPEED_COLOR,
  SPEED_MAX,
  sweep,
  THROTTLE_COLOR,
  whole,
} from "./car-bits";
import { useCarReading } from "./useCarReading";

type Props = {
  x: Standing;
  /** Replay clock, race seconds. */
  time: number;
};

/** A bar filled to `share` (0..1), with an optional white mark at `mark` (0..1). */
function Meter({
  share,
  color,
  mark,
  live,
}: {
  share: number;
  color: string;
  mark?: number;
  live: boolean;
}) {
  return (
    <div className="relative h-[6px] rounded-full bg-divider">
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamp01(share) * 100}%`,
          background: color,
          transition: sweep(live, "width"),
        }}
      />
      {mark !== undefined && (
        <div
          className="absolute -top-[3px] h-[12px] w-[2px] rounded-full bg-white"
          style={{
            left: `calc(${clamp01(mark) * 100}% - 1px)`,
            transition: sweep(live, "left"),
          }}
        />
      )}
    </div>
  );
}

/**
 * A pedal as a tall column that fills from the bottom, like the pedal itself, with its name and
 * value under it. The column takes whatever height the card has left.
 */
function PedalColumn({
  name,
  value,
  unit,
  valueColor,
  color,
  share,
  live,
}: {
  name: string;
  value: ReactNode;
  unit?: string;
  valueColor?: string;
  color: string;
  share: number;
  live: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="relative min-h-[56px] flex-1 overflow-hidden rounded-lg bg-divider">
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${clamp01(share) * 100}%`,
            background: color,
            transition: sweep(live, "height"),
          }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className={LABEL}>{name}</span>
        <span className="flex items-baseline gap-0.5" style={{ color: valueColor }}>
          {value}
          {unit && <span className="text-[12px] font-semibold text-ink-mute">{unit}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * Car data for the focused driver, as a vertical card: speed with the top-speed mark, RPM,
 * throttle and brake bars, DRS and gear. It follows the replay clock when the race has a
 * telemetry file, and shows the averages of the last lap otherwise.
 */
export function CarData({ x, time }: Props) {
  const { live, lap, speed, topSpeed, throttle, brakeShare, rpm, gear, drs } = useCarReading(
    x,
    time,
  );
  const surname = (x.run.name.split(" ").at(-1) ?? x.run.name).toUpperCase();

  const caption = live
    ? "Live car data · white mark = top speed so far in the lap"
    : "Lap averages · white mark = top speed of the lap · no live data for this race";

  return (
    <div data-tip={caption} className="flex min-h-0 flex-1 flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <TeamLogo team={x.run.team} color={x.run.color} size={32} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-bold tracking-[.02em]">{surname}</div>
          <div className="truncate text-[13px] text-ink-mute">{x.run.team}</div>
        </div>
      </div>

      <div>
        <div className={cn(LABEL, "flex justify-between")}>
          <span>Speed</span>
          <span className="font-mono text-[11.5px]">Top {whole(topSpeed)}</span>
        </div>
        <div className="mb-2 mt-1.5 flex items-end justify-between gap-2">
          <span className="flex items-baseline gap-1.5">
            <Figure live={live} value={whole(speed)} className={cn(FIGURE, "text-[48px]")} />
            <span className="text-[12px] font-semibold tracking-[.08em] text-ink-mute">KMH</span>
          </span>
          <span className="flex flex-col items-end gap-0.5">
            <Figure live={live} value={whole(rpm)} className={cn(FIGURE, "text-[20px]")} />
            <span className="text-[11px] font-semibold leading-none tracking-[.08em] text-ink-mute">
              RPM
            </span>
          </span>
        </div>
        <Meter
          live={live}
          color={SPEED_COLOR}
          share={(speed ?? 0) / SPEED_MAX}
          mark={topSpeed == null ? undefined : topSpeed / SPEED_MAX}
        />
      </div>

      <div className="flex min-h-[104px] flex-1 gap-3">
        <PedalColumn
          name="Throttle"
          unit="%"
          color={THROTTLE_COLOR}
          share={(throttle ?? 0) / 100}
          live={live}
          value={
            <Figure live={live} value={whole(throttle)} className={cn(FIGURE, "text-[20px]")} />
          }
        />
        <PedalColumn
          name={live ? "Brake" : "Braking"}
          unit={live ? undefined : "%"}
          color={BRAKE_COLOR}
          share={brakeShare}
          live={live}
          valueColor={live && brakeShare ? BRAKE_COLOR : undefined}
          value={
            live ? (
              <span className={cn(FIGURE, "text-[20px]")}>{brakeShare ? "ON" : "OFF"}</span>
            ) : (
              <Figure
                live={false}
                value={lap.tel_pct_braking == null ? "—" : lap.tel_pct_braking.toFixed(1)}
                className={cn(FIGURE, "text-[20px]")}
              />
            )
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <span
          data-tip={
            live
              ? drs
                ? "DRS open"
                : "DRS closed"
              : `DRS was open for ${(lap.tel_pct_drs_open ?? 0).toFixed(1)}% of the lap`
          }
          className="inline-flex h-[28px] items-center rounded-md px-3 text-[13px] font-bold tracking-[.04em]"
          style={{
            background: drs ? THROTTLE_COLOR : "var(--color-control)",
            color: drs ? "#0b2414" : "var(--color-ink-faint)",
          }}
        >
          DRS
        </span>
        <span
          data-tip={live ? "Current gear" : "Most used gear on the lap"}
          className="flex items-baseline gap-2"
        >
          <span className="text-[12px] font-semibold tracking-[.1em] text-ink-mute">GEAR</span>
          <Figure
            live={live}
            value={gear == null ? "—" : String(gear)}
            className={cn(FIGURE, "text-[30px]")}
          />
        </span>
      </div>
    </div>
  );
}
