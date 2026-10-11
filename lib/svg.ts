export type Pt = [number, number] | null;

/** SVG path through the points; `null` lifts the pen, leaving a gap in the line. */
export function linePath(points: Pt[]): string {
  let d = "";
  let pen = false;
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}
