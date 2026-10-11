"use client";

import { useMemo, useState } from "react";
import { TrackMap } from "@/components/charts/TrackMap";
import { Legend } from "@/components/ui/Legend";
import { Select } from "@/components/ui/Select";
import { Swatch, TeamBar } from "@/components/ui/Swatch";
import { Table, Td, Th } from "@/components/ui/Table";
import { fmtLap } from "@/lib/format";
import { sectorShares } from "@/lib/race/laps";
import type { Timeline } from "@/lib/race/timeline";
import { geometryFor } from "@/lib/race/track";
import { median, percentOf } from "@/lib/stats";
import type { ControlEvent, DriverRow, TeamPace, TrafficBin } from "./analysis";
import { formatMetric, LAP_METRICS } from "./metrics";

const PURPLE = "var(--color-best)";

export function QualifyingTable({ rows }: { rows: DriverRow[] }) {
  const ordered = [...rows].sort((a, b) => (a.run.q_pos ?? 99) - (b.run.q_pos ?? 99));
  return (
    <div className="max-h-[420px] overflow-auto max-[1179px]:max-h-none">
      <Table>
        <thead>
          <tr>
            {["Q", "DRIVER", "Q1", "Q2", "Q3", "GAP TO POLE", "GRID", "RESULT"].map((name, i) => (
              <Th key={name} left={i === 1}>
                {name}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => {
            const { run } = row;
            const cut = run.q_pos === 11 || run.q_pos === 16;
            const penalised =
              run.grid_position !== null && run.q_pos !== null && run.grid_position !== run.q_pos;
            return (
              <tr
                key={run.driver_code}
                style={{ borderTop: cut ? "1px solid #3a3a42" : undefined }}
              >
                <Td>{run.q_pos ?? "–"}</Td>
                <Td left text>
                  <span className="flex items-center gap-[7px]">
                    <TeamBar color={run.color} />
                    <b>{run.driver_code}</b>
                  </span>
                </Td>
                <Td className={run.q2_sec === null ? "text-ink" : "text-ink-mute"}>
                  {fmtLap(run.q1_sec)}
                </Td>
                <Td
                  className={
                    run.q3_sec === null && run.q2_sec !== null ? "text-ink" : "text-ink-mute"
                  }
                >
                  {run.q2_sec !== null ? fmtLap(run.q2_sec) : "—"}
                </Td>
                <Td>{run.q3_sec !== null ? fmtLap(run.q3_sec) : "—"}</Td>
                <Td style={{ color: run.q_pos === 1 ? PURPLE : undefined }}>
                  {run.q_pos === 1
                    ? "POLE"
                    : run.q_gap_to_pole_pct === null
                      ? "—"
                      : `+${run.q_gap_to_pole_pct.toFixed(3)}%`}
                </Td>
                <Td style={{ color: penalised ? "var(--color-caution)" : undefined }}>
                  P{run.grid_position ?? "–"}
                  {penalised ? " *" : ""}
                </Td>
                <Td style={{ color: row.retired ? "var(--color-stop)" : undefined }}>
                  {row.retired ? "DNF" : `P${row.position ?? "–"}`}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="mt-1.5 text-[11px] text-ink-mute">
        Lines mark the Q1 and Q2 cut-offs · * starts from a different slot than it qualified
      </div>
    </div>
  );
}

export function TeamPaceBars({ teams }: { teams: TeamPace[] }) {
  if (!teams.length) return null;
  const lo = teams[0].median - 0.05;
  const hi = teams[teams.length - 1].q3;
  return (
    <div>
      <div className="flex flex-col gap-[7px]">
        {teams.map((team, i) => (
          <div
            key={team.team}
            title={`${team.team} · median ${fmtLap(team.median)} · IQR ${fmtLap(team.q1)}–${fmtLap(team.q3)} · ${team.laps} laps`}
            className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-2.5 text-[12px]"
          >
            <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <TeamBar color={team.color} />
              {team.team}
            </span>
            <div className="relative h-3.5 rounded-[3px] bg-inset">
              <div
                className="absolute inset-y-[3px] rounded-sm"
                style={{
                  left: `${percentOf(team.q1, lo, hi)}%`,
                  width: `${percentOf(team.q3, lo, hi) - percentOf(team.q1, lo, hi)}%`,
                  background: `color-mix(in srgb, ${team.color} 35%, transparent)`,
                }}
              />
              <div
                className="absolute inset-y-0 -ml-px w-[3px] rounded-sm"
                style={{ left: `${percentOf(team.median, lo, hi)}%`, background: team.color }}
              />
            </div>
            <span className="text-right font-mono" style={{ color: i ? undefined : PURPLE }}>
              {i ? `+${(team.median - teams[0].median).toFixed(3)}` : "fastest"}
            </span>
          </div>
        ))}
      </div>
      <Legend
        items={[
          [
            <span key="m" className="h-3 w-[3px] bg-ink-soft" />,
            "Median clean lap (no fuel correction)",
          ],
          [<Swatch key="q" color="rgba(255,255,255,.25)" size={[14, 8]} />, "Middle 50% of laps"],
        ]}
      />
    </div>
  );
}

export function SectorDominance({
  timeline,
  circuitName,
  rows,
  selected,
}: {
  timeline: Timeline;
  circuitName: string;
  rows: DriverRow[];
  selected: string[];
}) {
  const geometry = useMemo(() => geometryFor(circuitName), [circuitName]);
  const shares = useMemo(() => sectorShares(timeline), [timeline]);
  const pool = rows
    .filter((row) =>
      (selected.length ? selected : rows.slice(0, 3).map((r) => r.run.driver_code)).includes(
        row.run.driver_code,
      ),
    )
    .filter((row) => row.sectorBests.every((v) => v !== null));
  const winners = [0, 1, 2].map((k) =>
    pool.length
      ? pool.reduce((a, b) => ((b.sectorBests[k] as number) < (a.sectorBests[k] as number) ? b : a))
      : null,
  );
  const fieldBest = [0, 1, 2].map((k) =>
    Math.min(...rows.map((r) => r.sectorBests[k]).filter((v): v is number => v !== null)),
  );
  const complete = rows
    .filter((row) => row.theoretical !== null)
    .sort((a, b) => (a.theoretical as number) - (b.theoretical as number));

  return (
    <div>
      {geometry && (
        <div className="relative mb-2 h-[240px]">
          <TrackMap
            geometry={geometry}
            sectors={shares}
            colors={winners.map((w) => w?.run.color ?? "#55555c")}
            labels={winners.map((w, k) =>
              w
                ? `S${k + 1} · ${w.run.driver_code} ${(w.sectorBests[k] as number).toFixed(3)}`
                : `S${k + 1}`,
            )}
          />
        </div>
      )}
      <div className="max-h-[260px] overflow-auto max-[1179px]:max-h-none">
        <Table>
          <thead>
            <tr>
              {[
                "DRIVER",
                "BEST S1",
                "BEST S2",
                "BEST S3",
                "THEORETICAL",
                "ACTUAL BEST",
                "UNUSED",
              ].map((name, i) => (
                <Th key={name} left={i === 0}>
                  {name}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {complete.map((row) => (
              <tr
                key={row.run.driver_code}
                style={{
                  background: selected.includes(row.run.driver_code)
                    ? `color-mix(in srgb, ${row.run.color} 8%, transparent)`
                    : undefined,
                }}
              >
                <Td left text>
                  <span className="flex items-center gap-[7px]">
                    <TeamBar color={row.run.color} />
                    <b>{row.run.driver_code}</b>
                  </span>
                </Td>
                {[0, 1, 2].map((k) => (
                  <Td
                    key={k}
                    style={{ color: row.sectorBests[k] === fieldBest[k] ? PURPLE : undefined }}
                  >
                    {(row.sectorBests[k] as number).toFixed(3)}
                  </Td>
                ))}
                <Td>{fmtLap(row.theoretical)}</Td>
                <Td>{fmtLap(row.best)}</Td>
                <Td
                  style={{
                    color:
                      (row.best ?? 0) - (row.theoretical as number) > 0.25
                        ? "var(--color-caution)"
                        : "var(--color-ink-mute)",
                  }}
                >
                  +{((row.best ?? 0) - (row.theoretical as number)).toFixed(3)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

type Pick = { code: string; lap: number };

export function LapComparison({ rows }: { rows: DriverRow[] }) {
  const [a, setA] = useState<Pick | null>(null);
  const [b, setB] = useState<Pick | null>(null);
  const first = rows[0];
  const second = rows[1] ?? rows[0];
  const pickA = a ?? { code: first.run.driver_code, lap: first.bestLap ?? 1 };
  const pickB = b ?? { code: second.run.driver_code, lap: second.bestLap ?? 1 };
  const rowOf = (code: string) => rows.find((r) => r.run.driver_code === code) ?? first;
  const lapOf = (pick: Pick) =>
    rowOf(pick.code).run.laps[pick.lap - 1] ?? rowOf(pick.code).run.laps[0];
  const lapA = lapOf(pickA);
  const lapB = lapOf(pickB);
  const colorA = rowOf(pickA.code).run.color;
  const sameTeam =
    pickA.code !== pickB.code && rowOf(pickA.code).run.team === rowOf(pickB.code).run.team;
  const colorB = sameTeam ? "#ffffff" : rowOf(pickB.code).run.color;

  const lapOptions = (code: string) =>
    rowOf(code).run.laps.map((lap) => ({
      value: String(lap.lap_number),
      label: `L${lap.lap_number} · ${fmtLap(lap.lap_time_sec)}${lap.flag ? ` · ${lap.flag}` : ""}${
        lap.lap_number === rowOf(code).bestLap ? " · best" : ""
      }`,
    }));
  const driverOptions = rows.map((r) => ({
    value: r.run.driver_code,
    label: `${r.run.driver_code} · ${r.run.name}`,
  }));

  const body = LAP_METRICS.filter((m) => m.key !== "position").map((metric) => {
    const va = metric.value(lapA);
    const vb = metric.value(lapB);
    const ok = va != null && vb != null;
    const delta = ok ? vb - va : null;
    const relative =
      ok && Math.abs(va) + Math.abs(vb) > 0
        ? ((vb - va) / ((Math.abs(va) + Math.abs(vb)) / 2)) * 100
        : 0;
    const better =
      delta === null || !metric.better || Math.abs(delta) < 1e-9
        ? null
        : delta * metric.better > 0
          ? "B"
          : "A";
    return { metric, va, vb, delta, relative, better };
  });

  return (
    <div>
      <div className="mb-2.5 grid grid-cols-1 gap-2 wide:grid-cols-2">
        {(
          [
            [pickA, setA, colorA],
            [pickB, setB, colorB],
          ] as const
        ).map(([pick, set, color], i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <TeamBar color={color} height={18} />
            <Select
              value={pick.code}
              options={driverOptions}
              maxWidth={170}
              onChange={(code) => set({ code, lap: rowOf(code).bestLap ?? 1 })}
            />
            <Select
              value={String(pick.lap)}
              options={lapOptions(pick.code)}
              maxWidth={190}
              onChange={(lap) => set({ code: pick.code, lap: Number(lap) })}
            />
          </div>
        ))}
      </div>
      <div className="max-h-[520px] overflow-auto max-[1179px]:max-h-none">
        <Table>
          <thead>
            <tr>
              <Th left>METRIC</Th>
              <Th style={{ color: colorA }}>{`${pickA.code} L${lapA.lap_number}`}</Th>
              <Th style={{ color: colorB }}>{`${pickB.code} L${lapB.lap_number}`}</Th>
              <Th>Δ (B − A)</Th>
              <Th className="w-[28%] text-center">RELATIVE (±10%)</Th>
            </tr>
          </thead>
          <tbody>
            {body.flatMap((entry, index) => {
              const out = [];
              if (body[index - 1]?.metric.group !== entry.metric.group) {
                out.push(
                  <tr key={`g-${entry.metric.group}`}>
                    <td
                      colSpan={5}
                      className="px-2 pb-1 pt-[9px] text-[10px] font-bold tracking-[.08em] text-accent"
                    >
                      {entry.metric.group.toUpperCase()}
                    </td>
                  </tr>,
                );
              }
              const { metric, va, vb, delta, relative, better } = entry;
              const width = Math.min(50, (Math.abs(relative) / 10) * 50);
              out.push(
                <tr key={metric.key}>
                  <Td left text className="text-ink-soft">
                    {metric.label}
                  </Td>
                  <Td className={better === "A" ? "font-bold" : undefined}>
                    {va == null ? "—" : formatMetric(metric, va)}
                  </Td>
                  <Td className={better === "B" ? "font-bold" : undefined}>
                    {vb == null ? "—" : formatMetric(metric, vb)}
                  </Td>
                  <Td className="text-ink-mute">
                    {delta === null
                      ? "—"
                      : Math.abs(delta) < 0.5 * 10 ** -metric.digits
                        ? "±0"
                        : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(metric.digits)}`}
                  </Td>
                  <Td className="px-2.5">
                    <div className="relative h-2 rounded bg-inset">
                      <div
                        className="absolute inset-y-0 rounded"
                        style={{
                          left: `${relative >= 0 ? 50 : 50 - width}%`,
                          width: `${Math.max(width, 0.5)}%`,
                          background: better === "A" ? colorA : better === "B" ? colorB : "#6a6a74",
                        }}
                      />
                      <div className="absolute -inset-y-0.5 left-1/2 border-l border-ink-faint" />
                    </div>
                  </Td>
                </tr>,
              );
              return out;
            })}
          </tbody>
        </Table>
      </div>
      <Legend
        items={[
          [<Swatch key="a" color={colorA} />, `${pickA.code} better`],
          [<Swatch key="b" color={colorB} />, `${pickB.code} better`],
          [<Swatch key="n" color="#6a6a74" />, "No better/worse direction"],
        ]}
      />
    </div>
  );
}

export function TrafficPanel({ bins, rows }: { bins: TrafficBin[]; rows: DriverRow[] }) {
  const stats = bins.map((bin) => ({ ...bin, median: median(bin.deltas), n: bin.deltas.length }));
  const peak = Math.max(0.2, ...stats.map((s) => Math.abs(s.median ?? 0)));
  const share = rows.filter((r) => r.run.laps.length > 3).sort((a, b) => b.traffic - a.traffic);

  return (
    <div className="grid grid-cols-1 gap-4 wide:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-2 text-[11.5px] text-ink-dim">Time lost by gap to the car ahead</div>
        <div className="flex flex-col gap-[7px]">
          {stats.map((bin) => (
            <div
              key={bin.label}
              className="grid grid-cols-[110px_minmax(0,1fr)_70px] items-center gap-2.5 text-[12px]"
            >
              <span className="text-ink-soft">
                {bin.label}
                <span className="text-[10.5px] text-ink-faint"> · {bin.n}</span>
              </span>
              <div className="relative h-3.5 rounded-[3px] bg-inset">
                <div
                  className="absolute inset-y-0 rounded-[3px]"
                  style={{
                    left:
                      bin.median !== null && bin.median < 0
                        ? `${50 - (Math.abs(bin.median) / peak) * 50}%`
                        : "50%",
                    width: `${bin.median === null ? 0 : (Math.abs(bin.median) / peak) * 50}%`,
                    background: (bin.median ?? 0) > 0 ? "var(--color-stop)" : "var(--color-go)",
                  }}
                />
                <div className="absolute -inset-y-0.5 left-1/2 border-l border-ink-faint" />
              </div>
              <span className="text-right font-mono">
                {bin.median === null
                  ? "—"
                  : `${bin.median >= 0 ? "+" : ""}${bin.median.toFixed(3)} s`}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-normal text-ink-mute">
          Lap time vs the driver&apos;s own clean-air trend in the same stint (tyre life absorbs
          fuel burn-off), grouped by the gap to the car ahead at the start of the lap.
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11.5px] text-ink-dim">
          Share of racing laps within 1 s of the car ahead
        </div>
        <div className="flex max-h-[330px] flex-col gap-1 overflow-auto max-[1179px]:max-h-none">
          {share.map((row) => (
            <div
              key={row.run.driver_code}
              className="grid grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-2 text-[11.5px]"
            >
              <span className="flex items-center gap-[5px] font-bold">
                <TeamBar color={row.run.color} height={12} />
                {row.run.driver_code}
              </span>
              <div className="h-[9px] rounded-[3px] bg-inset">
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${row.traffic}%`, background: row.run.color }}
                />
              </div>
              <span className="text-right font-mono">{row.traffic.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RaceControlFeed({ events }: { events: ControlEvent[] }) {
  return (
    <div className="max-h-[330px] overflow-auto">
      {events.map((event, i) => (
        <div
          key={i}
          className="grid grid-cols-[44px_10px_minmax(0,1fr)] items-center gap-2 border-b border-rowline py-1.5 text-[12px]"
        >
          <span className="font-mono text-ink-mute">{event.lap ? `L${event.lap}` : "GRID"}</span>
          <Swatch color={event.color} size={[8, 8]} radius={4} />
          <span>{event.text}</span>
        </div>
      ))}
    </div>
  );
}
