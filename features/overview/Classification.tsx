"use client";

import { useState, type ReactNode } from "react";
import { Table, Td, Th } from "@/components/ui/Table";
import { TeamBar, TyreDot } from "@/components/ui/Swatch";
import { fmtClock, fmtLap, fmtLapsDown } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { DriverRow } from "./analysis";

type Column = {
  key: string;
  label: string;
  left?: boolean;
  /** Sort key; lower sorts first in ascending order. */
  sort: (row: DriverRow) => number | string;
  cell: (row: DriverRow) => ReactNode;
  color?: (row: DriverRow) => string | undefined;
};

const GO = "var(--color-go)";
const STOP = "var(--color-stop)";
const MUTED = "var(--color-ink-mute)";
const BIG = 1e9;
const dash = (value: number | null, digits = 0) => (value === null ? "—" : value.toFixed(digits));

function columns(fastest: number | null, topSpeed: number | null): Column[] {
  return [
    {
      key: "pos",
      label: "POS",
      sort: (r) => r.position ?? 99,
      cell: (r) => r.run.classified_position ?? "–",
    },
    { key: "code", label: "DRIVER", left: true, sort: (r) => r.run.driver_code, cell: () => null },
    {
      key: "grid",
      label: "GRID",
      sort: (r) => r.run.grid_position ?? 99,
      cell: (r) => r.run.grid_position ?? "–",
    },
    {
      key: "gained",
      label: "+/−",
      sort: (r) => r.gained ?? -99,
      cell: (r) =>
        r.gained == null
          ? "–"
          : r.gained > 0
            ? `▲${r.gained}`
            : r.gained < 0
              ? `▼${-r.gained}`
              : "–",
      color: (r) => ((r.gained ?? 0) > 0 ? GO : (r.gained ?? 0) < 0 ? STOP : MUTED),
    },
    {
      key: "status",
      label: "STATUS",
      left: true,
      sort: (r) => r.run.status ?? "",
      cell: (r) => r.run.status ?? "–",
      color: (r) => (r.retired ? STOP : r.lapsDown ? "var(--color-caution)" : MUTED),
    },
    { key: "laps", label: "LAPS", sort: (r) => r.run.laps.length, cell: (r) => r.run.laps.length },
    {
      key: "time",
      label: "TIME / GAP",
      sort: (r) => r.position ?? 99,
      cell: (r) =>
        r.position === 1
          ? fmtClock(r.finishSeconds)
          : r.retired
            ? "DNF"
            : r.lapsDown
              ? fmtLapsDown(r.lapsDown)
              : r.gapSeconds === null
                ? "—"
                : `+${r.gapSeconds.toFixed(3)}`,
    },
    {
      key: "points",
      label: "PTS",
      sort: (r) => r.run.points ?? 0,
      cell: (r) => (r.run.points ? r.run.points : ""),
    },
    {
      key: "best",
      label: "BEST LAP",
      sort: (r) => r.best ?? BIG,
      cell: (r) => fmtLap(r.best),
      color: (r) => (r.best !== null && r.best === fastest ? "var(--color-best)" : undefined),
    },
    {
      key: "onLap",
      label: "ON LAP",
      sort: (r) => r.bestLap ?? 0,
      cell: (r) => (r.bestLap ? `L${r.bestLap}` : "—"),
    },
    {
      key: "theo",
      label: "THEOR. BEST",
      sort: (r) => r.theoretical ?? BIG,
      cell: (r) => fmtLap(r.theoretical),
    },
    { key: "median", label: "MEDIAN", sort: (r) => r.median ?? BIG, cell: (r) => fmtLap(r.median) },
    { key: "sd", label: "STD DEV", sort: (r) => r.stdDev ?? 0, cell: (r) => dash(r.stdDev, 3) },
    { key: "pits", label: "PITS", sort: (r) => r.pits, cell: (r) => r.pits },
    {
      key: "tyres",
      label: "TYRES",
      sort: (r) => r.strategy.join(""),
      cell: (r) => (
        <span className="inline-flex gap-[3px]">
          {r.strategy.map((compound, i) => (
            <span key={i} title={tyreOf(compound).name}>
              <TyreDot color={tyreOf(compound).color} size={9} />
            </span>
          ))}
        </span>
      ),
    },
    { key: "led", label: "LAPS LED", sort: (r) => r.led, cell: (r) => r.led },
    {
      key: "traffic",
      label: "IN TRAFFIC",
      sort: (r) => r.traffic,
      cell: (r) => `${r.traffic.toFixed(0)}%`,
    },
    { key: "drs", label: "DRS LAPS", sort: (r) => r.drsLaps, cell: (r) => r.drsLaps },
    {
      key: "top",
      label: "TOP km/h",
      sort: (r) => r.top ?? 0,
      cell: (r) => dash(r.top),
      color: (r) => (r.top !== null && r.top === topSpeed ? "var(--color-best)" : undefined),
    },
    { key: "i1", label: "I1", sort: (r) => r.i1 ?? 0, cell: (r) => dash(r.i1) },
    { key: "i2", label: "I2", sort: (r) => r.i2 ?? 0, cell: (r) => dash(r.i2) },
    { key: "fl", label: "FL", sort: (r) => r.fl ?? 0, cell: (r) => dash(r.fl) },
    { key: "st", label: "ST", sort: (r) => r.st ?? 0, cell: (r) => dash(r.st) },
    {
      key: "throttle",
      label: "THROTTLE %",
      sort: (r) => r.throttle ?? 0,
      cell: (r) => dash(r.throttle, 1),
    },
    {
      key: "braking",
      label: "BRAKING %",
      sort: (r) => r.braking ?? 0,
      cell: (r) => dash(r.braking, 1),
    },
    {
      key: "shifts",
      label: "SHIFTS/LAP",
      sort: (r) => r.shifts ?? 0,
      cell: (r) => dash(r.shifts, 1),
    },
  ];
}

type Props = {
  rows: DriverRow[];
  selected: string[];
  onToggle: (code: string) => void;
};

export function Classification({ rows, selected, onToggle }: Props) {
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 }>({
    key: "pos",
    direction: 1,
  });
  const fastest = Math.min(...rows.map((r) => r.best ?? Infinity));
  const topSpeed = Math.max(...rows.map((r) => r.top ?? 0));
  const cols = columns(Number.isFinite(fastest) ? fastest : null, topSpeed || null);
  const active = cols.find((c) => c.key === sort.key) ?? cols[0];
  const ordered = [...rows].sort((a, b) => {
    const va = active.sort(a);
    const vb = active.sort(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.direction;
  });

  return (
    <div className="max-h-[560px] overflow-auto max-[1179px]:max-h-none">
      <Table className="min-w-[1600px]">
        <thead>
          <tr>
            {cols.map((col) => (
              <Th
                key={col.key}
                left={col.left}
                title="Sort"
                className="cursor-pointer"
                style={{ color: sort.key === col.key ? "var(--color-ink)" : undefined }}
                onClick={() =>
                  setSort({
                    key: col.key,
                    direction: sort.key === col.key ? (-sort.direction as 1 | -1) : 1,
                  })
                }
              >
                {col.label}
                {sort.key === col.key ? (sort.direction > 0 ? " ↑" : " ↓") : ""}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => {
            const code = row.run.driver_code;
            return (
              <tr
                key={code}
                onClick={() => onToggle(code)}
                className="cursor-pointer"
                style={{
                  background: selected.includes(code)
                    ? `color-mix(in srgb, ${row.run.color} 8%, transparent)`
                    : undefined,
                }}
              >
                {cols.map((col) =>
                  col.key === "code" ? (
                    <Td key={col.key} left text>
                      <span className="flex items-center gap-2">
                        <TeamBar color={row.run.color} height={16} />
                        <b>{code}</b>
                        <span className="text-[11.5px] text-ink-mute">{row.run.name}</span>
                        <span className="text-[11px] text-ink-faint">{row.run.team}</span>
                      </span>
                    </Td>
                  ) : (
                    <Td
                      key={col.key}
                      left={col.left}
                      text={col.left}
                      style={{ color: col.color?.(row) }}
                    >
                      {col.cell(row)}
                    </Td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
