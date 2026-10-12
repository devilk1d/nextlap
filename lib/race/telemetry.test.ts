import { describe, expect, it } from "vitest";
import { sampleTelemetry, telemetryFolder, type TelemetryFile } from "./telemetry";

const file: TelemetryFile = {
  year: 2024,
  event: "Italian Grand Prix",
  driver: "PIA",
  step: 0.5,
  laps: {
    "3": {
      s: [100, 200, 300, 250],
      r: [8000, 9000, 10000, 9500],
      t: [0, 50, 100, 80],
      b: "1000",
      g: "3456",
      d: "0011",
    },
  },
};

describe("telemetryFolder", () => {
  it("matches the folder names written by build_telemetry.py", () => {
    expect(telemetryFolder(2024, "Italian Grand Prix")).toBe("2024_italian-grand-prix");
    expect(telemetryFolder(2023, "São Paulo Grand Prix")).toBe("2023_sao-paulo-grand-prix");
    expect(telemetryFolder(2022, "Emilia Romagna Grand Prix")).toBe(
      "2022_emilia-romagna-grand-prix",
    );
  });
});

describe("sampleTelemetry", () => {
  it("reads the sample at the given time into the lap", () => {
    const at = sampleTelemetry(file, 3, 1.0);
    expect(at).toMatchObject({ speed: 300, rpm: 10000, throttle: 100, gear: 5 });
  });

  it("interpolates continuous channels and holds gear, brake and DRS", () => {
    const at = sampleTelemetry(file, 3, 0.25);
    expect(at?.speed).toBeCloseTo(150);
    expect(at?.throttle).toBeCloseTo(25);
    expect(at?.gear).toBe(3);
    expect(at?.brake).toBe(true);
    expect(sampleTelemetry(file, 3, 1.0)?.drs).toBe(true);
    expect(sampleTelemetry(file, 3, 0.0)?.drs).toBe(false);
  });

  it("tracks the top speed so far and clamps to the lap", () => {
    expect(sampleTelemetry(file, 3, 0.5)?.topSpeed).toBe(200);
    expect(sampleTelemetry(file, 3, 99)?.topSpeed).toBe(300);
    expect(sampleTelemetry(file, 3, -5)?.speed).toBe(100);
  });

  it("never lets the top speed fall behind the speed while accelerating", () => {
    for (let elapsed = 0; elapsed <= 1.5; elapsed += 0.05) {
      const at = sampleTelemetry(file, 3, elapsed);
      expect(at!.topSpeed).toBeGreaterThanOrEqual(at!.speed);
    }
    // Halfway between 100 and 200 km/h the mark sits on the speed, not on the older sample.
    expect(sampleTelemetry(file, 3, 0.25)?.topSpeed).toBeCloseTo(150);
  });

  it("returns null for a lap that was not recorded", () => {
    expect(sampleTelemetry(file, 4, 1)).toBeNull();
  });
});
