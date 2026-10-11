import { Plot } from "@/components/charts/Plot";
import { Legend } from "@/components/ui/Legend";
import { Swatch, TeamBar, TyreDot } from "@/components/ui/Swatch";
import { Table, Td, Th } from "@/components/ui/Table";
import { cn } from "@/components/ui/cn";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { DRY_COMPOUNDS, tyreOf } from "@/lib/race/constants";
import { mean } from "@/lib/stats";
import type { RaceSummary } from "@/server/races/types";

const HEADERS = [
  "SEASON",
  "DATE",
  "WINNER",
  "POLE",
  "FASTEST LAP",
  "MARGIN",
  "TOP-10 MEDIAN",
  "AVG STOPS",
  "WINNING TYRES",
  "SC · VSC · YEL",
  "DNF",
  "LEAD CHANGES",
  "PLACES GAINED*",
  "TRACK °C",
  "AIR °C",
];

const fixed = (value: number | null, digits: number) =>
  value === null ? "—" : value.toFixed(digits);

type TableProps = {
  seasons: RaceSummary[];
  currentYear: number;
  dates: Record<number, string>;
  raceIds: Record<number, number>;
  onOpen: (raceId: number) => void;
};

export function RaceTable({ seasons, currentYear, dates, raceIds, onOpen }: TableProps) {
  return (
    <div className="overflow-auto">
      <Table className="min-w-[1300px]">
        <thead>
          <tr>
            {HEADERS.map((name, i) => (
              <Th key={name} left={i < 5}>
                {name}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) =>
            s.predictable ? (
              <tr
                key={s.year}
                title="Open the race overview"
                onClick={() => onOpen(raceIds[s.year])}
                className={cn("cursor-pointer", s.year === currentYear && "bg-accent/8")}
              >
                <Td left className="font-bold">
                  {s.year}
                </Td>
                <Td left text>
                  {dates[s.year]}
                </Td>
                <Td left text>
                  {s.winner ? (
                    <span className="flex items-center gap-1.5">
                      <b>{s.winner.driver_code}</b>
                      <span className="text-ink-mute">{s.winner.team}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td left text>
                  {s.pole ? `${s.pole.driver_code} · ${fmtLap(s.pole.q_best_sec)}` : "—"}
                </Td>
                <Td left text>
                  {s.fastest_lap
                    ? `${s.fastest_lap.driver_code} · ${fmtLap(s.fastest_lap.lap_time_sec)}`
                    : "—"}
                </Td>
                <Td>
                  {s.winning_margin_sec === null ? "—" : `+${s.winning_margin_sec.toFixed(3)}`}
                </Td>
                <Td>{fmtLap(s.top10_median_lap_sec)}</Td>
                <Td>{fixed(s.avg_pit_stops, 2)}</Td>
                <Td>
                  <span className="inline-flex gap-[3px]">
                    {s.winning_strategy.map((compound, i) => (
                      <TyreDot key={i} color={tyreOf(compound).color} size={9} />
                    ))}
                  </span>
                </Td>
                <Td>{`${s.incidents.safety_car} · ${s.incidents.vsc} · ${s.incidents.yellow}`}</Td>
                <Td className={s.dnf_count ? "text-stop" : undefined}>{s.dnf_count}</Td>
                <Td>{s.lead_changes}</Td>
                <Td>{s.positions_gained}</Td>
                <Td>{fixed(s.mean_track_temp_c, 1)}</Td>
                <Td>{fixed(s.mean_air_temp_c, 1)}</Td>
              </tr>
            ) : (
              <tr key={s.year}>
                <Td left className="font-bold">
                  {s.year}
                </Td>
                <Td left text>
                  {dates[s.year]}
                </Td>
                <Td left text colSpan={HEADERS.length - 2} className="text-ink-mute">
                  Wet or not modelled — outside the dry-race scope of this dashboard
                </Td>
              </tr>
            ),
          )}
        </tbody>
      </Table>
      <div className="px-3.5 py-1.5 text-[11px] text-ink-mute">
        *Positions gained on track, excluding pit, start and flag laps · click a season to open its
        race overview
      </div>
    </div>
  );
}

export function PaceChart({ seasons }: { seasons: RaceSummary[] }) {
  const values = seasons
    .flatMap((s) => [s.top10_median_lap_sec, s.fastest_lap?.lap_time_sec ?? null])
    .filter((v): v is number => v !== null);
  if (!values.length) return null;
  const yMin = Math.min(...values) - 0.6;
  const yMax = Math.max(...values) + 0.4;

  return (
    <div>
      <Plot
        height={200}
        yMin={yMin}
        yMax={yMax}
        yFormat={fmtLapAxis}
        className="mb-6 ml-[52px] mr-2 mt-1.5"
      >
        {(toY) => (
          <div className="absolute inset-0 flex gap-[8%] px-[6%]">
            {seasons.map((s) => (
              <div key={s.year} className="relative flex-1">
                {s.top10_median_lap_sec !== null && s.fastest_lap && (
                  <div
                    className="absolute left-1/2 border-l-2 border-[#3a3a42]"
                    style={{
                      top: `${toY(s.top10_median_lap_sec)}%`,
                      bottom: `${100 - toY(s.fastest_lap.lap_time_sec)}%`,
                    }}
                  />
                )}
                {s.top10_median_lap_sec !== null && (
                  <div
                    title={`${s.year} · top-10 median ${fmtLap(s.top10_median_lap_sec)}`}
                    className="absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-accent shadow-[0_0_0_2px_#17171a]"
                    style={{ top: `${toY(s.top10_median_lap_sec)}%` }}
                  />
                )}
                {s.fastest_lap && (
                  <div
                    title={`${s.year} · fastest lap ${fmtLap(s.fastest_lap.lap_time_sec)} (${s.fastest_lap.driver_code})`}
                    className="absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-best shadow-[0_0_0_2px_#17171a]"
                    style={{ top: `${toY(s.fastest_lap.lap_time_sec)}%` }}
                  />
                )}
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10.5px] text-ink-mute">
                  {s.year}
                </span>
              </div>
            ))}
          </div>
        )}
      </Plot>
      <Legend
        items={[
          [
            <Swatch key="m" color="var(--color-accent)" size={[10, 10]} radius={3} />,
            "Top-10 median lap",
          ],
          [<span key="f" className="size-[9px] rounded-full bg-best" />, "Fastest lap"],
        ]}
      />
    </div>
  );
}

export function TrendChart({ seasons }: { seasons: RaceSummary[] }) {
  const peak = Math.max(
    0.05,
    ...seasons.flatMap((s) => DRY_COMPOUNDS.map((c) => Math.abs(s.degradation[c]?.slope ?? 0))),
  );
  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {seasons.map((s) => (
          <div key={s.year} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2.5">
            <span className="font-mono text-[12px] text-ink-soft">{s.year}</span>
            <div className="flex flex-col gap-[3px]">
              {DRY_COMPOUNDS.map((compound) => {
                const fit = s.degradation[compound];
                return (
                  <div
                    key={compound}
                    title={
                      fit
                        ? `${tyreOf(compound).name} · ${fit.slope >= 0 ? "+" : ""}${fit.slope.toFixed(3)} s/lap · ${fit.laps} laps`
                        : `${tyreOf(compound).name} · not used enough`
                    }
                    className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2"
                  >
                    <div className="relative h-2 rounded-[3px] bg-inset">
                      {fit && (
                        <div
                          className="absolute inset-y-0 rounded-[3px]"
                          style={{
                            left:
                              fit.slope < 0 ? `${50 - (Math.abs(fit.slope) / peak) * 50}%` : "50%",
                            width: `${(Math.abs(fit.slope) / peak) * 50}%`,
                            background: tyreOf(compound).color,
                          }}
                        />
                      )}
                      <div className="absolute -inset-y-0.5 left-1/2 border-l border-ink-faint" />
                    </div>
                    <span
                      className={cn("text-right font-mono text-[11px]", !fit && "text-ink-mute")}
                    >
                      {fit ? `${fit.slope >= 0 ? "+" : ""}${fit.slope.toFixed(3)}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Legend
        items={[
          ...DRY_COMPOUNDS.map<[React.ReactNode, React.ReactNode]>((c) => [
            <Swatch key={c} color={tyreOf(c).color} />,
            tyreOf(c).name,
          ]),
          [null, "Negative = lap times fall as fuel burns off faster than the tyre wears"],
        ]}
      />
    </div>
  );
}

export function UsageChart({ seasons }: { seasons: RaceSummary[] }) {
  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {seasons.map((s) => (
          <div
            key={s.year}
            className="grid grid-cols-[44px_minmax(0,1fr)_120px] items-center gap-2.5 text-[12px]"
          >
            <span className="font-mono text-ink-soft">{s.year}</span>
            <div className="flex h-3.5 gap-0.5">
              {DRY_COMPOUNDS.filter((c) => (s.compound_share[c] ?? 0) > 0).map((c) => (
                <div
                  key={c}
                  title={`${tyreOf(c).name} · ${((s.compound_share[c] ?? 0) * 100).toFixed(0)}% of laps`}
                  className="rounded-sm"
                  style={{
                    width: `${(s.compound_share[c] ?? 0) * 100}%`,
                    background: tyreOf(c).color,
                  }}
                />
              ))}
            </div>
            <span className="text-right text-ink-dim">
              {["1", "2", "3+"]
                .filter((k) => s.stops_distribution[k])
                .map((k) => `${s.stops_distribution[k]}× ${k}-stop`)
                .join(" · ")}
            </span>
          </div>
        ))}
      </div>
      <Legend
        items={[
          ...DRY_COMPOUNDS.map<[React.ReactNode, React.ReactNode]>((c) => [
            <Swatch key={c} color={tyreOf(c).color} />,
            tyreOf(c).name,
          ]),
          [null, "Share of laps · finishers by number of stops"],
        ]}
      />
    </div>
  );
}

export function DriverRecord({
  seasons,
  currentYear,
}: {
  seasons: RaceSummary[];
  currentYear: number;
}) {
  const roster = seasons.find((s) => s.year === currentYear)?.results ?? [];
  const dry = seasons.filter((s) => s.predictable);
  const rows = roster
    .map((driver) => {
      const results = dry.map(
        (s) => s.results.find((r) => r.driver_code === driver.driver_code) ?? null,
      );
      const finishes = results
        .filter((r) => r?.classified_position !== "R" && r?.finish_position != null)
        .map((r) => r?.finish_position as number);
      return {
        driver,
        results,
        best: finishes.length ? Math.min(...finishes) : null,
        average: mean(finishes),
      };
    })
    .sort((a, b) => (a.average ?? 99) - (b.average ?? 99));

  return (
    <div className="max-h-[420px] overflow-auto max-[1179px]:max-h-none">
      <Table>
        <thead>
          <tr>
            <Th left>DRIVER</Th>
            {dry.map((s) => (
              <Th key={s.year}>{s.year}</Th>
            ))}
            <Th>BEST</Th>
            <Th>AVG</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ driver, results, best, average }) => (
            <tr key={driver.driver_code}>
              <Td left text>
                <span className="flex items-center gap-[7px]">
                  <TeamBar color={driver.team_color ?? "#9a9aa3"} />
                  <b>{driver.driver_code}</b>
                  <span className="text-[11.5px] text-ink-mute">{driver.driver_name}</span>
                </span>
              </Td>
              {results.map((result, i) => {
                const retired = result?.classified_position === "R";
                const position = result?.finish_position ?? null;
                return (
                  <Td
                    key={i}
                    style={{
                      color: !result
                        ? "var(--color-ink-faint)"
                        : retired
                          ? "var(--color-stop)"
                          : position === 1
                            ? "var(--color-accent)"
                            : position !== null && position <= 3
                              ? "var(--color-ink)"
                              : "var(--color-ink-dim)",
                    }}
                  >
                    {!result ? "—" : retired ? "DNF" : `P${position}`}
                  </Td>
                );
              })}
              <Td>{best === null ? "—" : `P${best}`}</Td>
              <Td>{average === null ? "—" : average.toFixed(1)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
