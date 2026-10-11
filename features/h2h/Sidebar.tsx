"use client";

import { TyreStrip } from "@/components/ui/TyreStrip";
import { cn } from "@/components/ui/cn";
import { TyreDot } from "@/components/ui/Swatch";
import { fmtLap, hexAlpha } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Run, Standing } from "@/lib/race/timeline";

type Props = {
  slot: "A" | "B";
  x: Standing;
  /** Line colour of this driver in the charts. */
  lineColor: string;
  runs: Run[];
  otherCode: string;
  totalLaps: number;
  onPick: (code: string) => void;
};

const gradient = (color: string) =>
  `linear-gradient(150deg,${color} 0%,${hexAlpha(color, 0.45)} 52%,#141416 100%)`;

function DriverCard({ slot, x, lineColor, runs, otherCode, totalLaps, onPick }: Props) {
  const { run } = x;
  const change = (run.grid_position ?? x.position) - x.position;
  const last = x.completed >= 1 ? run.laps[x.completed - 1] : null;
  const tyre = tyreOf(x.lap.compound);

  return (
    <div className="border-b border-divider">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div
          className="grid size-[46px] flex-none place-items-center rounded-[10px] font-display text-[15px]"
          style={{ background: gradient(run.color) }}
        >
          {run.driver_number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-ink-mute">Driver {slot}</div>
          <div className="truncate text-[15px] font-bold">{run.name}</div>
          <div className="text-[11.5px] text-ink-mute">{run.team}</div>
        </div>
        <span className="h-[3px] w-[22px] rounded-sm" style={{ background: lineColor }} />
      </div>

      <div className="grid grid-cols-3 gap-2 px-3.5 pb-3">
        <div>
          <div className="text-[11px] text-ink-mute">Position</div>
          <div className="mt-0.5 flex items-baseline gap-[5px]">
            <span className="font-cond text-[22px] font-bold leading-none">P{x.position}</span>
            <span
              className="text-[11px] font-semibold"
              style={{
                color:
                  change > 0
                    ? "var(--color-go)"
                    : change < 0
                      ? "var(--color-stop)"
                      : "var(--color-ink-mute)",
              }}
            >
              {change > 0 ? `▲${change}` : change < 0 ? `▼${-change}` : "–"}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-ink-mute">Last lap</div>
          <div className="mt-[5px] font-mono text-[12.5px] font-semibold">
            {fmtLap(last?.lap_time_sec)}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-ink-mute">Tyre</div>
          <div className="mt-[5px] flex items-center gap-[5px] whitespace-nowrap text-[12.5px] font-semibold">
            <TyreDot color={tyre.color} size={9} />
            {x.inPit ? "In pit" : `${tyre.name} · ${x.lap.tyre_life ?? "–"}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 px-3.5 pb-3">
        {runs.map((candidate) => {
          const current = candidate.driver_code === run.driver_code;
          const disabled = candidate.driver_code === otherCode;
          return (
            <button
              key={candidate.driver_code}
              type="button"
              title={candidate.name}
              disabled={disabled}
              onClick={() => onPick(candidate.driver_code)}
              className={cn(
                "cursor-pointer rounded-md border py-1.5 text-[11px] font-bold",
                current
                  ? "border-ink-faint bg-pressed text-white"
                  : "border-hairline bg-inset text-ink-dim",
                disabled && "opacity-30",
              )}
              style={{ boxShadow: `inset 0 2px 0 ${candidate.color}` }}
            >
              {candidate.driver_code}
            </button>
          );
        })}
      </div>

      <div className="px-3.5 pb-3.5">
        <div className="text-[11px] text-ink-mute">Strategy</div>
        <TyreStrip
          stints={run.stints}
          totalLaps={totalLaps}
          currentLap={x.currentLap}
          distance={x.distance}
          className="h-[18px]"
        />
      </div>
    </div>
  );
}

export function Sidebar({
  a,
  b,
  colors,
  runs,
  totalLaps,
  onA,
  onB,
}: {
  a: Standing;
  b: Standing;
  colors: readonly [string, string];
  runs: Run[];
  totalLaps: number;
  onA: (code: string) => void;
  onB: (code: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-auto rounded-xl border border-line bg-panel [grid-area:left]">
      <DriverCard
        slot="A"
        x={a}
        lineColor={colors[0]}
        runs={runs}
        otherCode={b.run.driver_code}
        totalLaps={totalLaps}
        onPick={onA}
      />
      <DriverCard
        slot="B"
        x={b}
        lineColor={colors[1]}
        runs={runs}
        otherCode={a.run.driver_code}
        totalLaps={totalLaps}
        onPick={onB}
      />
    </aside>
  );
}
