"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRaceSummary } from "@/lib/api";
import { fmtLap, stripGrandPrix } from "@/lib/format";
import {
  HEIGHT_SCALE,
  loadElevation,
  traceFor,
  type ElevationData,
  type ElevationTrace,
} from "@/lib/race/elevation";
import { closedPath, geometryFor, trackPath, trackView } from "@/lib/race/track";
import type { RaceInfo } from "@/server/races/types";
import { DriverFace, SeasonProvider } from "@/features/common/Brand";
import { CircuitCard } from "./CircuitCard";
import { YearPill } from "./YearPill";

const TrackStage = dynamic(() => import("./TrackStage"), {
  ssr: false,
  loading: () => <div style={{ position: "absolute", inset: 0 }} />,
});

type Props = {
  races: RaceInfo[];
  onStart: (raceId: number, driver: string | null) => void;
};

type Circuit = {
  key: number;
  short: string;
  name: string;
  code: string | null;
  country: string;
  lengthKm: number | null;
  byYear: Map<number, RaceInfo>;
  dry: number;
};

const OVERLAY = "rgba(13,13,15,.72)";

const surname = (name: string | null, fallback: string) =>
  name ? name.split(" ").slice(1).join(" ") || name : fallback;

function buildCircuits(races: RaceInfo[]): Circuit[] {
  const map = new Map<number, Circuit>();
  for (const race of races) {
    const entry = map.get(race.circuit_key) ?? {
      key: race.circuit_key,
      short: race.circuit.short_name,
      name: race.circuit.official_name ?? race.circuit.short_name,
      code: race.circuit.country_code,
      country: race.country,
      lengthKm: race.circuit.length_km ?? (race.circ_length_m ? race.circ_length_m / 1000 : null),
      byYear: new Map<number, RaceInfo>(),
      dry: 0,
    };
    entry.byYear.set(race.year, race);
    if (race.predictable) entry.dry += 1;
    map.set(race.circuit_key, entry);
  }
  return [...map.values()].sort((a, b) => a.short.localeCompare(b.short));
}

/** Why a season cannot be replayed with forecasts; null when it can. */
function yearNote(race: RaceInfo | undefined): string | null {
  if (!race) return "No race this year";
  if (race.predictable) return null;
  return race.exclusion_reason === "wet" ? "Wet race, no forecast" : "Not modelled, no forecast";
}

function Panel({
  title,
  right,
  children,
  style,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      className="rounded-xl border border-line bg-panel"
      style={{ display: "flex", flexDirection: "column", minHeight: 0, ...style }}
    >
      <div
        className="border-b border-divider"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}
      >
        <span className="text-[11px] font-bold tracking-[.1em] text-ink-mute">{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-lg border border-line"
      style={{ padding: "7px 11px", background: OVERLAY, minWidth: 0 }}
    >
      <div className="text-[10.5px] font-semibold tracking-[.08em] text-ink-mute">{label}</div>
      <div className="font-cond text-[19px] font-semibold" style={{ lineHeight: 1.15 }}>
        {value}
      </div>
      {sub && (
        <div
          className="text-[11px] text-ink-mute"
          style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Elevation along one lap (real data, metres), drawn as a small area chart. */
function Profile({ trace }: { trace: ElevationTrace }) {
  const width = 240;
  const height = 48;
  const top = Math.max(trace.range_m, 1);
  const points = trace.z.map((z, i) => {
    const x = (i / (trace.z.length - 1)) * width;
    const y = height - 3 - (z / top) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div
      className="rounded-lg border border-line"
      title={`Real elevation along one lap, drawn ×${HEIGHT_SCALE} in 3D`}
      style={{ padding: "7px 10px 8px", background: OVERLAY, width: "100%" }}
    >
      <div
        className="text-[10.5px] font-semibold tracking-[.08em] text-ink-mute"
        style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
      >
        <span>ELEVATION</span>
        <span>{trace.range_m.toFixed(0)} m range</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        style={{ display: "block" }}
      >
        <polygon
          points={`0,${height} ${points.join(" ")} ${width},${height}`}
          fill="rgba(255,107,31,.18)"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="#ff6b1f"
          strokeWidth={1.6}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/** Used when WebGL is not available. */
function FlatOutline({ circuit }: { circuit: string }) {
  const geometry = geometryFor(circuit);
  if (!geometry) return null;
  const { viewBox } = trackView(geometry);
  return (
    <svg
      viewBox={viewBox}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <path
        d={closedPath(trackPath(geometry))}
        fill="none"
        stroke="#ff6b1f"
        strokeWidth={2.4}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** First screen: pick a circuit, a season and a driver, then open the replay. */
export function Landing({ races, onStart }: Props) {
  const circuits = useMemo(() => buildCircuits(races), [races]);
  const years = useMemo(() => [...new Set(races.map((r) => r.year))].sort(), [races]);
  const dryRaces = races.filter((r) => r.predictable).length;

  // Nothing is selected until the visitor clicks.
  const [circuitKey, setCircuitKey] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [driver, setDriver] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [flat, setFlat] = useState(false);
  const [elevation, setElevation] = useState<ElevationData | null>(null);

  useEffect(() => {
    let alive = true;
    loadElevation().then((data) => alive && setElevation(data));
    return () => {
      alive = false;
    };
  }, []);

  const selected = circuits.find((c) => c.key === circuitKey) ?? null;
  const race = selected && year !== null ? selected.byYear.get(year) : undefined;
  const note = selected ? yearNote(race) : null;
  const usable = race?.predictable ? race : null;

  // Without a race with a forecast the list still shows the latest grid, so drivers can be
  // chosen first; their finishing positions only appear for the selected race.
  const latest = useMemo(
    () =>
      races
        .filter((r) => r.predictable)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .at(-1) ?? null,
    [races],
  );
  const { data: summary } = useRaceSummary(usable?.race_id ?? null);
  const { data: rosterSummary } = useRaceSummary(usable ? null : (latest?.race_id ?? null));
  const source = usable ? summary : rosterSummary;
  const results = useMemo(
    () =>
      [...(source?.results ?? [])].sort(
        (a, b) => (a.finish_position ?? 99) - (b.finish_position ?? 99),
      ),
    [source],
  );
  const chosen = results.find((r) => r.driver_code === driver) ?? null;
  const ready = Boolean(usable && chosen);

  const pickCircuit = (key: number) => {
    const next = circuits.find((c) => c.key === key);
    if (!next) return;
    setCircuitKey(key);
    // Keep the season when this circuit has a forecast for it, else the latest one that has.
    if (year === null || !next.byYear.get(year)?.predictable) {
      const fallback = [...years].reverse().find((y) => next.byYear.get(y)?.predictable);
      if (fallback) setYear(fallback);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = circuits.filter(
    (c) => !q || `${c.short} ${c.name} ${c.country} ${c.code ?? ""}`.toLowerCase().includes(q),
  );

  const go = () => {
    if (usable && chosen) onStart(usable.race_id, chosen.driver_code);
  };

  const trace = selected ? traceFor(elevation, selected.short) : null;
  const dryYears = selected ? years.filter((y) => selected.byYear.get(y)?.predictable) : [];
  const seasons = selected ? [...selected.byYear.keys()].sort() : [];
  const span: [number, number] | null = seasons.length
    ? [seasons[0], seasons[seasons.length - 1]]
    : null;
  const chips = [
    selected?.lengthKm ? `${selected.lengthKm.toFixed(3)} km` : null,
    usable ? `${usable.total_laps} laps` : null,
    usable?.circ_num_corners ? `${usable.circ_num_corners} corners` : null,
  ].filter((chip): chip is string => chip !== null);

  return (
    <SeasonProvider value={year ?? latest?.year ?? null}>
      <div className="landing">
        <header
          className="rounded-xl border border-line bg-panel"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px 18px",
            padding: "8px 14px",
            minHeight: 52,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="flex -skew-x-20 gap-[3px]">
              <span className="h-[18px] w-1 bg-accent" />
              <span className="h-[18px] w-1 bg-accent opacity-70" />
              <span className="h-[18px] w-1 bg-accent opacity-40" />
            </div>
            <span className="font-display text-[14px] tracking-[.04em]">NEXT LAP</span>
            <span className="rounded border border-popover px-1.5 py-0.5 text-[10px] font-semibold tracking-[.08em] text-ink-mute">
              PREDICTOR
            </span>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
            <div className="text-[13px]" style={{ whiteSpace: "nowrap" }}>
              {selected ? (
                <>
                  <b>{selected.short}</b>
                  <span className="text-ink-mute"> · </span>
                  {year}
                  <span className="text-ink-mute"> · </span>
                  {chosen ? (
                    <b>{chosen.driver_code}</b>
                  ) : (
                    <span className="text-ink-mute">pick a driver</span>
                  )}
                </>
              ) : chosen ? (
                <>
                  <b>{chosen.driver_code}</b>
                  <span className="text-ink-mute"> · pick a circuit</span>
                </>
              ) : (
                <span className="text-ink-mute">Pick a circuit, a year and a driver</span>
              )}
            </div>
            <button
              type="button"
              onClick={go}
              disabled={!ready}
              className="rounded-lg border-0 text-[13.5px] font-bold"
              style={{
                padding: "9px 18px",
                cursor: ready ? "pointer" : "not-allowed",
                background: ready ? "var(--color-accent)" : "var(--color-control)",
                color: ready ? "#fff" : "var(--color-ink-mute)",
                whiteSpace: "nowrap",
              }}
            >
              Start replay →
            </button>
          </div>
        </header>

        <div className="landing-grid">
          <Panel
            title="1 · CIRCUIT"
            right={
              <span className="text-[11px] text-ink-mute">
                {circuits.length} circuits · {years[0]}–{years[years.length - 1]}
              </span>
            }
            style={{ maxHeight: "calc(100vh - 76px)" }}
          >
            <div style={{ padding: "10px 12px 0" }}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search circuit or country"
                aria-label="Search circuit or country"
                className="rounded-lg border border-control bg-raised text-[12.5px] text-ink"
                style={{ width: "100%", padding: "7px 10px", outline: "none" }}
              />
            </div>
            <div
              style={{
                padding: 12,
                overflow: "auto",
                minHeight: 0,
                flex: 1,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                gap: 8,
                alignContent: "start",
              }}
            >
              {shown.map((c) => (
                <CircuitCard
                  key={c.key}
                  name={stripGrandPrix(c.short)}
                  sub={`${c.code ?? c.country} · ${c.dry} dry`}
                  geometry={geometryFor(c.short)}
                  active={c.key === circuitKey}
                  onPick={() => pickCircuit(c.key)}
                />
              ))}
              {!shown.length && (
                <div className="text-[12px] text-ink-mute" style={{ gridColumn: "1 / -1" }}>
                  No circuit matches this search.
                </div>
              )}
            </div>
          </Panel>

          <section
            className="landing-stage rounded-xl border border-line bg-stage"
            style={{
              position: "relative",
              overflow: "hidden",
              minHeight: 420,
              // Soft studio light: brighter behind the circuit, darker towards the edges.
              background:
                "radial-gradient(ellipse 70% 62% at 50% 56%, #2b2b32 0%, #1c1c21 48%, #101013 100%)",
            }}
          >
            {selected ? (
              <>
                <div style={{ position: "absolute", inset: 0 }}>
                  {flat ? (
                    <FlatOutline circuit={selected.short} />
                  ) : (
                    <TrackStage
                      circuit={selected.short}
                      trace={trace}
                      onUnsupported={() => setFlat(true)}
                      className="size-full"
                    />
                  )}
                </div>
                <div style={{ position: "absolute", left: 18, top: 14, pointerEvents: "none" }}>
                  <div className="text-[11px] font-bold tracking-[.1em] text-accent">
                    SELECTED CIRCUIT
                  </div>
                  <div className="font-display" style={{ fontSize: 22, marginTop: 4 }}>
                    {selected.short}
                  </div>
                  <div className="text-[12.5px] text-ink-dim" style={{ marginTop: 2 }}>
                    {selected.name} · {selected.country}
                  </div>
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 14,
                    top: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    width: 264,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.max(chips.length, 1)}, minmax(0, 1fr))`,
                      gap: 6,
                    }}
                  >
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-line text-[11.5px] font-semibold text-ink-soft"
                        style={{
                          padding: "4px 6px",
                          background: OVERLAY,
                          textAlign: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  {trace && <Profile trace={trace} />}
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: 14,
                    right: 14,
                    bottom: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="text-[11px] font-bold tracking-[.1em] text-ink-mute"
                      style={{ marginBottom: 6 }}
                    >
                      2 · YEAR
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {years.map((y) => (
                        <YearPill
                          key={y}
                          year={y}
                          race={selected.byYear.get(y)}
                          circuit={selected.short}
                          dryYears={dryYears}
                          span={span}
                          active={y === year}
                          onPick={() => setYear(y)}
                        />
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
                      gap: 8,
                      flex: "1 1 360px",
                      maxWidth: 520,
                    }}
                  >
                    {note ? (
                      <div
                        className="rounded-lg border border-line text-[12.5px] text-ink-dim"
                        style={{ gridColumn: "1 / -1", padding: "10px 12px", background: OVERLAY }}
                      >
                        {note}. Pick another year to replay this circuit.
                      </div>
                    ) : (
                      <>
                        <Fact
                          label="WINNER"
                          value={summary?.winner?.driver_code ?? "—"}
                          sub={summary?.winner?.team}
                        />
                        <Fact
                          label="POLE"
                          value={summary?.pole?.driver_code ?? "—"}
                          sub={summary?.pole ? fmtLap(summary.pole.q_best_sec) : undefined}
                        />
                        <Fact
                          label="FASTEST LAP"
                          value={summary?.fastest_lap?.driver_code ?? "—"}
                          sub={
                            summary?.fastest_lap
                              ? fmtLap(summary.fastest_lap.lap_time_sec)
                              : undefined
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  padding: 24,
                }}
              >
                <div>
                  <svg
                    width="54"
                    height="54"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-ink-faint)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ margin: "0 auto" }}
                  >
                    <path d="M4 15c0-4 3-4 4.5-6S9 4.5 13 5s5 3 4 6-4 2-3.5 5 4 3 .5 4.5S4 19 4 15Z" />
                  </svg>
                  <div className="font-display" style={{ fontSize: 18, marginTop: 14 }}>
                    Choose a circuit
                  </div>
                  <div
                    className="text-[12.5px] text-ink-mute"
                    style={{ marginTop: 6, maxWidth: 300 }}
                  >
                    Pick one from the list on the left. It opens here in 3D, with its real
                    elevation.
                  </div>
                </div>
              </div>
            )}
          </section>

          <Panel
            title="3 · DRIVER"
            right={
              <span className="text-[11px] text-ink-mute">
                {usable && year !== null
                  ? `${stripGrandPrix(usable.event_name)} ${year}`
                  : latest
                    ? `${latest.year} grid`
                    : ""}
              </span>
            }
            style={{ maxHeight: "calc(100vh - 76px)" }}
          >
            <div
              style={{
                padding: 12,
                overflow: "auto",
                minHeight: 0,
                flex: 1,
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
                alignContent: "start",
              }}
            >
              {!usable && (
                <div className="text-[12px] text-ink-mute" style={{ gridColumn: "1 / -1" }}>
                  {selected
                    ? `${note ?? "Choose a year"}. Showing the latest grid.`
                    : "Choose a circuit and a year. Showing the latest grid."}
                </div>
              )}
              {!source && (
                <div className="text-[12.5px] text-ink-mute" style={{ gridColumn: "1 / -1" }}>
                  Loading the grid…
                </div>
              )}
              {results.map((r, index) => {
                const on = r.driver_code === chosen?.driver_code;
                const finish =
                  r.classified_position === "R" || r.finish_position === null
                    ? "DNF"
                    : `P${r.finish_position}`;
                return (
                  <button
                    key={r.driver_code}
                    type="button"
                    onClick={() => setDriver(r.driver_code)}
                    onDoubleClick={() => usable && onStart(usable.race_id, r.driver_code)}
                    className="rounded-[10px] border text-left"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 9px",
                      cursor: "pointer",
                      minWidth: 0,
                      borderColor: on ? "var(--color-accent)" : "var(--color-line)",
                      background: on
                        ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-panel))"
                        : "var(--color-panel)",
                      color: "var(--color-ink)",
                    }}
                  >
                    <DriverFace
                      code={r.driver_code}
                      color={r.team_color ?? "#9a9aa3"}
                      size={42}
                      eager={index < 8}
                    />
                    <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                      <span
                        className="text-[13.5px] font-bold"
                        style={{
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {surname(r.driver_name, r.driver_code)}
                      </span>
                      <span className="text-[11.5px] text-ink-mute" style={{ display: "block" }}>
                        {usable ? `${r.driver_code} · ${finish}` : r.driver_code}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </SeasonProvider>
  );
}
