import { describe, expect, it } from "vitest";
import type { Car, Lap, RaceDetail } from "@/server/races/types";
import { flagOf } from "./lap-flags";
import { noForecast, noForecastSummary } from "./laps";
import {
  buildTimeline,
  distanceAt,
  frameAt,
  lapBoundary,
  timeAt,
} from "./timeline";

const START = 1000;

/** A car that completes `laps` laps of `lapSeconds` each, starting at the shared race start. */
function car(code: string, lapSeconds: number, laps: number, overrides: Partial<Car> = {}): Car {
  return {
    driver_code: code,
    driver_number: 1,
    team: "Team",
    grid_position: 1,
    classified_position: "1",
    finish_position: 1,
    driver_name: code,
    team_code: null,
    team_color: "#ffffff",
    laps: Array.from({ length: laps }, (_, i) => ({
      lap_number: i + 1,
      stint: 1,
      compound: "MEDIUM",
      lap_time_sec: lapSeconds,
      lap_start_time_sec: START + i * lapSeconds,
      lap_end_time_sec: START + (i + 1) * lapSeconds,
      is_in_lap: false,
      is_out_lap: false,
      is_safety_car: false,
      is_vsc: false,
      is_red_flag: false,
      is_yellow: false,
      is_deleted: false,
    })) as unknown as Lap[],
    ...overrides,
  } as Car;
}

const detail = (cars: Car[], totalLaps = 5) =>
  ({ race: { total_laps: totalLaps }, cars }) as unknown as RaceDetail;

describe("distanceAt / timeAt", () => {
  const cum = [0, 90, 180, 270];

  it("interpolates inside a lap and clamps outside the race", () => {
    expect(distanceAt(cum, 135)).toBeCloseTo(1.5);
    expect(distanceAt(cum, -5)).toBe(0);
    expect(distanceAt(cum, 999)).toBe(3);
  });

  it("is the inverse of distanceAt", () => {
    expect(timeAt(cum, distanceAt(cum, 200))).toBeCloseTo(200);
  });
});

describe("frameAt", () => {
  const timeline = buildTimeline(
    detail([
      car("AAA", 90, 5),
      car("BBB", 92, 5, { grid_position: 2, finish_position: 2, classified_position: "2" }),
      car("CCC", 90, 2, {
        grid_position: 3,
        finish_position: 3,
        classified_position: "R",
        status: "Engine",
      }),
    ]),
  );

  it("orders cars by distance covered and measures the gap behind the leader", () => {
    const frame = frameAt(timeline, 200);
    expect(frame.standings.map((s) => s.run.driver_code)).toEqual(["AAA", "BBB", "CCC"]);
    const b = frame.byCode.get("BBB");
    expect(b?.position).toBe(2);
    // BBB reaches the point AAA is at (2.22 laps) 2.22 × 2 s later than AAA did.
    expect(b?.toLeader).toBeGreaterThan(4);
    expect(frame.leaderLap).toBe(3);
  });

  it("flags a retired car only once it has stopped and sorts it last", () => {
    expect(frameAt(timeline, 100).byCode.get("CCC")?.retired).toBe(false);
    const late = frameAt(timeline, 300);
    expect(late.byCode.get("CCC")?.retired).toBe(true);
    expect(late.standings.at(-1)?.run.driver_code).toBe("CCC");
  });

  it("reports the race as finished once the last car is done", () => {
    expect(frameAt(timeline, timeline.end + 1).finished).toBe(true);
    expect(frameAt(timeline, 10).finished).toBe(false);
  });
});

describe("replay clock helpers", () => {
  const timeline = buildTimeline(detail([car("AAA", 90, 5)]));

  it("steps to the next and previous lap boundary", () => {
    const run = timeline.runs[0];
    expect(lapBoundary(run, 100, 1)).toBeCloseTo(180.02);
    expect(lapBoundary(run, 100, -1)).toBeCloseTo(90.02);
  });
});

describe("noForecast", () => {
  const TOTAL = 30;
  /** 20 clean green laps on one tyre set; `patch` changes single laps (by lap number). */
  const runWith = (patch: (lapNumber: number) => Partial<Lap> = () => ({})) => {
    const base = car("AAA", 90, 20);
    base.laps = base.laps.map((lap) => ({
      ...lap,
      track_status: "1",
      is_accurate: true,
      rainfall: false,
      tyre_life: lap.lap_number,
      tel_valid_frac: 1,
      tel_speed_max: 300,
      tel_speed_min: 80,
      tel_span_sec: 90,
      ...patch(lap.lap_number),
    }));
    return buildTimeline(detail([base], TOTAL)).runs[0];
  };
  const reason = (run: ReturnType<typeof runWith>, lapNumber: number) =>
    noForecast(run, run.laps[lapNumber - 1], TOTAL);

  it("explains laps before the window is full", () => {
    const run = runWith();
    expect(reason(run, 2).kind).toBe("edge");
    expect(reason(run, 5)).toMatchObject({ kind: "warm-up" });
    expect(reason(run, 5).text).toContain("(2 so far)");
    expect(reason(run, 10).kind).toBe("other");
  });

  it("flags missing tyre data in the source", () => {
    const run = runWith((n) => (n <= 12 ? { stint: null, compound: null, tyre_life: null } : {}));
    expect(reason(run, 8).kind).toBe("tyre-data");
  });

  it("skips two laps after a Safety Car, then warms up again", () => {
    const run = runWith((n) => (n === 8 ? { is_safety_car: true, track_status: "4" } : {}));
    expect(reason(run, 8).kind).toBe("neutralised");
    expect(reason(run, 9).kind).toBe("restart");
    expect(reason(run, 10).kind).toBe("restart");
    expect(reason(run, 11).kind).toBe("warm-up");
    expect(reason(run, 16).kind).toBe("other");
  });

  it("flags incomplete telemetry and counts reasons", () => {
    const run = runWith((n) => (n === 7 ? { tel_valid_frac: 0.5 } : {}));
    expect(reason(run, 7).kind).toBe("telemetry");
    const summary = noForecastSummary(run, run.laps.slice(0, 8), TOTAL);
    expect(summary.find((s) => s.kind === "telemetry")?.count).toBe(1);
    expect(summary.reduce((sum, s) => sum + s.count, 0)).toBe(8);
  });
});

describe("flagOf", () => {
  const lap = (overrides: Partial<Lap>) =>
    ({
      lap_number: 5,
      is_in_lap: false,
      is_out_lap: false,
      is_safety_car: false,
      is_vsc: false,
      is_red_flag: false,
      is_yellow: false,
      ...overrides,
    }) as Lap;

  it("labels laps by the most specific reason", () => {
    expect(flagOf(lap({ lap_number: 1, is_out_lap: true }))).toBe("START");
    expect(flagOf(lap({ is_in_lap: true, is_safety_car: true }))).toBe("PIT IN");
    expect(flagOf(lap({ is_safety_car: true, is_yellow: true }))).toBe("SC");
    expect(flagOf(lap({}))).toBeNull();
  });
});
