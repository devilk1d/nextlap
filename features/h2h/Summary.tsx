import { fmtLap } from "@/lib/format";
import { tyreOf } from "@/lib/race/constants";
import type { Standing } from "@/lib/race/timeline";
import { bestLapOf, lapsInRange, type Battle } from "./battle";

type Row = { name: string; a: string; b: string; wins: "a" | "b" | null };

/** Winner of a numeric row: lower is better unless `lowIsGood` is false. */
function winner(a: number | null, b: number | null, lowIsGood = true): Row["wins"] {
  if (a === null || b === null || a === b) return null;
  return a < b === lowIsGood ? "a" : "b";
}

function statRows(a: Standing, b: Standing, battle: Battle): Row[] {
  const gridDelta = (x: Standing) => (x.run.grid_position ?? x.position) - x.position;
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const used = (x: Standing) =>
    x.run.stints
      .filter((s) => s.start <= x.currentLap)
      .map((s) => tyreOf(s.compound).short)
      .join("–");
  const bestA = bestLapOf(a);
  const bestB = bestLapOf(b);
  return [
    {
      name: "Position",
      a: `P${a.position}`,
      b: `P${b.position}`,
      wins: winner(a.position, b.position),
    },
    {
      name: "Places vs grid",
      a: signed(gridDelta(a)),
      b: signed(gridDelta(b)),
      wins: winner(gridDelta(a), gridDelta(b), false),
    },
    { name: "Best lap", a: fmtLap(bestA), b: fmtLap(bestB), wins: winner(bestA, bestB) },
    {
      name: "Median lap",
      a: fmtLap(battle.medianA),
      b: fmtLap(battle.medianB),
      wins: winner(battle.medianA, battle.medianB),
    },
    { name: "Laps within 1 s", a: String(lapsInRange(a)), b: String(lapsInRange(b)), wins: null },
    { name: "Pit stops", a: String(a.pitStops), b: String(b.pitStops), wins: null },
    { name: "Tyres used", a: used(a), b: used(b), wins: null },
  ];
}

export function Summary({ battle }: { battle: Battle }) {
  const { a, b, colorA, colorB, medianA, medianB } = battle;
  const rows = statRows(a, b, battle);
  const paceDelta = medianA !== null && medianB !== null ? Math.abs(medianB - medianA) : null;
  const quicker = medianA !== null && medianB !== null ? (medianB > medianA ? a : b) : null;

  return (
    <>
      <section className="flex-none overflow-hidden rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[.1em] text-accent">
            MEDIAN RACE PACE
          </span>
          <span className="whitespace-nowrap text-[11.5px] text-ink-mute">So far</span>
        </div>
        <div className="mt-3.5 font-cond text-[44px] font-semibold leading-none">
          {paceDelta === null ? "—" : paceDelta.toFixed(3)}
          <span className="text-[16px] text-ink-mute"> s / lap</span>
        </div>
        <div className="mt-1.5 text-[12.5px] text-ink-dim">
          {quicker
            ? `${quicker.run.driver_code} quicker on median clean-lap pace`
            : "Waiting for clean laps"}
        </div>
      </section>

      <section className="flex-[1_0_auto] overflow-hidden rounded-xl border border-line bg-panel">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-divider px-3.5 py-2.5 text-[12.5px] font-bold">
          <span style={{ color: colorA }}>{a.run.driver_code}</span>
          <span className="text-[11.5px] font-semibold text-ink-mute">Comparison</span>
          <span className="text-right" style={{ color: colorB }}>
            {b.run.driver_code}
          </span>
        </div>
        {rows.map((row) => (
          <div
            key={row.name}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-rowline px-3.5 py-2.5"
          >
            <span
              className="font-mono text-[12px]"
              style={{
                color:
                  row.wins === "a"
                    ? "#ffffff"
                    : row.wins === "b"
                      ? "var(--color-ink-mute)"
                      : undefined,
              }}
            >
              {row.a}
            </span>
            <span className="text-center text-[11.5px] text-ink-mute">{row.name}</span>
            <span
              className="text-right font-mono text-[12px]"
              style={{
                color:
                  row.wins === "b"
                    ? "#ffffff"
                    : row.wins === "a"
                      ? "var(--color-ink-mute)"
                      : undefined,
              }}
            >
              {row.b}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
