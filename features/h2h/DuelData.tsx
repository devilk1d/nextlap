"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import type { Standing } from "@/lib/race/timeline";
import {
  BRAKE_COLOR,
  clamp01,
  FIGURE,
  Figure,
  LABEL,
  RPM_MAX,
  SPEED_MAX,
  sweep,
  THROTTLE_COLOR,
  whole,
} from "@/features/replay/car-bits";
import { useCarReading, type CarReading } from "@/features/replay/useCarReading";

type Props = {
  a: Standing;
  b: Standing;
  /** Colour of each driver in the head-to-head (teammates get a white fallback). */
  colorA: string;
  colorB: string;
  /** Replay clock, race seconds. */
  time: number;
};

/** Half of a butterfly bar: grows from the centre outwards, to the left for A and right for B. */
function Half({
  share,
  color,
  side,
  live,
}: {
  share: number;
  color: string;
  side: "left" | "right";
  live: boolean;
}) {
  return (
    <div className="relative h-[6px] overflow-hidden rounded-full bg-divider">
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          [side === "left" ? "right" : "left"]: 0,
          width: `${clamp01(share) * 100}%`,
          background: color,
          transition: sweep(live, "width"),
        }}
      />
    </div>
  );
}

type Bars = { shareA: number; shareB: number };

/**
 * One metric on one row: A's value on the left, B's on the right, the name between them, and
 * optionally a bar for each growing away from the middle.
 */
function Row({
  label,
  a,
  b,
  colorA,
  colorB,
  liveA,
  liveB,
  bars,
}: {
  label: string;
  a: ReactNode;
  b: ReactNode;
  colorA: string;
  colorB: string;
  liveA: boolean;
  liveB: boolean;
  bars?: Bars;
}) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2.5">
        <span className="flex items-baseline justify-end gap-1 whitespace-nowrap">{a}</span>
        <span className={cn(LABEL, "w-[58px] text-center")}>{label}</span>
        <span className="flex items-baseline gap-1 whitespace-nowrap">{b}</span>
      </div>
      {bars && (
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Half share={bars.shareA} color={colorA} side="left" live={liveA} />
          <Half share={bars.shareB} color={colorB} side="right" live={liveB} />
        </div>
      )}
    </div>
  );
}

const UNIT = "text-[11px] font-semibold text-ink-mute";

function Pill({ open, live, title }: { open: boolean; live: boolean; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-[24px] items-center rounded-md px-2.5 text-[11.5px] font-bold tracking-[.04em]"
      style={{
        background: open ? THROTTLE_COLOR : "var(--color-control)",
        color: open ? "#0b2414" : "var(--color-ink-faint)",
        opacity: live ? 1 : 0.85,
      }}
    >
      {open ? "OPEN" : "SHUT"}
    </span>
  );
}

function Who({
  x,
  color,
  reading,
  align,
}: {
  x: Standing;
  color: string;
  reading: CarReading;
  align: "right" | "left";
}) {
  const right = align === "right";
  return (
    <div className={cn("min-w-0", right ? "text-right" : "text-left")}>
      <div className={cn("flex items-center gap-1.5", right && "flex-row-reverse")}>
        <span className="h-4 w-[3px] shrink-0 rounded-sm" style={{ background: color }} />
        <span className="truncate text-[15px] font-bold tracking-[.02em]">{x.run.driver_code}</span>
      </div>
      <div
        className="mt-1 truncate text-[10.5px] leading-none text-ink-mute"
        title={
          reading.live
            ? "Live car data from the telemetry file"
            : "No live data for this race: averages of the last completed lap"
        }
      >
        {reading.live ? (
          <>
            <span className="text-go">●</span> live · L{x.currentLap}
          </>
        ) : (
          `L${reading.lap.lap_number} avg`
        )}
      </div>
    </div>
  );
}

/**
 * Car data of the two drivers on one card, as a butterfly: the same metric sits on the same row,
 * A's number and bar to the left of the centre, B's to the right. Both follow the replay clock, so
 * the cars are read at the same instant even though they are at different places on the track.
 */
export function DuelData({ a, b, colorA, colorB, time }: Props) {
  const ra = useCarReading(a, time);
  const rb = useCarReading(b, time);
  const row = { colorA, colorB, liveA: ra.live, liveB: rb.live };

  const brakeText = (r: CarReading) =>
    r.live ? (
      <span
        className={cn(FIGURE, "text-[16px]")}
        style={{ color: r.brakeShare ? BRAKE_COLOR : undefined }}
      >
        {r.brakeShare ? "ON" : "OFF"}
      </span>
    ) : (
      <>
        <Figure
          live={false}
          value={(r.brakeShare * 100).toFixed(1)}
          className={cn(FIGURE, "text-[16px]")}
        />
        <span className={UNIT}>%</span>
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2.5">
        <Who x={a} color={colorA} reading={ra} align="right" />
        <span className="w-[58px]" />
        <Who x={b} color={colorB} reading={rb} align="left" />
      </div>

      <Row
        {...row}
        label="Speed"
        a={
          <>
            <Figure live={ra.live} value={whole(ra.speed)} className={cn(FIGURE, "text-[24px]")} />
            <span className={UNIT}>km/h</span>
          </>
        }
        b={
          <>
            <Figure live={rb.live} value={whole(rb.speed)} className={cn(FIGURE, "text-[24px]")} />
            <span className={UNIT}>km/h</span>
          </>
        }
        bars={{ shareA: (ra.speed ?? 0) / SPEED_MAX, shareB: (rb.speed ?? 0) / SPEED_MAX }}
      />

      <Row
        {...row}
        label="Throttle"
        a={
          <>
            <Figure
              live={ra.live}
              value={whole(ra.throttle)}
              className={cn(FIGURE, "text-[18px]")}
            />
            <span className={UNIT}>%</span>
          </>
        }
        b={
          <>
            <Figure
              live={rb.live}
              value={whole(rb.throttle)}
              className={cn(FIGURE, "text-[18px]")}
            />
            <span className={UNIT}>%</span>
          </>
        }
        bars={{ shareA: (ra.throttle ?? 0) / 100, shareB: (rb.throttle ?? 0) / 100 }}
      />

      <Row
        {...row}
        label={ra.live && rb.live ? "Brake" : "Braking"}
        a={brakeText(ra)}
        b={brakeText(rb)}
        bars={{ shareA: ra.brakeShare, shareB: rb.brakeShare }}
      />

      <Row
        {...row}
        label="RPM"
        a={<Figure live={ra.live} value={whole(ra.rpm)} className={cn(FIGURE, "text-[18px]")} />}
        b={<Figure live={rb.live} value={whole(rb.rpm)} className={cn(FIGURE, "text-[18px]")} />}
        bars={{ shareA: (ra.rpm ?? 0) / RPM_MAX, shareB: (rb.rpm ?? 0) / RPM_MAX }}
      />

      <Row
        {...row}
        label="Gear"
        a={
          <Figure
            live={ra.live}
            value={ra.gear == null ? "—" : String(ra.gear)}
            className={cn(FIGURE, "text-[22px]")}
          />
        }
        b={
          <Figure
            live={rb.live}
            value={rb.gear == null ? "—" : String(rb.gear)}
            className={cn(FIGURE, "text-[22px]")}
          />
        }
      />

      <Row
        {...row}
        label="DRS"
        a={
          <Pill
            open={ra.drs}
            live={ra.live}
            title={
              ra.live
                ? ra.drs
                  ? "DRS open"
                  : "DRS closed"
                : `DRS was open for ${(ra.lap.tel_pct_drs_open ?? 0).toFixed(1)}% of the lap`
            }
          />
        }
        b={
          <Pill
            open={rb.drs}
            live={rb.live}
            title={
              rb.live
                ? rb.drs
                  ? "DRS open"
                  : "DRS closed"
                : `DRS was open for ${(rb.lap.tel_pct_drs_open ?? 0).toFixed(1)}% of the lap`
            }
          />
        }
      />
    </div>
  );
}
