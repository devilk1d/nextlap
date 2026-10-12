"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { fmtLap, fmtLapAxis, fmtSigned, stripGrandPrix } from "@/lib/format";
import { EVENT, tyreOf } from "@/lib/race/constants";
import {
  FORECAST_WARMUP_LAPS,
  isNeutralised,
  noForecast,
  noForecastSummary,
} from "@/lib/race/laps";
import type { Standing } from "@/lib/race/timeline";
import { clamp } from "@/lib/stats";
import { linePath } from "@/lib/svg";
import { useRace } from "@/features/dashboard/race-context";
import { lapChart, neutralisedCount } from "./chart-data";
import { exportChartPng, exportLapsCsv } from "./exports";
import type { Focus } from "./focus";
import { useReplay } from "./store";

const GRID_LINE = "absolute inset-x-0 border-t border-dashed border-hairline";
const AXIS_LABEL = "absolute font-mono text-[10.5px] text-ink-mute";

function Key({ children, line }: { children: React.ReactNode; line: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-soft">
      {line}
      {children}
    </span>
  );
}

type Props = { x: Standing; focus: Focus };

/** Actual vs predicted lap times of the focused driver: the whole race, or one stint. */
export function LapChart({ x, focus }: Props) {
  const { race, detail } = useRace();
  const seek = useReplay((s) => s.seek);
  const [hover, setHover] = useState<number | null>(null);
  const [scope, setScope] = useState<"race" | "stint">("race");

  const { run, completed, currentLap, fraction, done } = x;
  const { stint } = focus;
  const whole = scope === "race";
  const view = whole ? { start: 1, end: run.laps.length } : { start: stint.start, end: stint.end };
  const scopeName = whole ? "Whole race" : `Stint ${stint.index + 1}`;
  const chart = lapChart(x, view);
  const { laps, yMin, yMax } = chart;
  const n = laps.length;
  const windowSize = detail.model?.window_size ?? 3;

  const X = (j: number) => (n <= 1 ? 50 : (j / (n - 1)) * 100);
  const Y = (v: number) => clamp((1 - (v - yMin) / (yMax - yMin)) * 100, 0, 100);
  const step = 100 / Math.max(1, n - 1);

  const actual = linePath(
    laps.map((l, j) => (l.clean && l.done && l.time !== null ? [X(j) * 10, Y(l.time) * 10] : null)),
  );
  const predicted = linePath(
    laps.map((l, j) => (l.predicted !== null && l.shown ? [X(j) * 10, Y(l.predicted) * 10] : null)),
  );

  const inputs = run.laps
    .filter((l) => l.clean && l.lap_number < currentLap && l.lap_number >= stint.start)
    .slice(-windowSize);
  const windowIdx = inputs.map((l) => l.lap_number - view.start);
  const currentIndex = currentLap - view.start;
  const cursor = clamp(X(currentIndex - 1 + fraction), 0, 100);
  const dirtyCount = laps.filter((l) => l.dirty && l.done).length;

  const hovered = hover !== null && hover < n ? laps[hover] : null;
  const hoveredRun = hovered ? run.laps[hovered.lap - 1] : null;
  const missing = noForecastSummary(
    run,
    run.laps.slice(view.start - 1, view.end).filter((l) => l.lap_number <= completed),
    race.total_laps,
  );
  const missingCount = missing.reduce((sum, m) => sum + m.count, 0);
  const note = (() => {
    if (!hovered || !hoveredRun) return "";
    if (!hovered.shown) return "Not raced yet at this point of the replay";
    if (hoveredRun.prediction === null) {
      const reason = noForecast(run, hoveredRun, race.total_laps);
      return `${reason.title}. ${reason.text}`;
    }
    return hovered.dirty ? "Dirty air: gap ahead under 1 s" : "";
  })();
  const delta =
    hovered?.done && hovered.predicted !== null && hovered.time !== null
      ? hovered.time - hovered.predicted
      : null;
  const hoverX = hover === null ? 0 : X(hover);
  const context = { run, grandPrix: stripGrandPrix(race.event_name), year: race.year };

  return (
    <section className="flex min-h-[280px] flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-line bg-panel wide:min-h-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider px-3.5 py-[9px]">
        <span className="text-[13px] font-semibold">Lap times</span>
        <span className="whitespace-nowrap text-[11.5px] text-ink-mute">
          {scopeName} · L{view.start}–{view.end}
        </span>
        <Key line={<span className="h-0.5 w-4 bg-white" />}>Actual</Key>
        <Key line={<span className="w-4 border-t-2 border-dashed border-accent" />}>Predicted</Key>
        <span title="Safety Car / VSC laps are excluded from model input and metrics">
          <Key line={<span className="size-2.5 border-t-2 border-caution bg-caution/35" />}>
            SC/VSC · {neutralisedCount(laps)}
          </Key>
        </span>
        <span title="Gap to the car ahead under 1 s">
          <Key line={<span className="size-1.5 rotate-45 bg-best" />}>Dirty air · {dirtyCount}</Key>
        </span>
        <div className="ml-auto">
          <Segmented<string | number>
            variant="plain"
            value={whole ? "race" : stint.index}
            onChange={(choice) => {
              if (choice === "race") return setScope("race");
              setScope("stint");
              seek(run.cum[run.stints[choice as number].start - 1] + 0.02);
            }}
            options={[
              {
                value: "race",
                title: "Show every lap from the start to the chequered flag",
                label: "Whole race",
              },
              ...run.stints.map((s) => ({
                value: s.index,
                title: `Stint ${s.index + 1} · ${tyreOf(s.compound).name} — zoom to this stint`,
                label: (
                  <>
                    <span
                      className="size-2 rounded-full"
                      style={{ background: tyreOf(s.compound).color }}
                    />
                    {`L${s.start}–${s.end}`}
                  </>
                ),
              })),
            ]}
          />
        </div>
        <div className="flex gap-1.5">
          <Button
            title="Download the lap table as CSV"
            onClick={() => exportLapsCsv(context, completed)}
          >
            ↓ CSV
          </Button>
          <Button
            title="Download this chart as an image"
            onClick={() => exportChartPng(context, chart, scopeName)}
          >
            ↓ PNG
          </Button>
        </div>
      </div>

      {missingCount > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-divider px-3.5 py-2 text-[11.5px]"
          title={`A forecast is only made for a clean lap that follows ${FORECAST_WARMUP_LAPS} clean laps in a row on the same tyres. Hover a lap to see why it has none.`}
        >
          <span className="font-semibold text-ink-soft">
            No forecast on {missingCount} lap{missingCount > 1 ? "s" : ""} because of
          </span>
          {missing.map((m) => (
            <span
              key={m.kind}
              className="whitespace-nowrap rounded-full border border-control bg-raised px-2 py-[2px] text-ink-dim"
            >
              {m.label} <span className="font-bold text-ink-soft">{m.count}</span>
            </span>
          ))}
        </div>
      )}

      <div
        className="relative mb-[30px] ml-[60px] mr-4 mt-3.5 min-h-[130px] flex-1"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 1, 2, 3].map((q) => {
          const value = yMin + ((yMax - yMin) * (q + 0.5)) / 4;
          return (
            <div key={q} className={GRID_LINE} style={{ top: `${Y(value)}%` }}>
              <span className={`${AXIS_LABEL} -left-14 -top-[7px]`}>{fmtLapAxis(value)}</span>
            </div>
          );
        })}

        {windowIdx.length > 0 && (
          <div
            className="absolute inset-y-0 border-x bg-accent/7 border-accent/30"
            style={{
              left: `${X(windowIdx[0]) - step * 0.4}%`,
              width: `${X(windowIdx[windowIdx.length - 1]) - X(windowIdx[0]) + step * 0.8}%`,
            }}
          />
        )}

        {laps.map((l, j) =>
          l.shown && isNeutralised(l.flag) ? (
            <div
              key={`ev${l.lap}`}
              className="absolute inset-y-0"
              style={{
                left: `${X(j) - step / 2}%`,
                width: `${step}%`,
                background: `color-mix(in srgb, ${EVENT[l.flag].color} 16%, transparent)`,
              }}
            >
              {(j === 0 || laps[j - 1].flag !== l.flag) && (
                <span
                  className="absolute bottom-[3px] left-[3px] text-[9.5px] font-bold tracking-[.04em]"
                  style={{ color: EVENT[l.flag].color }}
                >
                  {l.flag}
                </span>
              )}
            </div>
          ) : null,
        )}

        {whole &&
          run.stints.slice(1).map((s) => (
            <div
              key={`pit${s.index}`}
              className="absolute inset-y-0 border-l border-caution"
              style={{ left: `${X(s.start - 1.5)}%` }}
            >
              <span className="absolute left-1 top-0.5 whitespace-nowrap text-[10px] font-bold text-caution">
                PIT · L{s.start - 1}
              </span>
            </div>
          ))}
        {!whole && stint.index > 0 && (
          <div className="absolute inset-y-0 left-0 border-l border-caution">
            <span className="absolute left-1 top-0.5 whitespace-nowrap text-[10px] font-bold text-caution">
              PIT · L{stint.start - 1}
            </span>
          </div>
        )}
        {!whole && stint.index < run.stints.length - 1 && (
          <div className="absolute inset-y-0 right-0 border-l border-caution">
            <span className="absolute -left-[84px] top-0.5 whitespace-nowrap text-[10px] font-bold text-caution">
              PIT → L{stint.end + 1}
            </span>
          </div>
        )}

        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <path
            d={predicted}
            style={{
              fill: "none",
              stroke: "var(--color-accent)",
              strokeWidth: 2,
              strokeDasharray: "6 5",
              vectorEffect: "non-scaling-stroke",
            }}
          />
          <path
            d={actual}
            style={{
              fill: "none",
              stroke: "#ffffff",
              strokeWidth: 2.2,
              strokeLinejoin: "round",
              vectorEffect: "non-scaling-stroke",
            }}
          />
        </svg>

        {laps.map((l, j) =>
          l.dirty && l.done ? (
            <div
              key={`dirty${l.lap}`}
              className="pointer-events-none absolute -bottom-[3px] -ml-[3px] size-1.5 rotate-45 bg-best"
              style={{ left: `${X(j)}%` }}
            />
          ) : null,
        )}
        {laps.map((l, j) =>
          l.done && (l.flag || (l.clean && l.time !== null)) ? (
            <div
              key={`act${l.lap}`}
              className="absolute -ml-[3px] -mt-[3px] size-1.5 rounded-full"
              style={{
                left: `${X(j)}%`,
                top: `${l.flag ? 2 : Y(l.time ?? yMin)}%`,
                background: l.flag ? "var(--color-caution)" : "#fff",
              }}
            />
          ) : null,
        )}
        {laps.map((l, j) => {
          if (l.predicted === null || !l.shown) return null;
          const current = l.lap === currentLap && !done;
          return (
            <div
              key={`pred${l.lap}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-panel"
              style={{
                left: `${X(j)}%`,
                top: `${Y(l.predicted)}%`,
                width: current ? 14 : 7,
                height: current ? 14 : 7,
                boxShadow: current
                  ? "0 0 14px color-mix(in srgb, var(--color-accent) 80%, transparent)"
                  : "none",
              }}
            />
          );
        })}

        <div
          className="pointer-events-none absolute -top-1.5 bottom-0 border-l-2 border-accent"
          style={{ left: `${cursor}%` }}
        >
          <span className="absolute left-1 -top-0.5 whitespace-nowrap text-[10px] font-bold text-accent">
            NOW
          </span>
        </div>

        {laps.map((l, j) =>
          j === 0 || j === n - 1 || l.lap % 5 === 0 ? (
            <span
              key={`x${l.lap}`}
              className={`${AXIS_LABEL} -bottom-5 -translate-x-1/2`}
              style={{ left: `${X(j)}%` }}
            >
              L{l.lap}
            </span>
          ) : null,
        )}

        <div
          className="absolute bottom-0 top-0 z-[3] flex"
          style={{
            left: `${-(50 / Math.max(1, n - 1))}%`,
            right: `${-(50 / Math.max(1, n - 1))}%`,
          }}
        >
          {laps.map((l, j) => (
            <div key={l.lap} className="h-full flex-1" onMouseEnter={() => setHover(j)} />
          ))}
        </div>

        {hovered && hoveredRun && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[4] border-l border-white/35"
            style={{ left: `${hoverX}%` }}
          >
            <div
              className="absolute left-0 top-1 w-[216px] rounded-[10px] border border-popover bg-tooltip px-3 py-2.5 text-[12px] shadow-[0_12px_30px_rgba(0,0,0,.5)]"
              style={{
                transform: `translateX(${hoverX > 70 ? "calc(-100% - 8px)" : hoverX < 30 ? "8px" : "-50%"})`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">Lap {hovered.lap}</span>
                <span className="flex items-center gap-[5px] text-[11px] text-ink-dim">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: tyreOf(hoveredRun.compound).color }}
                  />
                  {tyreOf(hoveredRun.compound).name} · {hoveredRun.tyre_life ?? "–"} laps
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11.5px]">
                <span className="text-ink-mute">Actual</span>
                <span className="text-right">{hovered.done ? fmtLap(hovered.time) : "—"}</span>
                <span className="text-ink-mute">Predicted</span>
                <span className="text-right text-accent">
                  {hovered.predicted !== null && hovered.shown ? fmtLap(hovered.predicted) : "—"}
                </span>
                <span className="text-ink-mute">Delta</span>
                <span
                  className="text-right"
                  style={{
                    color:
                      delta === null
                        ? "var(--color-ink-dim)"
                        : delta < 0
                          ? "var(--color-go)"
                          : "var(--color-stop)",
                  }}
                >
                  {delta === null ? "—" : `${fmtSigned(delta)} s`}
                </span>
                <span className="text-ink-mute">Position</span>
                <span className="text-right">
                  {hovered.done && hoveredRun.position !== null
                    ? `P${hoveredRun.position}${hoveredRun.gap_ahead_sec !== null ? ` · +${hoveredRun.gap_ahead_sec.toFixed(2)}` : ""}`
                    : "—"}
                </span>
              </div>
              {note && (
                <div className="mt-2 border-t border-control pt-2 text-[11px] leading-[1.4] text-ink-dim">
                  {note}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
