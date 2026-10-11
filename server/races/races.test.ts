import { describe, expect, it } from "vitest";
import type { RaceEntryRow } from "@/server/db/schema";
import { assembleRaceDetail } from "./assemble";
import { buildMetrics } from "./metrics";
import { summarizeRace } from "./summary";
import type { RaceBundle, RaceInfo } from "./types";

const race = { race_id: 1, year: 2024, predictable: true } as RaceInfo;

const entry = (driver_code: string, overrides: Partial<RaceEntryRow> = {}) =>
  ({ race_id: 1, driver_code, team: "Ferrari", ...overrides }) as RaceEntryRow;

const lap = (driver_code: string, lap_number: number, overrides: Partial<RaceBundle["laps"][number]> = {}) =>
  ({
    race_id: 1,
    driver_code,
    lap_number,
    stint: 1,
    compound: "MEDIUM",
    is_accurate: true,
    is_deleted: false,
    is_safety_car: false,
    is_vsc: false,
    is_yellow: false,
    is_red_flag: false,
    gap_ahead_sec: null,
    lap_time_sec: 90,
    lap_end_time_sec: lap_number * 90,
    track_temp: null,
    air_temp: null,
    ...overrides,
  }) as RaceBundle["laps"][number];

const build = (bundle: Partial<RaceBundle>, info: RaceInfo = race) =>
  assembleRaceDetail({
    race: info,
    model: null,
    metrics: [],
    teams: [{ name: "Ferrari", short_code: "FER", color_hex: "#E8002D" }],
    drivers: [{ code: "LEC", full_name: "Charles Leclerc" }],
    bundle: { entries: [], laps: [], predictions: [], ...bundle },
  });

describe("assembleRaceDetail", () => {
  it("attaches driver and team metadata, falling back to null", () => {
    const { cars } = build({ entries: [entry("LEC"), entry("XXX")] });
    expect(cars[0]).toMatchObject({ driver_name: "Charles Leclerc", team_code: "FER", team_color: "#E8002D" });
    expect(cars[1].driver_name).toBeNull();
  });

  it("merges each prediction into the lap with the same driver and lap number", () => {
    const { cars } = build({
      entries: [entry("LEC")],
      laps: [lap("LEC", 1), lap("LEC", 2)],
      predictions: [{ driver_code: "LEC", lap_number: 2, predicted_lap_time_sec: 91.2, origin: "out_of_fold" }],
    });
    expect(cars[0].laps[0].prediction).toBeNull();
    expect(cars[0].laps[1].prediction).toEqual({ predicted_lap_time_sec: 91.2, origin: "out_of_fold" });
  });

  it("flags dirty air only under racing conditions and below the gap threshold", () => {
    const { cars } = build({
      entries: [entry("LEC")],
      laps: [
        lap("LEC", 1, { gap_ahead_sec: 0.5 }),
        lap("LEC", 2, { gap_ahead_sec: 2.4 }),
        lap("LEC", 3, { gap_ahead_sec: 0.5, is_safety_car: true }),
        lap("LEC", 4, { gap_ahead_sec: null }),
      ],
    });
    expect(cars[0].laps.map((l) => l.dirty_air)).toEqual([true, false, false, false]);
  });

  it("exposes results only for races outside the model scope", () => {
    const { cars } = build(
      { entries: [entry("LEC")], laps: [lap("LEC", 1)] },
      { ...race, predictable: false },
    );
    expect(cars[0].laps).toEqual([]);
  });
});

describe("summarizeRace", () => {
  const summary = summarizeRace(
    build({
      entries: [
        entry("VER", { finish_position: 1, q_pos: 2, grid_position: 2, q_best_sec: 70.1, classified_position: "1" }),
        entry("LEC", { finish_position: 2, q_pos: 1, classified_position: "2" }),
        entry("HAM", { finish_position: 15, classified_position: "R" }),
      ],
      laps: [
        lap("VER", 1, { lap_time_sec: 95, track_temp: 30 }),
        lap("VER", 2, { lap_time_sec: 88, is_accurate: false, is_safety_car: true, track_temp: 32 }),
        lap("VER", 3, { lap_time_sec: 85, is_accurate: false }),
        lap("VER", 4, { lap_time_sec: 89, stint: 2, compound: "HARD", lap_end_time_sec: 400 }),
        lap("LEC", 1, { lap_time_sec: 91 }),
        lap("LEC", 2, { is_safety_car: true, is_vsc: true }),
        lap("LEC", 4, { lap_time_sec: 90, stint: 2, compound: "HARD", lap_end_time_sec: 402.5 }),
        lap("HAM", 1, { stint: 1 }),
        lap("HAM", 5, { is_safety_car: true }),
      ],
    }),
  );

  it("identifies winner, pole and the fastest accurate lap", () => {
    expect(summary.winner).toEqual({ driver_code: "VER", team: "Ferrari", grid_position: 2 });
    expect(summary.pole?.driver_code).toBe("LEC");
    expect(summary.fastest_lap).toEqual({ driver_code: "VER", lap_number: 4, lap_time_sec: 89 });
  });

  it("computes the winning margin only when both cars finished on the same lap", () => {
    expect(summary.winning_margin_sec).toBeCloseTo(2.5);
  });

  it("derives strategy, stops and compound share from stints", () => {
    expect(summary.winning_strategy).toEqual(["MEDIUM", "HARD"]);
    expect(summary.avg_pit_stops).toBe(1);
    expect(summary.dnf_count).toBe(1);
    expect(summary.compound_share).toEqual({ MEDIUM: 7 / 9, HARD: 2 / 9 });
  });

  it("counts incident periods across all cars", () => {
    expect(summary.incidents).toEqual({ safety_car: 2, vsc: 1, yellow: 0, red_flag: 0 });
  });

  it("averages temperatures over laps that have a reading", () => {
    expect(summary.mean_track_temp_c).toBe(31);
    expect(summary.mean_air_temp_c).toBeNull();
  });
});

describe("buildMetrics", () => {
  const laps = [lap("VER", 2, { lap_time_sec: 90 }), lap("VER", 3, { lap_time_sec: 92 }), lap("VER", 4, { lap_time_sec: null })];
  const predict = (lap_number: number, predicted_lap_time_sec: number, origin: "out_of_fold" | "in_sample" = "out_of_fold") => ({
    driver_code: "VER",
    lap_number,
    predicted_lap_time_sec,
    origin,
  });

  it("scores predictions against actual lap times, skipping laps without a time", () => {
    const [metric] = buildMetrics(laps, [predict(2, 91), predict(3, 91), predict(4, 95)], []);
    expect(metric).toMatchObject({ origin: "out_of_fold", n_laps: 2, rmse: 1, mae: 1, rmse_mean3: null });
  });

  it("reports the baseline RMSE for the same origin", () => {
    const [metric] = buildMetrics(laps, [predict(2, 90), predict(3, 92)], [predict(2, 92), predict(3, 90)]);
    expect(metric.rmse).toBe(0);
    expect(metric.rmse_mean3).toBe(2);
  });
});
