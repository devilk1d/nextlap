"use client";

import { LiveOrder } from "@/features/common/LiveOrder";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { analyzeBattle } from "./battle";
import { BattleHero } from "./BattleHero";
import { GapChart, LapTimesChart } from "./H2HCharts";
import { Sidebar } from "./Sidebar";
import { Summary } from "./Summary";

export function H2HView() {
  const { timeline, compare } = useRace();
  const frame = useFrame();
  const a = frame.byCode.get(compare.a);
  const b = frame.byCode.get(compare.b);
  if (!a || !b) return null;
  const battle = analyzeBattle(frame, timeline.totalLaps, a, b);

  return (
    <>
      <Sidebar
        a={a}
        b={b}
        colors={[battle.colorA, battle.colorB]}
        runs={timeline.runs}
        totalLaps={timeline.totalLaps}
        onA={compare.setA}
        onB={compare.setB}
      />
      <main className="flex min-h-0 min-w-0 flex-col gap-2 [grid-area:main]">
        <BattleHero battle={battle} frame={frame} />
        <LapTimesChart battle={battle} />
        <GapChart battle={battle} />
      </main>
      <aside className="flex min-h-0 flex-col gap-2 [grid-area:right] wide:overflow-auto">
        <LiveOrder
          standings={frame.standings}
          highlight={new Set([compare.a, compare.b])}
          onPick={(code) => code !== compare.a && compare.setB(code)}
        />
        <Summary battle={battle} />
      </aside>
    </>
  );
}
