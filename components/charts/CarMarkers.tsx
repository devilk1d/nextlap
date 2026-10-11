import { pointAt, type TrackPath } from "@/lib/race/track";
import type { Standing } from "@/lib/race/timeline";

export type MarkerHighlight = {
  /** Outline of the dot; defaults to white. */
  ring?: string;
  /** Colour of the soft halo behind the dot. */
  glow?: string;
};

type Props = {
  standings: Standing[];
  path: TrackPath;
  scale: number;
  highlight: Record<string, MarkerHighlight>;
  showLabels?: boolean;
};

const LABEL_FONT = { fontFamily: "var(--font-barlow), sans-serif" };

/** Car dots on the track outline; highlighted drivers get a halo and a position label. */
export function CarMarkers({ standings, path, scale: k, highlight, showLabels = true }: Props) {
  const racing = standings.filter((s) => !s.retired);
  const position = (s: Standing) => pointAt(path, s.done ? 0 : s.fraction);

  return (
    <>
      {[...racing]
        .reverse()
        .filter((s) => !highlight[s.run.driver_code])
        .map((s) => {
          const [x, y] = position(s);
          return (
            <g key={s.run.driver_code}>
              <circle
                cx={x}
                cy={y}
                r={1.8 * k}
                fill={s.run.color}
                stroke="#0d0d0f"
                strokeWidth={0.6 * k}
              />
              {showLabels && (
                <text
                  x={x + 2.4 * k}
                  y={y + 1.1 * k}
                  fontSize={3 * k}
                  fontWeight={600}
                  fill="#c9c9cf"
                  stroke="#0d0d0f"
                  strokeWidth={0.6 * k}
                  paintOrder="stroke"
                  style={LABEL_FONT}
                >
                  {s.run.driver_code}
                </text>
              )}
            </g>
          );
        })}
      {racing
        .filter((s) => highlight[s.run.driver_code])
        .map((s) => {
          const [x, y] = position(s);
          const { ring = "#ffffff", glow = s.run.color } = highlight[s.run.driver_code];
          return (
            <g key={s.run.driver_code}>
              <circle cx={x} cy={y} r={4.4 * k} style={{ fill: glow, fillOpacity: 0.22 }} />
              <circle
                cx={x}
                cy={y}
                r={2.5 * k}
                fill={s.run.color}
                stroke={ring}
                strokeWidth={0.9 * k}
              />
              <text
                x={x + 3.6 * k}
                y={y + 1.3 * k}
                fontSize={3.8 * k}
                fontWeight={700}
                fill="#fff"
                stroke="#0d0d0f"
                strokeWidth={0.9 * k}
                paintOrder="stroke"
                style={LABEL_FONT}
              >
                {`P${s.position} ${s.run.driver_code}`}
              </text>
            </g>
          );
        })}
    </>
  );
}
