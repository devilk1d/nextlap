import { describe, expect, it } from "vitest";
import type { Car, Lap, RaceDetail } from "@/server/races/types";
import { flagOf } from "./lap-flags";
import {
  lapToneOf,
  noForecast,
  noForecastSummary,
  sectorProgress,
  sectorToneOf,
} from "./laps";
import {
  buildTimeline,
  distanceAt,
  frameAt,
  lapBoundary,
  timeAt,
  type Run,
  type RunLap,
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

describe("sector colours", () => {
  /** Two cars on identical 90 s laps, with the given sector-1 times per lap. */
  const timelineOf = (a: number[], b: number[]) => {
    const withSectors = (code: string, s1: number[]) => {
      const base = car(code, 90, s1.length);
      base.laps = base.laps.map((lap, i) => ({
        ...lap,
        sector1_time_sec: s1[i],
        sector2_time_sec: 30,
        sector3_time_sec: 90 - s1[i] - 30,
      }));
      return base;
    };
    return buildTimeline(detail([withSectors("AAA", a), withSectors("BBB", b)], 10));
  };
  const toneOf = (timeline: ReturnType<typeof timelineOf>, code: string, lap: number) =>
    sectorToneOf(timeline, timeline.byCode.get(code) as Run, lap, 0);

  const timeline = timelineOf([30, 29.5, 29.8, 29.5], [30.5, 30.4, 29, 30]);

  it("is purple for the fastest of all drivers so far", () => {
    expect(toneOf(timeline, "AAA", 1)).toBe("purple"); // first time set by anyone
    expect(toneOf(timeline, "AAA", 2)).toBe("purple");
    expect(toneOf(timeline, "BBB", 3)).toBe("purple");
  });

  it("is white when it is the driver's first time and not the fastest", () => {
    expect(toneOf(timeline, "BBB", 1)).toBe("white");
  });

  it("is green for a personal best and yellow when slower or equal", () => {
    expect(toneOf(timeline, "BBB", 2)).toBe("green"); // 30.4 < 30.5, but AAA already has 29.5
    expect(toneOf(timeline, "AAA", 3)).toBe("yellow"); // 29.8 is slower than AAA's 29.5
    expect(toneOf(timeline, "AAA", 4)).toBe("yellow"); // 29.5 only equals its best
  });

  it("judges a sector by what was known when it was completed", () => {
    // BBB's 29.0 (lap 3) came after AAA's 29.5 (lap 2) but before AAA's lap-3 sector ended.
    expect(toneOf(timeline, "AAA", 3)).not.toBe("purple");
    const [a] = timeline.runs;
    expect(lapToneOf(timeline, a, 1)).toBe("purple");
  });

  it("tracks which sectors of a lap in progress are finished", () => {
    const lap = { sector1_time_sec: 30, sector2_time_sec: 31, sector3_time_sec: 29, lap_time_sec: 90 };
    const early = sectorProgress(lap as RunLap, 20, [0.3, 0.3, 0.4]);
    expect(early).toMatchObject({ done: [false, false, false], current: 0 });
    expect(early.fill[0]).toBeCloseTo(20 / 30, 3);
    expect(early.fill[1]).toBe(0);
    expect(early.durations).toEqual([30, 31, 29]);
    const later = sectorProgress(lap as RunLap, 62, [0.3, 0.3, 0.4]);
    expect(later).toMatchObject({ done: [true, true, false], current: 2 });
    expect(later.fill[0]).toBe(1);
    expect(later.fill[2]).toBeCloseTo(1 / 29, 3);
  });
});

describe("pit stops", () => {
  // 90 s laps from t = 0 (START = 1000 in the shared race clock). Lap 2 is the in-lap, lap 3 the
  // out-lap: entry line 85 s into the in-lap, timing line at 180 s, exit line 11 s into the out-lap.
  const LANE = { entry: 0.02, exit: 0.08, driveS: 18, kmh: 80, lengthM: 500, stops: 50 };
  const at = (seconds: number) => START + seconds;
  const withStop = (lane = true) => {
    const base = car("AAA", 90, 5);
    base.laps = base.laps.map((lap) =>
      lap.lap_number === 2
        ? { ...lap, is_in_lap: true, pit_in_time_sec: at(90 + 85) }
        : lap.lap_number === 3
          ? { ...lap, is_out_lap: true, pit_out_time_sec: at(180 + 11) }
          : lap,
    );
    const timeline = buildTimeline(detail([base]));
    if (lane) timeline.pitLane = LANE;
    return timeline;
  };
  const state = (timeline: ReturnType<typeof withStop>, t: number) =>
    frameAt(timeline, t).standings[0];

  it("reads the recorded entry, timing-line and exit times", () => {
    const [stop] = withStop().runs[0].stops;
    expect(stop).toMatchObject({ lap: 2, start: 90, tIn: 175, tLine: 180, tOut: 191, end: 270 });
  });

  it("moves through entering, in the pit lane and exiting, then clears", () => {
    const timeline = withStop();
    expect(state(timeline, 170).pit).toBeNull();
    expect(state(timeline, 176).pit).toEqual({ phase: "entering", inLane: true });
    expect(state(timeline, 183).pit).toEqual({ phase: "in", inLane: true });
    expect(state(timeline, 189.5).pit).toEqual({ phase: "exiting", inLane: true });
    expect(state(timeline, 193).pit).toEqual({ phase: "exiting", inLane: false });
    expect(state(timeline, 200).pit).toBeNull();
    expect(state(timeline, 183).inPit).toBe(true);
    expect(state(timeline, 193).inPit).toBe(false);
  });

  it("keeps the marker continuous and stationary while the car is stopped", () => {
    const timeline = withStop();
    const before = state(timeline, 174.99).marker;
    const entry = state(timeline, 175.01).marker;
    expect(before.lane).toBeNull();
    expect(entry.lane).toBeCloseTo(0, 1);
    expect(Math.abs(entry.fraction - before.fraction)).toBeLessThan(0.01);

    const exit = state(timeline, 190.99).marker;
    const after = state(timeline, 191.01).marker;
    expect(exit.lane).toBeCloseTo(1, 1);
    expect(after.lane).toBeNull();
    expect(Math.abs(after.fraction - exit.fraction)).toBeLessThan(0.01);

    // Driving the lane takes longer than the 11 s after the line, so it keeps moving there.
    const a = state(timeline, 183).marker.lane ?? -1;
    const b = state(timeline, 184).marker.lane ?? -1;
    expect(b).toBeGreaterThan(a);
  });

  it("holds the car still when the stop takes longer than driving the lane", () => {
    const timeline = withStop();
    timeline.pitLane = { ...LANE, driveS: 4 };
    const first = state(timeline, 184).marker.lane;
    const second = state(timeline, 186).marker.lane;
    expect(first).not.toBeNull();
    expect(second).toBeCloseTo(first as number, 5);
  });

  it("falls back to the flag estimate when no stop times were recorded", () => {
    const timeline = buildTimeline(detail([car("AAA", 90, 5)]));
    expect(timeline.runs[0].stops).toEqual([]);
    expect(state(timeline, 100).pit).toBeNull();
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
