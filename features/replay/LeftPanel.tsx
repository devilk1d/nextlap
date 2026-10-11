"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { TeamBar } from "@/components/ui/Swatch";
import { fmtGap, fmtLap, fmtLapsDown, fmtSigned, hexAlpha, stripGrandPrix } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Standing } from "@/lib/race/timeline";
import { DriverMenu } from "@/features/common/DriverMenu";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { focusOf, type Focus } from "./focus";
import { LapTabs } from "./LapTabs";

const MUTED = "var(--color-ink-mute)";
const GO = "var(--color-go)";
const STOP = "var(--color-stop)";

const gradient = (color: string) =>
  `linear-gradient(150deg,${color} 0%,${hexAlpha(color, 0.45)} 52%,#141416 100%)`;

function trendAhead(x: Standing): [string, string] {
  const { run, completed, ahead, lapsAhead } = x;
  if (!ahead) return ["Leading the race", GO];
  const now = run.laps[completed - 1];
  const before = run.laps[completed - 2];
  const sameCar =
    now &&
    before &&
    now.driver_ahead === before.driver_ahead &&
    now.driver_ahead === ahead.run.driver_code;
  if (!sameCar || lapsAhead || now.gap_ahead_sec === null || before.gap_ahead_sec === null) {
    return ["Trend after 2 laps", MUTED];
  }
  const delta = now.gap_ahead_sec - before.gap_ahead_sec;
  if (Math.abs(delta) < 0.05) return ["Holding the gap", MUTED];
  return delta < 0
    ? [`Closing ${(-delta).toFixed(2)} s/lap`, GO]
    : [`Losing ${delta.toFixed(2)} s/lap`, STOP];
}

function trendBehind(x: Standing): [string, string] {
  const { run, completed, behind } = x;
  if (!behind) return ["Last car", MUTED];
  const now = run.laps[completed - 1];
  const before = run.laps[completed - 2];
  if (!now || !before || now.gap_behind_sec === null || before.gap_behind_sec === null) {
    return ["Trend after 2 laps", MUTED];
  }
  const delta = now.gap_behind_sec - before.gap_behind_sec;
  if (Math.abs(delta) < 0.05) return ["Gap steady", MUTED];
  return delta < 0
    ? [`Being caught ${(-delta).toFixed(2)} s/lap`, STOP]
    : [`Pulling away ${delta.toFixed(2)} s/lap`, GO];
}

function statusLine(x: Standing): [string, string] {
  const { ahead, behind, gapAhead, gapBehind, lapsAhead, lapsBehind } = x;
  if (x.retired) return [`Retired · ${x.run.status ?? "DNF"} · L${x.lapCount + 1}`, STOP];
  if (x.done)
    return [
      `Finished P${x.position}${x.lapsDown >= 1 ? ` · ${fmtLapsDown(x.lapsDown)}` : ""}`,
      "var(--color-accent)",
    ];
  if (x.inPit) return ["In the pit lane", "var(--color-caution)"];
  if (ahead && !lapsAhead && (gapAhead ?? 9) < 1) {
    return [`Within 1 s of ${ahead.run.driver_code} — in DRS range`, "var(--color-accent)"];
  }
  if (behind && !lapsBehind && (gapBehind ?? 9) < 1) {
    return [`Defending — ${behind.run.driver_code} within 1 s`, STOP];
  }
  if (x.position === 1) return ["Leading in clean air", GO];
  return (gapAhead ?? 9) < 2
    ? ["Close behind — dirty air costs pace", "var(--color-caution)"]
    : ["Clean air — free to push", GO];
}

function Dot({
  left,
  color,
  size,
  ring,
  label,
  labelColor,
}: {
  left: number;
  color: string;
  size: number;
  ring: string;
  label: string;
  labelColor: string;
}) {
  return (
    <div
      className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ left: `${left}%` }}
    >
      <span
        className="rounded-full"
        style={{
          width: size,
          height: size,
          marginTop: (14 - size) / 2,
          background: color,
          boxShadow: `0 0 0 2px ${ring}`,
        }}
      />
      <span className="text-[10.5px] font-bold" style={{ color: labelColor }}>
        {label}
      </span>
    </div>
  );
}

function GapBlock({ x }: { x: Standing }) {
  const [aTrend, aTrendColor] = trendAhead(x);
  const [bTrend, bTrendColor] = trendBehind(x);
  const [status, statusColor] = statusLine(x);
  const { ahead, behind, gapAhead, gapBehind, lapsAhead, lapsBehind } = x;
  const closeAhead = ahead && !lapsAhead && (gapAhead ?? 9) < 1;
  const closeBehind = behind && !lapsBehind && (gapBehind ?? 9) < 1;

  return (
    <div className="flex-none border-b border-divider px-3.5 pb-2.5 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[.08em] text-ink-mute">GAP AHEAD</div>
          <div
            className="mt-[5px] font-cond text-[30px] font-semibold leading-none"
            style={{ color: closeAhead ? "var(--color-accent)" : undefined }}
          >
            {!ahead ? "—" : lapsAhead ? fmtLapsDown(lapsAhead) : fmtGap(gapAhead ?? 0)}
          </div>
          <div className="mt-[5px] flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold">
            <TeamBar color={ahead?.run.color ?? "transparent"} height={13} />
            {ahead ? `P${ahead.position} ${ahead.run.driver_code}` : "No car ahead"}
          </div>
          <div className="mt-[3px] text-[11.5px]" style={{ color: aTrendColor }}>
            {aTrend}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[11px] font-bold tracking-[.08em] text-ink-mute">GAP BEHIND</div>
          <div
            className="mt-[5px] font-cond text-[30px] font-semibold leading-none"
            style={{ color: closeBehind ? "var(--color-stop)" : undefined }}
          >
            {!behind
              ? "—"
              : lapsBehind
                ? fmtLapsDown(lapsBehind)
                : `−${(gapBehind ?? 0).toFixed(3)}`}
          </div>
          <div className="mt-[5px] flex items-center justify-end gap-1.5 whitespace-nowrap text-[12px] font-semibold">
            {behind ? `P${behind.position} ${behind.run.driver_code}` : "No car behind"}
            <TeamBar color={behind?.run.color ?? "transparent"} height={13} />
          </div>
          <div className="mt-[3px] text-[11.5px]" style={{ color: bTrendColor }}>
            {bTrend}
          </div>
        </div>
      </div>

      <div className="relative mt-3 h-[38px]">
        <div className="absolute inset-x-0 top-[7px] border-t border-control" />
        <div className="absolute left-[39%] top-0 h-[15px] w-[22%] rounded bg-accent/13" />
        <Dot
          left={50}
          color={x.run.color}
          size={14}
          ring="#fff"
          label={x.run.driver_code}
          labelColor="#fff"
        />
        {ahead && !lapsAhead && (
          <Dot
            left={50 + (Math.min(gapAhead ?? 0, 4) / 4) * 46}
            color={ahead.run.color}
            size={10}
            ring="#17171a"
            label={ahead.run.driver_code}
            labelColor="#c9c9cf"
          />
        )}
        {behind && !lapsBehind && (
          <Dot
            left={50 - (Math.min(gapBehind ?? 0, 4) / 4) * 46}
            color={behind.run.color}
            size={10}
            ring="#17171a"
            label={behind.run.driver_code}
            labelColor="#c9c9cf"
          />
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10.5px] text-ink-mute">
        <span>← behind · 4 s</span>
        <span className="text-accent">±1 s DRS</span>
        <span>ahead · 4 s →</span>
      </div>
      <div
        className="mt-2.5 rounded-lg bg-raised px-2.5 py-[7px] text-[12px] font-semibold"
        style={{ color: statusColor }}
      >
        {status}
      </div>
    </div>
  );
}

function Stat({
  name,
  value,
  color,
  sub,
  subColor,
}: {
  name: string;
  value: string;
  color?: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] text-ink-mute">{name}</div>
      <div className="mt-[3px] whitespace-nowrap text-[15px] font-bold" style={{ color }}>
        {value}
      </div>
      <div
        className="mt-0.5 truncate whitespace-nowrap text-[11px]"
        style={{ color: subColor ?? MUTED }}
      >
        {sub}
      </div>
    </div>
  );
}

function flagLabel(flag: string) {
  const lower = flag.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)} lap`;
}

function StatsGrid({
  x,
  focus,
  totalLaps,
  leaderCode,
  runnerUp,
}: {
  x: Standing;
  focus: Focus;
  totalLaps: number;
  leaderCode: string;
  runnerUp: Standing | undefined;
}) {
  const { lastLap, best, stint } = focus;
  const { run, currentLap, done } = x;
  const personalBest = lastLap?.clean && best && lastLap.lap_time_sec === best.lap_time_sec;
  const lastStop = run.stints.filter((s) => s.index > 0 && s.start <= currentLap).at(-1);

  return (
    <div className="grid flex-none grid-cols-2 gap-x-3.5 gap-y-3 border-b border-divider px-3.5 py-3">
      <Stat
        name="Gap to leader"
        value={
          x.position === 1
            ? "Leader"
            : x.lapsDown >= 1
              ? fmtLapsDown(x.lapsDown)
              : `${fmtGap(x.toLeader)} s`
        }
        sub={
          x.position === 1 && runnerUp
            ? `${runnerUp.run.driver_code} ${runnerUp.lapsAhead ? fmtLapsDown(runnerUp.lapsAhead) : `+${(runnerUp.gapAhead ?? 0).toFixed(1)} s`} behind`
            : `Leader: ${leaderCode}`
        }
      />
      <Stat
        name="Lap"
        value={done ? `${totalLaps} / ${totalLaps}` : `${currentLap} / ${totalLaps}`}
        sub={done ? "Finished" : `${totalLaps - currentLap} to go`}
      />
      <Stat
        name="Last lap"
        value={fmtLap(lastLap?.lap_time_sec)}
        color={personalBest ? "var(--color-best)" : undefined}
        sub={
          !lastLap
            ? ""
            : lastLap.flag
              ? flagLabel(lastLap.flag)
              : personalBest
                ? "Personal best"
                : best
                  ? `${fmtSigned((lastLap.lap_time_sec ?? 0) - (best.lap_time_sec ?? 0))} vs best`
                  : ""
        }
        subColor={personalBest ? "var(--color-best)" : undefined}
      />
      <Stat
        name="Best lap"
        value={fmtLap(best?.lap_time_sec)}
        sub={best ? `Set on L${best.lap_number}` : ""}
      />
      <Stat
        name="Stint"
        value={`${stint.index + 1} of ${run.stints.length}`}
        sub={`${tyreOf(stint.compound).name} · L${stint.start}–${stint.end}`}
      />
      <Stat
        name="Pit stops"
        value={String(x.pitStops)}
        sub={lastStop ? `Last stop on L${lastStop.start - 1}` : "No stops yet"}
      />
    </div>
  );
}

export function LeftPanel() {
  const { race, timeline, driver, setDriver } = useRace();
  const frame = useFrame();
  const x = frame.byCode.get(driver.driver_code);
  if (!x) return null;
  const focus = focusOf(x);
  const change = (x.run.grid_position ?? x.position) - x.position;

  return (
    <aside className="flex min-h-0 flex-col overflow-auto rounded-xl border border-line bg-panel [grid-area:left]">
      <div className="flex items-center justify-between border-b border-divider px-3.5 py-2.5">
        <Dropdown
          width={280}
          triggerClassName="border-0 bg-transparent p-0"
          trigger="Change driver"
        >
          {(close) => (
            <DriverMenu
              runs={timeline.runs}
              current={driver.driver_code}
              onPick={(code) => {
                setDriver(code);
                close();
              }}
            />
          )}
        </Dropdown>
        <span className="whitespace-nowrap text-[11.5px] text-ink-mute">
          {race.year} · {stripGrandPrix(race.event_name)}
        </span>
      </div>

      <div className="grid flex-none grid-cols-[104px_minmax(0,1fr)] border-b border-divider">
        <div
          className="relative h-[104px] overflow-hidden"
          style={{ background: gradient(x.run.color) }}
        >
          <span className="absolute left-2.5 top-2.5 text-[11px] font-bold tracking-[.12em]">
            {x.run.driver_code}
          </span>
          <span className="absolute bottom-1.5 left-2 font-display text-[40px] leading-none text-white/95">
            {x.run.driver_number}
          </span>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-1 px-3.5 py-3">
          <div className="truncate text-[16px] font-bold">{x.run.name}</div>
          <div className="text-[12px] text-ink-mute">{x.run.team}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-cond text-[30px] font-bold leading-none">P{x.position}</span>
            <span
              className="text-[12px] font-semibold"
              style={{ color: change > 0 ? GO : change < 0 ? STOP : MUTED }}
            >
              {change > 0
                ? `▲ ${change} from grid P${x.run.grid_position}`
                : change < 0
                  ? `▼ ${-change} from grid P${x.run.grid_position}`
                  : `Started P${x.run.grid_position ?? "–"}`}
            </span>
          </div>
        </div>
      </div>

      <GapBlock x={x} />
      <StatsGrid
        x={x}
        focus={focus}
        totalLaps={timeline.totalLaps}
        leaderCode={frame.leader.run.driver_code}
        runnerUp={frame.standings[1]}
      />
      <LapTabs x={x} focus={focus} time={frame.time} />
    </aside>
  );
}
