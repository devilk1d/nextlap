import type { ReactNode } from "react";
import { SECTOR_COLORS } from "@/lib/race/constants";
import { spans } from "@/lib/stats";
import {
  closedPath,
  pointAt,
  segmentPath,
  tangentAt,
  trackPath,
  trackView,
  type TrackGeometry,
  type TrackPath,
} from "@/lib/race/track";

type Props = {
  geometry: TrackGeometry;
  /** Share of the lap covered by sectors 1–3. */
  sectors: readonly number[];
  colors?: readonly string[];
  labels?: readonly string[];
  /** Drawn inside the same SVG (car markers); receives the marker scale and the outline. */
  children?: (scale: number, path: TrackPath) => ReactNode;
};

const FIGURE = {
  fill: "none",
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

/** Circuit outline split into three coloured sectors, with start/finish line and compass. */
export function TrackMap({ geometry, sectors, colors = SECTOR_COLORS, labels, children }: Props) {
  const path = trackPath(geometry);
  const { viewBox, scale: k, rotation } = trackView(geometry);

  const parts = spans(sectors).map(({ start, end }, index) => {
    const share = end - start;
    const [mx, my] = pointAt(path, start + share / 2);
    const [, , nx, ny] = tangentAt(path, start + share / 2);
    const [bx, by] = pointAt(path, start);
    const [, , bnx, bny] = tangentAt(path, start);
    return {
      index,
      start,
      share,
      label: { x: mx + nx * 6 * k, y: my + ny * 6 * k + 1.3 * k },
      tick: { bx, by, bnx, bny },
    };
  });

  const [sx, sy] = pointAt(path, 0);
  const [, , nx, ny] = tangentAt(path, 0.0001);
  const [ax, ay] = pointAt(path, 0.022);
  const [atx, aty, anx, any] = tangentAt(path, 0.022);
  const arrow = 2.2 * k;

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path
          d={closedPath(path)}
          style={{
            ...FIGURE,
            stroke: "color-mix(in srgb, var(--color-accent) 13%, transparent)",
            strokeWidth: 20,
          }}
        />
        <path d={closedPath(path)} style={{ ...FIGURE, stroke: "#2e2e35", strokeWidth: 10 }} />
        {parts.map(({ index, start, share }) => (
          <path
            key={index}
            d={segmentPath(path, start, start + share)}
            style={{ ...FIGURE, stroke: colors[index], strokeWidth: 4, opacity: 0.92 }}
          />
        ))}
        {parts.slice(1).map(({ index, tick }) => (
          <line
            key={`tick${index}`}
            x1={tick.bx - tick.bnx * 3 * k}
            y1={tick.by - tick.bny * 3 * k}
            x2={tick.bx + tick.bnx * 3 * k}
            y2={tick.by + tick.bny * 3 * k}
            style={{
              stroke: "var(--color-ink)",
              strokeWidth: 2,
              vectorEffect: "non-scaling-stroke",
            }}
          />
        ))}
        {[
          { stroke: "#ffffff", dash: undefined },
          { stroke: "#111", dash: "3 3" },
        ].map((line) => (
          <line
            key={line.stroke}
            x1={sx - nx * 3.4 * k}
            y1={sy - ny * 3.4 * k}
            x2={sx + nx * 3.4 * k}
            y2={sy + ny * 3.4 * k}
            style={{
              stroke: line.stroke,
              strokeWidth: 4,
              strokeDasharray: line.dash,
              vectorEffect: "non-scaling-stroke",
            }}
          />
        ))}
        <path
          fill="#ffffff"
          d={`M${ax + atx * arrow},${ay + aty * arrow}L${ax - atx * arrow * 0.6 + anx * arrow * 0.8},${ay - aty * arrow * 0.6 + any * arrow * 0.8}L${ax - atx * arrow * 0.6 - anx * arrow * 0.8},${ay - aty * arrow * 0.6 - any * arrow * 0.8}Z`}
        />
        {parts.map(({ index, label }) => (
          <text
            key={`label${index}`}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            fontSize={3.6 * k}
            fontWeight={700}
            fill={colors[index]}
            stroke="#141416"
            strokeWidth={2}
            paintOrder="stroke"
            style={{
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              vectorEffect: "non-scaling-stroke",
            }}
          >
            {labels?.[index] ?? `S${index + 1}`}
          </text>
        ))}
        {children?.(k, path)}
      </svg>

      <div
        title="North"
        className="absolute bottom-0 right-0 grid size-[34px] place-items-center rounded-lg border border-overlay bg-[rgba(22,22,25,.92)]"
      >
        <svg
          viewBox="-10 -10 20 20"
          width={24}
          height={24}
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <path d="M0,-3L3.2,6L0,4L-3.2,6Z" fill="var(--color-accent)" />
          <text
            x={0}
            y={-4.5}
            textAnchor="middle"
            fontSize={6}
            fontWeight={700}
            fill="var(--color-ink)"
          >
            N
          </text>
        </svg>
      </div>
    </div>
  );
}
