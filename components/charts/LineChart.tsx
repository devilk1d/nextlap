"use client";

import { useState } from "react";
import { clamp, niceTicks, percentOf } from "@/lib/stats";
import { Plot } from "./Plot";

export type Series = {
  key: string;
  color: string;
  /** Tooltip label; series without one are drawn but not listed. */
  label?: string;
  width?: number;
  dash?: string;
  opacity?: number;
  /** y is null where the series has no value (the line breaks). */
  points: { x: number; y: number | null }[];
};

export type Band = { from: number; to: number; background: string; label?: string; color?: string };

type Props = {
  series: Series[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  height: number;
  yFormat: (value: number) => string;
  /** Formatter for tooltip values; defaults to `yFormat`. */
  tipFormat?: (value: number) => string;
  yTicks?: number[];
  invert?: boolean;
  bands?: Band[];
};

/** Multi-series line chart over laps with bands and a crosshair tooltip. */
export function LineChart({
  series,
  xMin,
  xMax,
  yMin,
  yMax,
  height,
  yFormat,
  tipFormat = yFormat,
  yTicks,
  invert,
  bands = [],
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const toX = (x: number) => percentOf(x, xMin, xMax);

  const rows =
    hover === null
      ? []
      : series
          .filter((s) => s.label)
          .map((s) => ({ s, value: s.points.find((p) => p.x === hover)?.y ?? null }))
          .filter(
            (r): r is { s: Series; value: number } => r.value !== null && Number.isFinite(r.value),
          )
          .sort((a, b) => (invert ? a.value - b.value : b.value - a.value));
  const hoverLeft = hover === null ? 0 : toX(hover);

  return (
    <Plot height={height} yMin={yMin} yMax={yMax} yFormat={yFormat} ticks={yTicks} invert={invert}>
      {(toY) => (
        <div
          className="absolute inset-0"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            const x = Math.round(xMin + fraction * (xMax - xMin));
            if (x !== hover) setHover(x);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {bands.map((band, i) => (
            <div
              key={i}
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `${toX(band.from - 0.5)}%`,
                width: `${toX(band.to + 0.5) - toX(band.from - 0.5)}%`,
                background: band.background,
              }}
            >
              {band.label && (
                <span
                  className="absolute bottom-0.5 left-[3px] text-[9.5px] font-bold"
                  style={{ color: band.color }}
                >
                  {band.label}
                </span>
              )}
            </div>
          ))}
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {series.map((s) => {
              let d = "";
              let pen = false;
              for (const p of s.points) {
                if (p.y === null || !Number.isFinite(p.y)) {
                  pen = false;
                  continue;
                }
                d += `${pen ? "L" : "M"}${(toX(p.x) * 10).toFixed(1)},${(toY(p.y) * 10).toFixed(1)}`;
                pen = true;
              }
              return (
                <path
                  key={s.key}
                  d={d}
                  style={{
                    fill: "none",
                    stroke: s.color,
                    strokeWidth: s.width ?? 2,
                    strokeDasharray: s.dash ?? "none",
                    opacity: s.opacity ?? 1,
                    strokeLinejoin: "round",
                    vectorEffect: "non-scaling-stroke",
                  }}
                />
              );
            })}
          </svg>
          {niceTicks(xMin, xMax, 6)
            .filter((v) => Number.isInteger(v) && v >= xMin && v <= xMax)
            .map((v) => (
              <span
                key={v}
                className="absolute -bottom-[19px] -translate-x-1/2 font-mono text-[10.5px] text-ink-mute"
                style={{ left: `${toX(v)}%` }}
              >
                L{v}
              </span>
            ))}
          {hover !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-[4] border-l border-white/35"
              style={{ left: `${hoverLeft}%` }}
            >
              <div
                className="absolute left-0 top-1 min-w-[150px] rounded-[10px] border border-popover bg-tooltip px-2.5 py-2 text-[11.5px] shadow-[0_10px_30px_rgba(0,0,0,.45)]"
                style={{
                  transform: hoverLeft > 65 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
                }}
              >
                <div className="mb-1 font-bold">Lap {hover}</div>
                {rows.slice(0, 12).map(({ s, value }) => (
                  <div key={s.key} className="flex items-center gap-1.5 leading-[1.7]">
                    <span
                      className="w-3 border-t-2"
                      style={{ borderStyle: s.dash ? "dashed" : "solid", borderColor: s.color }}
                    />
                    <span className="font-semibold">{s.label}</span>
                    <span className="ml-auto pl-2.5 font-mono">{tipFormat(value)}</span>
                  </div>
                ))}
                {!rows.length && <div className="text-ink-mute">No data on this lap</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </Plot>
  );
}
