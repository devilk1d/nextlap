"use client";

import { useState } from "react";
import { LineChart, type Band, type Series } from "@/components/charts/LineChart";
import { Plot } from "@/components/charts/Plot";
import { Select } from "@/components/ui/Select";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { EVENT } from "@/lib/race/constants";
import type { EventBand } from "@/lib/race/events";
import type { Run, RunLap, Timeline } from "@/lib/race/timeline";
import { quantileSorted } from "@/lib/stats";
import type { DriverRow } from "./analysis";
import { formatMetric, LAP_METRICS, METRIC_GROUPS } from "./metrics";

type Common = {
  timeline: Timeline;
  rows: DriverRow[];
  selected: string[];
  bands: Band[];
};

export const toBands = (bands: EventBand[]): Band[] =>
  bands.map((band) => ({
    from: band.from,
    to: band.to,
    background: `color-mix(in srgb, ${EVENT[band.kind].color} ${band.kind === "YEL" ? 7 : 12}%, transparent)`,
    label: band.kind === "YEL" ? "Y" : band.kind,
    color: EVENT[band.kind].color,
  }));

/** Teammates in the selection are drawn dashed so they can be told apart. */
const dashFor = (codes: string[], run: Run, rows: DriverRow[]) => {
  const earlier = codes.slice(0, codes.indexOf(run.driver_code));
  return earlier.some((code) => rows.find((r) => r.run.driver_code === code)?.run.team === run.team)
    ? "5 4"
    : undefined;
};

function series(
  { rows, selected, timeline }: Common,
  pick: (run: Run, lap: number) => number | null,
): Series[] {
  return selected
    .map((code) => rows.find((row) => row.run.driver_code === code)?.run)
    .filter((run): run is Run => run !== undefined)
    .map((run) => ({
      key: run.driver_code,
      label: run.driver_code,
      color: run.color,
      dash: dashFor(selected, run, rows),
      width: 2.2,
      points: Array.from({ length: timeline.totalLaps }, (_, i) => ({
        x: i + 1,
        y: pick(run, i + 1),
      })),
    }));
}

export function PositionChart(props: Common) {
  const { timeline, rows, selected, bands } = props;
  const backdrop: Series[] = rows
    .filter((row) => !selected.includes(row.run.driver_code))
    .map((row) => ({
      key: `bg${row.run.driver_code}`,
      color: "#3a3a42",
      width: 1,
      opacity: 0.7,
      points: Array.from({ length: timeline.totalLaps }, (_, i) => ({
        x: i + 1,
        y: row.run.laps[i]?.position ?? null,
      })),
    }));
  return (
    <LineChart
      series={[...backdrop, ...series(props, (run, lap) => run.laps[lap - 1]?.position ?? null)]}
      xMin={1}
      xMax={timeline.totalLaps}
      yMin={0.5}
      yMax={rows.length + 0.5}
      invert
      height={260}
      yFormat={(v) => `P${v}`}
      yTicks={[1, 5, 10, 15, 20].filter((v) => v <= rows.length)}
      bands={bands}
    />
  );
}

export function GapToLeaderChart(props: Common) {
  const { timeline, bands } = props;
  const leaderTime = (lap: number) =>
    Math.min(...timeline.runs.filter((run) => run.cum.length > lap).map((run) => run.cum[lap]));
  const data = series(props, (run, lap) =>
    run.cum.length > lap ? run.cum[lap] - leaderTime(lap) : null,
  );
  const peak = Math.max(5, ...data.flatMap((s) => s.points.map((p) => p.y ?? 0)));
  return (
    <LineChart
      series={data}
      xMin={1}
      xMax={timeline.totalLaps}
      yMin={0}
      yMax={peak * 1.05}
      invert
      height={260}
      yFormat={(v) => `+${v.toFixed(0)}s`}
      tipFormat={(v) => (v < 0.0005 ? "Leader" : `+${v.toFixed(3)} s`)}
      bands={bands}
    />
  );
}

export function MetricExplorer(props: Common) {
  const { timeline, bands } = props;
  const [key, setKey] = useState("lap_time");
  const [includeAll, setIncludeAll] = useState(false);
  const metric = LAP_METRICS.find((m) => m.key === key) ?? LAP_METRICS[0];
  const racingOnly = metric.racingOnly && !includeAll;

  const read = (lap: RunLap | undefined) => {
    if (!lap || (racingOnly && !lap.clean)) return null;
    const value = metric.value(lap);
    return value == null || !Number.isFinite(value) ? null : value;
  };
  const data = series(props, (run, lap) => read(run.laps[lap - 1]));
  const values = data
    .flatMap((s) => s.points.map((p) => p.y))
    .filter((v): v is number => v !== null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = (hi - lo) * 0.08 || 1;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <Select
          value={key}
          onChange={setKey}
          maxWidth={260}
          options={METRIC_GROUPS.flatMap((group) =>
            LAP_METRICS.filter((m) => m.group === group).map((m) => ({
              value: m.key,
              label: m.label + (m.unit ? ` (${m.unit})` : ""),
              group,
            })),
          )}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-ink-dim">
          <input
            type="checkbox"
            checked={includeAll}
            onChange={() => setIncludeAll((value) => !value)}
            className="accent-accent"
          />
          Include pit / start / flag laps
        </label>
      </div>
      <LineChart
        series={data}
        xMin={1}
        xMax={timeline.totalLaps}
        yMin={lo - pad}
        yMax={hi + pad}
        invert={metric.key === "position"}
        height={250}
        yFormat={metric.axis ?? ((v) => v.toFixed(Math.max(0, metric.digits - 1)))}
        tipFormat={(v) => formatMetric(metric, v)}
        bands={bands}
      />
    </div>
  );
}

export function LapTimeBoxPlot({ rows }: { rows: DriverRow[] }) {
  const boxes = rows
    .filter((row) => row.times.length >= 3)
    .map((row) => {
      const sorted = [...row.times].sort((a, b) => a - b);
      const q1 = quantileSorted(sorted, 0.25) as number;
      const q3 = quantileSorted(sorted, 0.75) as number;
      const iqr = q3 - q1;
      return {
        row,
        q1,
        q3,
        median: quantileSorted(sorted, 0.5) as number,
        low: Math.max(sorted[0], q1 - 1.5 * iqr),
        high: Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr),
        n: sorted.length,
      };
    })
    .sort((a, b) => a.median - b.median);
  if (!boxes.length) return null;
  const yMin = Math.min(...boxes.map((b) => b.low)) - 0.1;
  const yMax = Math.max(...boxes.map((b) => b.high)) + 0.1;

  return (
    <Plot
      height={240}
      yMin={yMin}
      yMax={yMax}
      yFormat={fmtLapAxis}
      className="mb-7 ml-[52px] mr-1 mt-1.5"
    >
      {(toY) => (
        <div className="absolute inset-0 flex">
          {boxes.map((box) => (
            <div
              key={box.row.run.driver_code}
              title={`${box.row.run.driver_code} · median ${fmtLap(box.median)} · IQR ${fmtLap(box.q1)}–${fmtLap(box.q3)} · ${box.n} clean laps`}
              className="relative flex-1"
            >
              <div
                className="absolute left-1/2 border-l border-[#6a6a74]"
                style={{ top: `${toY(box.high)}%`, bottom: `${100 - toY(box.low)}%` }}
              />
              <div
                className="absolute inset-x-[20%] rounded-[3px] border"
                style={{
                  top: `${toY(box.q3)}%`,
                  bottom: `${100 - toY(box.q1)}%`,
                  borderColor: box.row.run.color,
                  background: `color-mix(in srgb, ${box.row.run.color} 35%, transparent)`,
                }}
              />
              <div
                className="absolute inset-x-[16%] border-t-2 border-white"
                style={{ top: `${toY(box.median)}%` }}
              />
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 -rotate-45 text-[9.5px] font-bold text-ink-dim">
                {box.row.run.driver_code}
              </span>
            </div>
          ))}
        </div>
      )}
    </Plot>
  );
}

export function WeatherCharts({ timeline, rows, bands }: Common) {
  const winner = rows[0]?.run ?? timeline.runs[0];
  const chart = (
    title: string,
    defs: { key: string; label: string; color: string; pick: (l: RunLap) => number | null }[],
    digits: number,
  ) => {
    const data: Series[] = defs.map((def) => ({
      key: def.key,
      label: def.label,
      color: def.color,
      points: winner.laps.map((lap) => ({ x: lap.lap_number, y: def.pick(lap) })),
    }));
    const values = data
      .flatMap((s) => s.points.map((p) => p.y))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.15 || 1;
    return (
      <div key={title} className="min-w-0">
        <div className="mb-0.5 text-[11.5px] text-ink-dim">{title}</div>
        <LineChart
          series={data}
          xMin={1}
          xMax={timeline.totalLaps}
          yMin={lo - pad}
          yMax={hi + pad}
          height={120}
          yFormat={(v) => v.toFixed(digits)}
          bands={bands}
        />
      </div>
    );
  };
  return (
    <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
      {chart(
        "Temperature · °C",
        [
          { key: "track", label: "Track", color: "var(--color-accent)", pick: (l) => l.track_temp },
          { key: "air", label: "Air", color: "#7fb8ff", pick: (l) => l.air_temp },
        ],
        0,
      )}
      {chart(
        "Humidity · %",
        [{ key: "hum", label: "Humidity", color: "#7fb8ff", pick: (l) => l.humidity }],
        0,
      )}
      {chart(
        "Pressure · hPa",
        [{ key: "pres", label: "Pressure", color: "#c9c9cf", pick: (l) => l.pressure }],
        1,
      )}
      {chart(
        "Wind speed · m/s",
        [{ key: "wind", label: "Wind", color: "#c9c9cf", pick: (l) => l.wind_speed }],
        1,
      )}
    </div>
  );
}
