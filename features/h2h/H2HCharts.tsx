"use client";

import { useState } from "react";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Run } from "@/lib/race/timeline";
import { clamp } from "@/lib/stats";
import { linePath } from "@/lib/svg";
import { useRace } from "@/features/dashboard/race-context";
import type { Battle } from "./battle";

const AXIS = "absolute font-mono text-[10.5px] text-ink-mute";

function xTicks(totalLaps: number) {
  return Array.from({ length: totalLaps }, (_, i) => i + 1).filter(
    (lap) => lap === 1 || lap === totalLaps || lap % 10 === 0,
  );
}

const Header = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider px-3.5 py-[9px]">
    {children}
  </div>
);

function LineKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px]">
      <span className="h-0.5 w-4" style={{ background: color }} />
      {label}
    </span>
  );
}

export function LapTimesChart({ battle }: { battle: Battle }) {
  const { timeline } = useRace();
  const [hover, setHover] = useState<number | null>(null);
  const { a, b, colorA, colorB } = battle;
  const total = timeline.totalLaps;

  const clean = (run: Run) => run.laps.filter((l) => l.clean && l.lap_time_sec !== null);
  const values = [a.run, b.run].flatMap((run) =>
    clean(run).flatMap((l) => [
      l.lap_time_sec as number,
      ...(l.prediction ? [l.prediction.predicted_lap_time_sec] : []),
    ]),
  );
  const yMin = Math.min(...values) - 0.3;
  const yMax = Math.max(...values) + 0.3;
  const X = (lap: number) => ((lap - 0.5) / total) * 100;
  const Y = (v: number) => clamp((1 - (v - yMin) / (yMax - yMin)) * 100, 0, 100);

  const actual = (x: typeof a) =>
    linePath(
      x.run.laps.map((l) =>
        l.clean && l.lap_number <= x.completed
          ? [X(l.lap_number) * 10, Y(l.lap_time_sec as number) * 10]
          : null,
      ),
    );
  const predicted = (x: typeof a) =>
    linePath(
      x.run.laps.map((l) =>
        l.prediction && l.lap_number <= x.currentLap
          ? [X(l.lap_number) * 10, Y(l.prediction.predicted_lap_time_sec) * 10]
          : null,
      ),
    );
  const pits = [
    { x: a, color: colorA, top: 4 },
    { x: b, color: colorB, top: 20 },
  ].flatMap(({ x, color, top }) =>
    x.run.stints
      .slice(1)
      .filter((s) => s.start <= x.currentLap)
      .map((s) => ({ key: `${x.run.driver_code}${s.index}`, left: X(s.start - 0.5), color, top })),
  );

  const lap = hover;
  const rows =
    lap === null
      ? []
      : [
          { x: a, color: colorA },
          { x: b, color: colorB },
        ].map(({ x, color }) => {
          const row = x.run.laps[lap - 1];
          const raced = !!row && lap <= x.completed;
          return {
            code: x.run.driver_code,
            color,
            tyre: row ? tyreOf(row.compound).color : "#333",
            time: raced
              ? `${fmtLap(row.lap_time_sec)}${row.flag ? " *" : ""}`
              : row
                ? "not raced"
                : x.run.retired
                  ? "retired"
                  : "finished",
            predicted:
              raced && row.prediction ? fmtLap(row.prediction.predicted_lap_time_sec) : "—",
            lap: raced ? row : null,
          };
        });
  const bothRaced = rows.length === 2 && rows[0].lap !== null && rows[1].lap !== null;
  const flagged = bothRaced && (rows[0].lap?.flag || rows[1].lap?.flag);
  const delta = bothRaced ? (rows[1].lap?.lap_time_sec ?? 0) - (rows[0].lap?.lap_time_sec ?? 0) : 0;
  const cursor = clamp(X(Math.max(a.distance, b.distance) + 0.5), 0, 100);
  const hoverX = lap === null ? 0 : X(lap);

  return (
    <section className="flex min-h-[280px] flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-line bg-panel wide:min-h-0">
      <Header>
        <span className="text-[13px] font-semibold">Lap times</span>
        <LineKey color={colorA} label={a.run.driver_code} />
        <LineKey color={colorB} label={b.run.driver_code} />
        <span className="text-[11.5px] text-ink-mute">
          Dashed = predicted · pit &amp; start laps hidden
        </span>
      </Header>
      <div
        className="relative mb-7 ml-[60px] mr-4 mt-3.5 min-h-[120px] flex-1"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 1, 2, 3].map((q) => {
          const value = yMin + ((yMax - yMin) * (q + 0.5)) / 4;
          return (
            <div
              key={q}
              className="absolute inset-x-0 border-t border-dashed border-[#2a2a30]"
              style={{ top: `${Y(value)}%` }}
            >
              <span className={`${AXIS} -left-14 -top-[7px]`}>{fmtLapAxis(value)}</span>
            </div>
          );
        })}
        {pits.map((pit) => (
          <div
            key={pit.key}
            className="absolute inset-y-0 border-l border-dashed"
            style={{ left: `${pit.left}%`, borderColor: pit.color }}
          >
            <span
              className="absolute left-1 text-[10px] font-bold"
              style={{ top: pit.top, color: pit.color }}
            >
              PIT
            </span>
          </div>
        ))}
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {[
            { d: predicted(a), color: colorA },
            { d: predicted(b), color: colorB },
          ].map(({ d, color }) => (
            <path
              key={color + "p"}
              d={d}
              style={{
                fill: "none",
                stroke: color,
                strokeWidth: 1.5,
                strokeDasharray: "5 5",
                opacity: 0.7,
                vectorEffect: "non-scaling-stroke",
              }}
            />
          ))}
          {[
            { d: actual(a), color: colorA },
            { d: actual(b), color: colorB },
          ].map(({ d, color }) => (
            <path
              key={color + "a"}
              d={d}
              style={{
                fill: "none",
                stroke: color,
                strokeWidth: 2.2,
                strokeLinejoin: "round",
                vectorEffect: "non-scaling-stroke",
              }}
            />
          ))}
        </svg>
        <div
          className="pointer-events-none absolute inset-y-0 border-l-2 border-accent"
          style={{ left: `${cursor}%` }}
        />
        {xTicks(total).map((n) => (
          <span
            key={n}
            className={`${AXIS} -bottom-5 -translate-x-1/2`}
            style={{ left: `${X(n)}%` }}
          >
            L{n}
          </span>
        ))}
        <div className="absolute inset-0 z-[3] flex">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i + 1)} />
          ))}
        </div>
        {lap !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[4] border-l border-white/35"
            style={{ left: `${hoverX}%` }}
          >
            <div
              className="absolute left-0 top-1 w-[230px] rounded-[10px] border border-popover bg-tooltip px-3 py-2.5 text-[12px] shadow-[0_12px_30px_rgba(0,0,0,.5)]"
              style={{
                transform: `translateX(${hoverX > 70 ? "calc(-100% - 8px)" : hoverX < 30 ? "8px" : "-50%"})`,
              }}
            >
              <div className="font-bold">Lap {lap}</div>
              {rows.map((row) => (
                <div
                  key={row.code}
                  className="mt-1.5 grid grid-cols-[4px_34px_8px_1fr_auto] items-center gap-1.5 font-mono text-[11.5px]"
                >
                  <span className="h-3.5 w-[3px]" style={{ background: row.color }} />
                  <span className="font-sans font-bold">{row.code}</span>
                  <span className="size-2 rounded-full" style={{ background: row.tyre }} />
                  <span>{row.time}</span>
                  <span className="text-ink-mute">{row.predicted}</span>
                </div>
              ))}
              <div className="mt-2 border-t border-control pt-2 text-[11.5px]">
                {!bothRaced
                  ? "Lap not completed by both"
                  : flagged
                    ? "* pit, start or neutralised lap"
                    : `${delta > 0 ? a.run.driver_code : b.run.driver_code} faster by ${Math.abs(delta).toFixed(3)} s · gap ${Math.abs(
                        battle.gaps[lap - 1]?.seconds ?? 0,
                      ).toFixed(2)} s`}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function GapChart({ battle }: { battle: Battle }) {
  const { timeline } = useRace();
  const { a, b, colorA, colorB, gaps, gapLimit } = battle;
  const total = timeline.totalLaps;
  const X = (lap: number) => ((lap - 0.5) / total) * 100;
  const Y = (v: number) => (0.5 - clamp(v, -gapLimit, gapLimit) / gapLimit / 2) * 100;
  const path = linePath(gaps.map((g) => [X(g.lap) * 10, Y(g.seconds) * 10]));
  const cursor = clamp(X(Math.max(a.distance, b.distance) + 0.5), 0, 100);
  const tint = (color: string) =>
    `color-mix(in srgb, ${color === "#ffffff" ? "#888888" : color} 6%, transparent)`;

  return (
    <section className="flex min-h-[200px] flex-[.8_1_0] flex-col overflow-hidden rounded-xl border border-line bg-panel wide:min-h-0">
      <Header>
        <span className="text-[13px] font-semibold">Gap between drivers</span>
        <span className="text-[11.5px] text-ink-mute">At each lap line</span>
        <span className="ml-auto flex gap-3.5 text-[11.5px] font-semibold">
          <span style={{ color: colorA }}>▲ {a.run.driver_code} ahead</span>
          <span style={{ color: colorB }}>▼ {b.run.driver_code} ahead</span>
        </span>
      </Header>
      <div className="relative mb-[26px] ml-[60px] mr-4 mt-3 min-h-[100px] flex-1">
        <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: tint(colorA) }} />
        <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: tint(colorB) }} />
        {[gapLimit, gapLimit / 2, 0, -gapLimit / 2, -gapLimit].map((value) => (
          <div
            key={value}
            className="absolute inset-x-0 border-t"
            style={{
              top: `${Y(value)}%`,
              borderStyle: value === 0 ? "solid" : "dashed",
              borderColor: value === 0 ? "#4a4a52" : "var(--color-hairline)",
            }}
          >
            <span className={`${AXIS} -left-14 -top-[7px]`}>
              {value === 0 ? "0" : `${Math.abs(value)} s`}
            </span>
          </div>
        ))}
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <path
            d={path}
            style={{
              fill: "none",
              stroke: "#ffffff",
              strokeWidth: 2.2,
              strokeLinejoin: "round",
              vectorEffect: "non-scaling-stroke",
            }}
          />
        </svg>
        <div
          className="pointer-events-none absolute inset-y-0 border-l-2 border-accent"
          style={{ left: `${cursor}%` }}
        />
        {xTicks(total).map((n) => (
          <span
            key={n}
            className={`${AXIS} -bottom-5 -translate-x-1/2`}
            style={{ left: `${X(n)}%` }}
          >
            L{n}
          </span>
        ))}
      </div>
    </section>
  );
}
