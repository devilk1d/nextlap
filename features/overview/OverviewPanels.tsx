"use client";

import { useMemo } from "react";
import { TrackMap } from "@/components/charts/TrackMap";
import { Legend } from "@/components/ui/Legend";
import { Swatch, TeamBar } from "@/components/ui/Swatch";
import { TeamLogo } from "@/features/common/Brand";
import { Table, Td, Th } from "@/components/ui/Table";
import { fmtLap } from "@/lib/format";
import { sectorShares } from "@/lib/race/laps";
import type { Timeline } from "@/lib/race/timeline";
import { geometryFor } from "@/lib/race/track";
import { median, percentOf } from "@/lib/stats";
import type { ControlEvent, DriverRow, TeamPace, TrafficBin } from "./analysis";

const PURPLE = "var(--color-best)";

export function QualifyingTable({ rows }: { rows: DriverRow[] }) {
  const ordered = [...rows].sort((a, b) => (a.run.q_pos ?? 99) - (b.run.q_pos ?? 99));
  return (
    <div className="overflow-auto">
      <Table className="[&_td]:!py-[3px]">
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
        Lines = Q1 / Q2 cut-offs · * grid penalty
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
            data-tip={[
              `# ${team.team}`,
              `Median lap | ${fmtLap(team.median)}`,
              `Middle 50% | ${fmtLap(team.q1)} – ${fmtLap(team.q3)}`,
              i ? `Behind fastest | +${(team.median - teams[0].median).toFixed(3)} s` : "Fastest team",
              `Clean laps | ${team.laps}`,
            ].join("\n")}
            data-tip-color={team.color}
            className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-2.5 text-[12px]"
          >
            <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <TeamLogo team={team.team} color={team.color} size={16} />
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
          [<span key="m" className="h-3 w-[3px] bg-ink-soft" />, "Median lap (no fuel correction)"],
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

  return (
    <div>
      {geometry && (
        <div className="relative h-[240px]">
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
    </div>
  );
}

export function TrafficPanel({ bins, rows }: { bins: TrafficBin[]; rows: DriverRow[] }) {
  const stats = bins.map((bin) => ({ ...bin, median: median(bin.deltas), n: bin.deltas.length }));
  const peak = Math.max(0.2, ...stats.map((s) => Math.abs(s.median ?? 0)));
  const share = rows.filter((r) => r.run.laps.length > 3).sort((a, b) => b.traffic - a.traffic);

  return (
    <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
      <div>
        <div className="mb-2 text-[11.5px] text-ink-dim">Time lost by gap</div>
        <div className="flex h-[205px] flex-col justify-between">
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
          Lap time vs the driver&apos;s own clean-air pace, by gap at the start of the lap.
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11.5px] text-ink-dim">Laps within 1 s of the car ahead</div>
        <div className="flex h-[205px] flex-col gap-[7px] overflow-auto">
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
    <div className="absolute inset-x-3.5 inset-y-3 overflow-auto">
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
