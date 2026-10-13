import { Plot } from "@/components/charts/Plot";
import { Legend } from "@/components/ui/Legend";
import { Swatch, TeamBar, TyreDot } from "@/components/ui/Swatch";
import { Table, Td, Th } from "@/components/ui/Table";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { DRY_COMPOUNDS, EVENT, tyreOf } from "@/lib/race/constants";
import { niceTicks, percentOf, quantileSorted } from "@/lib/stats";
import { FUEL_EFFECT_PER_LAP } from "./analysis";
import type { CompoundFits, CompoundRow, DegradationPoint, PitStop, StintRow } from "./analysis";

const SLOPE_NOTE = `Wear per lap of tyre life: median of each driver's stints, fuel-corrected (${FUEL_EFFECT_PER_LAP} s/lap assumed).`;

const signed = (value: number, digits = 3) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

export function DegradationChart({
  points,
  fits,
  focusCode,
  fill = false,
}: {
  points: DegradationPoint[];
  fits: CompoundFits;
  focusCode: string;
  /** Take the height of the card (which must be a flex column) instead of a fixed 230 px. */
  fill?: boolean;
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
    <div className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <Plot
        height={fill ? undefined : 230}
        className={
          fill ? "mx-2 mb-6 mt-1.5 ml-[52px] min-h-[100px] flex-1" : "mx-2 mb-6 mt-1.5 ml-[52px]"
        }
        yMin={yMin}
        yMax={yMax}
        yFormat={fmtLapAxis}
      >
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
                    title={`${p.code} · L${p.lap} · ${tyreOf(p.compound).name} age ${p.age} · ${fmtLapAxis(p.seconds)} (fuel-corrected)`}
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

export function PitStopsTable({
  stops,
  focusCode,
  fill = false,
}: {
  stops: PitStop[];
  focusCode: string;
  /** Scroll inside the height of the card (a flex column) instead of a 320 px cap. */
  fill?: boolean;
}) {
  if (!stops.length) return <div className="text-[12px] text-ink-mute">No pit stops yet.</div>;
  const fastest = Math.min(...stops.map((s) => s.laneSeconds ?? Infinity));
  return (
    <div className={fill ? "min-h-0 flex-1 overflow-auto" : "max-h-[320px] overflow-auto"}>
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

export function CompoundTable({ rows }: { rows: CompoundRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            {["TYRE", "STINTS", "AVG LEN", "LAPS", "WEAR"].map((name, i) => (
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
          {["STINT", "LAPS", "BEST", "AVG", "WEAR"].map((name, i) => (
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
