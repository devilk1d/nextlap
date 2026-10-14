"use client";

import { memo } from "react";
import { closedPath, trackPath, trackView, type TrackGeometry } from "@/lib/race/track";

const LAYERS = 6;

type Props = {
  name: string;
  sub: string;
  geometry: TrackGeometry | null;
  active: boolean;
  disabled?: boolean;
  onPick: () => void;
};

/** One circuit of the picker: the outline lifts into a spinning 3D slab on hover (CSS only). */
function CircuitCardBase({ name, sub, geometry, active, disabled, onPick }: Props) {
  const view = geometry ? trackView(geometry) : null;
  const d = geometry ? closedPath(trackPath(geometry)) : "";
  return (
    <button
      type="button"
      disabled={disabled}
      data-on={active}
      onClick={onPick}
      className="c3d-card"
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        textAlign: "center",
        padding: "8px 6px 7px",
        borderRadius: 10,
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-line)"}`,
        background: active
          ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-panel))"
          : "var(--color-panel)",
        color: "var(--color-ink)",
        minWidth: 0,
      }}
    >
      <div className="c3d-scene" style={{ height: 54 }}>
        <div className="c3d-stack" style={{ width: 54, height: 54, margin: "0 auto" }}>
          {view &&
            Array.from({ length: LAYERS }, (_, i) => (
              <svg
                key={i}
                className={i === 0 ? "c3d-layer" : "c3d-layer c3d-extra"}
                viewBox={view.viewBox}
                width={54}
                height={54}
                style={{ ["--i" as string]: LAYERS - 1 - i }}
              >
                <path
                  d={d}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeWidth={i === 0 ? 4 : 4.4}
                  stroke={i === 0 ? (active ? "#ff6b1f" : "#b9b9c2") : "#6a3414"}
                />
              </svg>
            ))}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 2,
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-ink-mute)" }}>{sub}</div>
    </button>
  );
}

export const CircuitCard = memo(CircuitCardBase);
