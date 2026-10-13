import { describe, expect, it } from "vitest";
import { parseLivePredictions } from "./parse";

const row = (lap: number, value: number | null) => ({
  driver_code: "VER",
  lap_number: lap,
  predicted_lap_time_sec: value,
  actual_lap_time_sec: 83.1,
});

describe("parseLivePredictions", () => {
  it("maps API rows to stored-prediction rows carrying the race origin", () => {
    const rows = parseLivePredictions({
      origin: "validation",
      model: "LSTM",
      predictions: [row(8, 83.34), row(9, 83.2)],
    });
    expect(rows).toEqual([
      { driver_code: "VER", lap_number: 8, predicted_lap_time_sec: 83.34, origin: "validation" },
      { driver_code: "VER", lap_number: 9, predicted_lap_time_sec: 83.2, origin: "validation" },
    ]);
  });

  it("drops laps without a forecast", () => {
    const rows = parseLivePredictions({
      origin: "in_sample",
      predictions: [row(8, null), row(9, 83.2)],
    });
    expect(rows?.map((r) => r.lap_number)).toEqual([9]);
  });

  it("returns null for an empty, malformed or unknown-origin response", () => {
    expect(parseLivePredictions({ origin: "validation", predictions: [] })).toBeNull();
    expect(parseLivePredictions({ origin: null, predictions: [row(8, 83)] })).toBeNull();
    expect(parseLivePredictions({ origin: "test", predictions: [row(8, 83)] })).toBeNull();
    expect(parseLivePredictions("<html>502</html>")).toBeNull();
  });
});
