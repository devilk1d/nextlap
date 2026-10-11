export const present = <T>(value: T | null | undefined): value is T => value != null;

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Linear-interpolation-free quantile of an ascending array, `p` in 0..1. */
export function quantileSorted(sorted: number[], p: number): number | null {
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
    : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stdDev(values: number[]): number | null {
  const avg = mean(values);
  return avg === null || values.length < 2
    ? null
    : Math.sqrt(mean(values.map((value) => (value - avg) ** 2)) ?? 0);
}

/** Position of `value` inside [min, max] as a 0..100 percentage. */
export const percentOf = (value: number, min: number, max: number) =>
  clamp(((value - min) / (max - min || 1)) * 100, 0, 100);

/** Round tick values spanning [min, max], roughly `count` of them. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const rough = (max - min || 1) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

export type LineFit = { slope: number; intercept: number; n: number; xMin: number; xMax: number };

/** Ordinary least squares y = intercept + slope · x; null below `minPoints`. */
export function linearFit(points: { x: number; y: number }[], minPoints = 6): LineFit | null {
  if (points.length < minPoints) return null;
  const mx = mean(points.map((p) => p.x)) ?? 0;
  const my = mean(points.map((p) => p.y)) ?? 0;
  let covariance = 0;
  let variance = 0;
  for (const { x, y } of points) {
    covariance += (x - mx) * (y - my);
    variance += (x - mx) ** 2;
  }
  const slope = variance ? covariance / variance : 0;
  const xs = points.map((p) => p.x);
  return {
    slope,
    intercept: my - slope * mx,
    n: points.length,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
  };
}

/** Consecutive [start, end) spans for shares that sum to 1, e.g. sector boundaries. */
export function spans(shares: readonly number[]): { start: number; end: number }[] {
  return shares.map((share, i) => {
    const start = shares.slice(0, i).reduce((sum, value) => sum + value, 0);
    return { start, end: start + share };
  });
}
