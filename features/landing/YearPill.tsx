"use client";

import { useState, type ReactNode } from "react";
import type { RaceInfo } from "@/server/races/types";

type Kind = "ok" | "wet" | "unmodelled" | "none";

type Props = {
  year: number;
  /** The race of this circuit in `year`, if there was one. */
  race: RaceInfo | undefined;
  circuit: string;
  /** Seasons in which this circuit has a race with a forecast. */
  dryYears: number[];
  /** First and last season in the dataset at which this circuit hosts a race. */
  span: [number, number] | null;
  active: boolean;
  onPick: () => void;
};

const OVERLAY = "rgba(13,13,15,.72)";

const KIND: Record<Exclude<Kind, "ok">, { color: string; tint: string; label: string }> = {
  wet: { color: "#4a9bf0", tint: "rgba(74,155,240,.16)", label: "WET RACE" },
  unmodelled: { color: "#f5c518", tint: "rgba(245,197,24,.15)", label: "NOT MODELLED" },
  none: { color: "#9a9aa3", tint: "rgba(154,154,163,.14)", label: "NO RACE" },
};

function kindOf(race: RaceInfo | undefined): Kind {
  if (!race) return "none";
  if (race.predictable) return "ok";
  return race.exclusion_reason === "wet" ? "wet" : "unmodelled";
}

function Icon({ kind, color }: { kind: Exclude<Kind, "ok">; color: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "wet") {
    return (
      <svg {...common}>
        <path d="M12 3.5C12 3.5 5.5 10.6 5.5 14.7a6.5 6.5 0 0 0 13 0C18.5 10.6 12 3.5 12 3.5Z" />
        <path d="M9.2 15.2a2.9 2.9 0 0 0 2.6 2.4" />
      </svg>
    );
  }
  if (kind === "none") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4M9.5 13.5l5 5M14.5 13.5l-5 5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.1" />
    </svg>
  );
}

function explain(
  kind: Exclude<Kind, "ok">,
  { year, race, circuit, span }: Pick<Props, "year" | "race" | "circuit" | "span">,
): { title: string; body: string } {
  if (kind === "wet") {
    return {
      title: `${race?.event_name ?? circuit} ${year}`,
      body: "Rain or wet tyres. The model is trained on dry running only, so this race has no forecast.",
    };
  }
  if (kind === "unmodelled") {
    return {
      title: `${race?.event_name ?? circuit} ${year}`,
      body: "This race is outside the model output, so no forecast is available for it.",
    };
  }
  const [first, last] = span ?? [year, year];
  const body =
    year < first
      ? `${circuit} first appears in ${first}.`
      : year > last
        ? `The last race at ${circuit} is ${last}.`
        : `${circuit} was not on the ${year} calendar.`;
  return { title: `No race in ${year}`, body };
}

/** A season button; the unavailable ones carry their own hover card that says why. */
export function YearPill({ year, race, circuit, dryYears, span, active, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(race);
  // Seasons without a forecast can only be hovered: wet and not-modelled races as well as gaps.
  const blocked = kind !== "ok";
  const hatched = kind === "none";
  const info = kind === "ok" ? null : KIND[kind];
  const text = kind === "ok" ? null : explain(kind, { year, race, circuit, span });

  let background: string = active ? "var(--color-accent)" : OVERLAY;
  if (hatched) {
    background =
      "repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 5px, transparent 5px 10px), " +
      OVERLAY;
  }

  const badge: ReactNode =
    kind === "wet" ? (
      <span style={{ marginLeft: 6, display: "inline-flex", verticalAlign: "-2px" }}>
        <Icon kind="wet" color={active ? "#fff" : "#4a9bf0"} />
      </span>
    ) : kind === "unmodelled" ? (
      <span
        style={{
          marginLeft: 7,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "#f5c518",
          display: "inline-block",
          verticalAlign: "1px",
        }}
      />
    ) : null;

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-disabled={blocked}
        aria-describedby={text ? `year-${year}-why` : undefined}
        onClick={() => {
          if (!blocked) onPick();
        }}
        className="rounded-lg text-[14px] font-bold"
        style={{
          padding: "8px 14px",
          cursor: blocked ? "not-allowed" : "pointer",
          border: `1px ${hatched ? "dashed" : "solid"} ${
            active
              ? "var(--color-accent)"
              : info
                ? `color-mix(in srgb, ${info.color} 55%, var(--color-control))`
                : "var(--color-control)"
          }`,
          background,
          color: active ? "#fff" : kind === "ok" ? "var(--color-ink)" : "var(--color-ink-mute)",
          opacity: hatched ? 0.75 : blocked ? 0.88 : 1,
        }}
      >
        {year}
        {badge}
      </button>

      {text && info && (
        <span
          id={`year-${year}-why`}
          role="tooltip"
          style={{
            position: "absolute",
            left: 0,
            bottom: "calc(100% + 10px)",
            width: 256,
            padding: "10px 12px 11px",
            borderRadius: 10,
            border: "1px solid var(--color-popover)",
            background: "var(--color-tooltip)",
            boxShadow: "0 14px 34px rgba(0,0,0,.55)",
            pointerEvents: "none",
            zIndex: 20,
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(4px)",
            transition: "opacity .14s ease, transform .14s ease",
            textAlign: "left",
            fontWeight: 400,
            whiteSpace: "normal",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: info.tint,
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <Icon kind={kind as Exclude<Kind, "ok">} color={info.color} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  color: info.color,
                }}
              >
                {info.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-ink)",
                  lineHeight: 1.25,
                }}
              >
                {text.title}
              </span>
            </span>
          </span>
          <span
            style={{
              display: "block",
              marginTop: 8,
              fontSize: 12,
              lineHeight: 1.45,
              color: "var(--color-ink-dim)",
            }}
          >
            {text.body}
          </span>
          {dryYears.length > 0 && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 9,
                paddingTop: 8,
                borderTop: "1px solid var(--color-divider)",
                fontSize: 11.5,
                color: "var(--color-ink-mute)",
              }}
            >
              With forecast:
              {dryYears.map((y) => (
                <span
                  key={y}
                  style={{
                    padding: "1px 7px",
                    borderRadius: 5,
                    background: "var(--color-raised)",
                    color: "var(--color-ink-soft)",
                    fontWeight: 600,
                  }}
                >
                  {y}
                </span>
              ))}
            </span>
          )}
          <span
            style={{
              position: "absolute",
              left: 22,
              bottom: -5,
              width: 10,
              height: 10,
              background: "var(--color-tooltip)",
              borderRight: "1px solid var(--color-popover)",
              borderBottom: "1px solid var(--color-popover)",
              transform: "rotate(45deg)",
            }}
          />
        </span>
      )}
    </span>
  );
}
