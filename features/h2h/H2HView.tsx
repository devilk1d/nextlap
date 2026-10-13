"use client";

import { Card } from "@/components/ui/Card";
import { LiveOrder } from "@/features/common/LiveOrder";
import { useFrame, useRace } from "@/features/dashboard/race-context";
import { analyzeBattle } from "./battle";
import { BattleHero } from "./BattleHero";
import { DuelData } from "./DuelData";
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
  const duel = (
    <DuelData a={a} b={b} colorA={battle.colorA} colorB={battle.colorB} time={frame.time} />
  );

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
      <main className="flex min-h-0 min-w-0 flex-col gap-2 [grid-area:main] wide:overflow-y-auto">
        <div className="flex gap-2 wide:min-h-[320px] wide:flex-[2.4_1_0]">
          <BattleHero battle={battle} frame={frame} />
          {/* Wide screens: car data of both drivers is a card of its own beside the hero. */}
          <aside className="hidden w-[262px] shrink-0 flex-col overflow-y-auto rounded-xl border border-line bg-stage p-3 min-[1450px]:flex">
            {duel}
          </aside>
        </div>
        <LapTimesChart battle={battle} />
        <GapChart battle={battle} />
      </main>
      <aside className="flex min-h-0 flex-col gap-2 [grid-area:right] wide:overflow-auto">
        <LiveOrder
          standings={frame.standings}
          highlight={new Set([compare.a, compare.b])}
          onPick={(code) => code !== compare.a && compare.setB(code)}
        />
        {/* Narrower screens: the same card moves into this panel. */}
        <Card title="Car data" sub="Both drivers" className="flex-none min-[1450px]:hidden">
          {duel}
        </Card>
        <Summary battle={battle} />
      </aside>
    </>
  );
}
