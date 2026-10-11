import geometries from "@/data/track-geometry.json";

export type Point = [number, number];
export type TrackGeometry = { p: Point[]; w: number; h: number; rot: number };

const GEOMETRY = geometries as unknown as Record<string, TrackGeometry>;

// Dataset `CircuitShortName` → key in track-geometry.json (outlines exist for the 10 study circuits).
const ALIASES: Record<string, string> = { "spa-francorchamps": "spa" };

export function geometryFor(circuitShortName: string): TrackGeometry | null {
  const key = circuitShortName.toLowerCase();
  return GEOMETRY[ALIASES[key] ?? key] ?? null;
}

export type TrackPath = { points: Point[]; cum: number[]; total: number };

const paths = new WeakMap<TrackGeometry, TrackPath>();

/** Closed outline with cumulative arc length, cached per geometry. */
export function trackPath(geometry: TrackGeometry): TrackPath {
  const cached = paths.get(geometry);
  if (cached) return cached;
  const points = geometry.p;
  const cum = [0];
  for (let i = 1; i <= points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i % points.length];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const path = { points, cum, total: cum[points.length] };
  paths.set(geometry, path);
  return path;
}

/** Point at fraction `f` (0..1, wraps) of the lap distance. */
export function pointAt(path: TrackPath, f: number): Point {
  const target = (((f % 1) + 1) % 1) * path.total;
  let lo = 0;
  let hi = path.points.length;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (path.cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = path.points[lo];
  const [x1, y1] = path.points[(lo + 1) % path.points.length];
  const u = (target - path.cum[lo]) / (path.cum[lo + 1] - path.cum[lo] || 1);
  return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
}

/** Unit tangent and normal at fraction `f`: [tx, ty, nx, ny]. */
export function tangentAt(path: TrackPath, f: number): [number, number, number, number] {
  const [x0, y0] = pointAt(path, f - 0.002);
  const [x1, y1] = pointAt(path, f + 0.002);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy) || 1;
  return [dx / length, dy / length, -dy / length, dx / length];
}

/** SVG path data for the part of the lap between fractions f0 and f1. */
export function segmentPath(path: TrackPath, f0: number, f1: number): string {
  const points: Point[] = [pointAt(path, f0)];
  path.points.forEach((point, i) => {
    const f = path.cum[i] / path.total;
    if (f > f0 && f < f1) points.push(point);
  });
  points.push(pointAt(path, Math.min(f1, 0.99999)));
  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}`;
}

export const closedPath = (path: TrackPath) =>
  `M${[...path.points, path.points[0]].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}`;

export function trackView({ w, h, rot }: TrackGeometry) {
  return { viewBox: `-9 -9 ${w + 18} ${h + 18}`, scale: 0.42 + (0.38 * h) / 100, rotation: rot };
}
