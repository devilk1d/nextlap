import { Plot } from "@/components/charts/Plot";
import { Legend } from "@/components/ui/Legend";
import { Swatch, TeamBar, TyreDot } from "@/components/ui/Swatch";
import { Table, Td, Th } from "@/components/ui/Table";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { DRY_COMPOUNDS, EVENT, tyreOf } from "@/lib/race/constants";
import { niceTicks, percentOf, quantileSorted } from "@/lib/stats";
import type {
  CompoundFits,
  CompoundRow,
  DegradationPoint,
  PitStop,
  StintRow,
  TeamPit,
} from "./analysis";

const SLOPE_NOTE = "Net lap-time trend per lap of tyre life; fuel burn-off is included.";

const signed = (value: number, digits = 3) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

export function DegradationChart({
  points,
  fits,
  focusCode,
}: {
  points: DegradationPoint[];
  fits: CompoundFits;
  focusCode: string;
}) {
  if (points.length < 8) {
    return (
      <div className="py-5 text-[12px] text-ink-mute">
        Not enough clean laps yet — move the replay forward.
      </div>
    );
  }
  const seconds = points.map((p) => p.seconds).sort((a, b) => a - b);
  const yMin = (quantileSorted(seconds, 0.02) ?? 0) - 0.2;
  const yMax = (quantileSorted(seconds, 0.98) ?? 1) + 0.2;
  const ageMax = Math.max(...points.map((p) => p.age)) + 1;
  const toX = (age: number) => percentOf(age, 0, ageMax);

  return (
    <div>
      <Plot height={230} yMin={yMin} yMax={yMax} yFormat={fmtLapAxis}>
        {(toY) => (
          <>
            {niceTicks(0, ageMax, 6).map((age) => (
              <span
                key={age}
                className="absolute -bottom-[19px] -translate-x-1/2 font-mono text-[10.5px] text-ink-mute"
                style={{ left: `${toX(age)}%` }}
              >
                {age}
              </span>
            ))}
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              {DRY_COMPOUNDS.map((compound) => {
                const fit = fits[compound];
                if (!fit) return null;
                return (
                  <line
                    key={compound}
                    x1={toX(fit.xMin) * 10}
                    y1={toY(fit.intercept + fit.slope * fit.xMin) * 10}
                    x2={toX(fit.xMax) * 10}
                    y2={toY(fit.intercept + fit.slope * fit.xMax) * 10}
                    style={{
                      stroke: tyreOf(compound).color,
                      strokeWidth: 2.5,
                      vectorEffect: "non-scaling-stroke",
                    }}
                  />
                );
              })}
            </svg>
            {points
              .filter((p) => p.seconds >= yMin && p.seconds <= yMax)
              .map((p) => {
                const mine = p.code === focusCode;
                const color = tyreOf(p.compound).color;
                return (
                  <span
                    key={`${p.code}-${p.lap}`}
                    title={`${p.code} · L${p.lap} · ${tyreOf(p.compound).name} age ${p.age} · ${fmtLapAxis(p.seconds)}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${toX(p.age)}%`,
                      top: `${toY(p.seconds)}%`,
                      width: mine ? 8 : 5,
                      height: mine ? 8 : 5,
                      zIndex: mine ? 2 : 1,
                      background: mine ? color : `color-mix(in srgb, ${color} 35%, transparent)`,
                      boxShadow: mine ? "0 0 0 2px #17171a, 0 0 0 3px var(--color-accent)" : "none",
                    }}
                  />
                );
              })}
            <span className="absolute -bottom-[19px] right-0 text-[10.5px] text-ink-mute">
              tyre life (laps) →
            </span>
          </>
        )}
      </Plot>
      <Legend
        items={[
          ...DRY_COMPOUNDS.map<[React.ReactNode, React.ReactNode]>((compound) => [
            <Swatch key={compound} color={tyreOf(compound).color} size={[14, 3]} radius={1} />,
            `${tyreOf(compound).name} ${fits[compound] ? `${signed(fits[compound].slope)} s/lap · ${fits[compound].n} laps` : "· not enough laps"}`,
          ]),
          [
            <span
              key="me"
              className="size-2 rounded-full shadow-[0_0_0_2px_var(--color-accent)]"
            />,
            focusCode,
          ],
          [null, SLOPE_NOTE],
        ]}
      />
    </div>
  );
}

export function PitStopsTable({ stops, focusCode }: { stops: PitStop[]; focusCode: string }) {
  if (!stops.length) return <div className="text-[12px] text-ink-mute">No pit stops yet.</div>;
  const fastest = Math.min(...stops.map((s) => s.laneSeconds ?? Infinity));
  return (
    <div className="max-h-[320px] overflow-auto">
      <Table>
        <thead>
          <tr>
            {["LAP", "DRIVER", "TYRES", "STINT", "PIT LANE", "LOSS", "POS", "NOTE"].map(
              (name, i) => (
                <Th key={name} left={i === 1 || i === 7}>
                  {name}
                </Th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {stops.map((stop) => {
            const gained = (stop.positionBefore ?? 0) - (stop.positionAfter ?? 0);
            return (
              <tr
                key={`${stop.code}-${stop.lap}`}
                className={stop.code === focusCode ? "bg-accent/8" : undefined}
              >
                <Td>L{stop.lap}</Td>
                <Td left text>
                  <span className="flex items-center gap-1.5">
                    <TeamBar color={stop.color} />
                    <b>{stop.code}</b>
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <TyreDot color={tyreOf(stop.from).color} />→
                    <TyreDot color={tyreOf(stop.to).color} />
                  </span>
                </Td>
                <Td>{stop.stintLaps} laps</Td>
                <Td className={stop.laneSeconds === fastest ? "text-best" : undefined}>
                  {stop.laneSeconds === null ? "—" : `${stop.laneSeconds.toFixed(1)} s`}
                </Td>
                <Td>{stop.lossSeconds === null ? "—" : `${stop.lossSeconds.toFixed(1)} s`}</Td>
                <Td
                  className={gained > 0 ? "text-go" : gained < 0 ? "text-stop" : "text-ink-mute"}
                >{`P${stop.positionBefore ?? "–"}→P${stop.positionAfter ?? "–"}`}</Td>
                <Td
                  left
                  text
                  style={{ color: stop.under ? EVENT[stop.under].color : "var(--color-ink-mute)" }}
                >
                  {stop.under ? `Under ${stop.under}` : ""}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

export function TeamPitLane({ teams }: { teams: TeamPit[] }) {
  if (!teams.length) return <div className="text-[12px] text-ink-mute">No pit stops yet.</div>;
  const lo = Math.min(...teams.map((t) => t.best)) - 0.5;
  const hi = Math.max(...teams.map((t) => t.median)) + 0.5;
  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {teams.map((team, i) => (
          <div
            key={team.team}
            className="grid grid-cols-[100px_minmax(0,1fr)_92px] items-center gap-2 text-[12px]"
          >
            <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <TeamBar color={team.color} />
              {team.team}
            </span>
            <div className="relative h-3 rounded-[3px] bg-inset">
              <div
                className="absolute inset-y-0 left-0 rounded-[3px] opacity-85"
                style={{ width: `${percentOf(team.best, lo, hi)}%`, background: team.color }}
              />
              <div
                className="absolute -inset-y-0.5 border-l-2 border-white"
                style={{ left: `${percentOf(team.median, lo, hi)}%` }}
              />
            </div>
            <span className={`text-right font-mono ${i ? "text-ink" : "text-best"}`}>
              {team.best.toFixed(1)} · {team.median.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <Legend
        items={[
          [<Swatch key="b" color="#c9c9cf" size={[14, 8]} />, "Best pit-lane time"],
          [<span key="m" className="h-2.5 w-0.5 bg-white" />, "Median"],
          [null, "Pit lane = PitOutTime − PitInTime"],
        ]}
      />
    </div>
  );
}

export function CompoundTable({ rows }: { rows: CompoundRow[] }) {
  const fastest = Math.min(...rows.map((r) => r.medianSeconds ?? Infinity));
  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            {["TYRE", "STINTS", "AVG LEN", "LAPS", "PACE", "TREND"].map((name, i) => (
              <Th key={name} left={i === 0}>
                {name}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.compound}>
              <Td left text>
                <span className="flex items-center gap-1.5">
                  <TyreDot color={tyreOf(row.compound).color} size={9} />
                  {tyreOf(row.compound).name}
                </span>
              </Td>
              <Td>{row.stints}</Td>
              <Td>{row.averageLength?.toFixed(1) ?? "—"}</Td>
              <Td>{row.laps}</Td>
              <Td>
                {row.medianSeconds === null
                  ? "—"
                  : row.medianSeconds === fastest
                    ? "fastest"
                    : `+${(row.medianSeconds - fastest).toFixed(3)}`}
              </Td>
              <Td>{row.slope === null ? "—" : signed(row.slope)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export function StintsTable({ rows }: { rows: StintRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          {["STINT", "LAPS", "BEST", "AVG", "TREND"].map((name, i) => (
            <Th key={name} left={i === 0}>
              {name}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.index}>
            <Td left text>
              <span className="flex items-center gap-1.5">
                <TyreDot color={tyreOf(row.compound).color} size={9} />
                {`${row.index + 1} · L${row.start}–${row.end}`}
              </span>
            </Td>
            <Td>{row.laps}</Td>
            <Td>{row.best === null ? "—" : fmtLap(row.best)}</Td>
            <Td>{row.average === null ? "—" : fmtLap(row.average)}</Td>
            <Td>{row.slope === null ? "—" : signed(row.slope)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
