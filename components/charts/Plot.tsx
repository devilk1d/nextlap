import type { ReactNode } from "react";
import { niceTicks, percentOf } from "@/lib/stats";

type Props = {
  /** Fixed height in px; leave out and size it through `className` (e.g. `flex-1`) to fill a card. */
  height?: number;
  yMin: number;
  yMax: number;
  yFormat: (value: number) => string;
  ticks?: number[];
  /** Larger values towards the bottom (positions, gaps). */
  invert?: boolean;
  /** Tailwind margin utilities; the left margin leaves room for the y labels. */
  className?: string;
  /** Receives `toY`: value → percentage from the top of the plot. */
  children: (toY: (value: number) => number) => ReactNode;
};

/** Plot area with dashed horizontal grid lines and y-axis labels in the left margin. */
export function Plot({
  height,
  yMin,
  yMax,
  yFormat,
  ticks,
  invert,
  className = "mx-2 mb-6 mt-1.5 ml-[52px]",
  children,
}: Props) {
  const toY = (value: number) => {
    const share = percentOf(value, yMin, yMax);
    return invert ? share : 100 - share;
  };
  const lines = (ticks ?? niceTicks(yMin, yMax, 4)).filter(
    (v) => v >= Math.min(yMin, yMax) - 1e-9 && v <= Math.max(yMin, yMax) + 1e-9,
  );
  return (
    <div className={`relative ${className}`} style={height === undefined ? undefined : { height }}>
      {lines.map((value) => (
        <div
          key={value}
          className="absolute inset-x-0 border-t border-dashed border-hairline"
          style={{ top: `${toY(value)}%` }}
        >
          <span className="absolute -left-[50px] -top-[7px] w-11 text-right font-mono text-[10.5px] text-ink-mute">
            {yFormat(value)}
          </span>
        </div>
      ))}
      {children(toY)}
    </div>
  );
}
