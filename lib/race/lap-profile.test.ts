import { describe, expect, it } from "vitest";
import { compareToReference, PROFILE_METRICS, referenceLaps } from "./lap-profile";
import type { Run, RunLap } from "./timeline";

const lap = (lap_number: number, speed: number | null, clean = true) =>
  ({ lap_number, clean, tel_speed_mean: speed, tel_throttle_std: speed }) as unknown as RunLap;
const runOf = (laps: RunLap[]) => ({ laps }) as unknown as Run;

const speed = PROFILE_METRICS.find((m) => m.key === "tel_speed_mean")!;
const std = PROFILE_METRICS.find((m) => m.key === "tel_throttle_std")!;

describe("referenceLaps", () => {
  it("takes the latest four clean laps before the given lap, skipping unclean ones", () => {
    const run = runOf([
      lap(1, 200, false),
      lap(2, 240),
      lap(3, 241),
      lap(4, 100, false),
      lap(5, 242),
      lap(6, 243),
      lap(7, 244),
      lap(8, 250),
    ]);
    expect(referenceLaps(run, 8).map((l) => l.lap_number)).toEqual([3, 5, 6, 7]);
    expect(referenceLaps(run, 3).map((l) => l.lap_number)).toEqual([2]);
  });
});

describe("compareToReference", () => {
  const refs = [lap(2, 240), lap(3, 242), lap(4, 244), lap(5, 246)];

  it("returns this lap minus the average of the reference laps", () => {
    const at = compareToReference(248, refs, speed);
    expect(at?.reference).toBeCloseTo(243);
    expect(at?.delta).toBeCloseTo(5);
    expect(at?.direction).toBe("up");
    expect(compareToReference(240, refs, speed)?.direction).toBe("down");
  });

  it("calls a difference below the displayed precision 'same'", () => {
    expect(compareToReference(243.2, refs, speed)?.direction).toBe("same");
    // The same gap is a real change for a metric shown with one decimal.
    expect(compareToReference(243.2, refs, std)?.direction).toBe("up");
  });

  it("gives nothing when there are too few reference laps or no value", () => {
    expect(compareToReference(248, [lap(2, 240)], speed)).toBeNull();
    expect(compareToReference(248, [lap(2, 240), lap(3, null)], speed)).toBeNull();
    expect(compareToReference(null, refs, speed)).toBeNull();
  });
});
