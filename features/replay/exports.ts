import { downloadBlob, downloadCsv } from "@/lib/download";
import { fmtLap, fmtLapAxis } from "@/lib/format";
import { EVENT, tyreOf } from "@/lib/race/constants";
import { isNeutralised } from "@/lib/race/laps";
import type { Run } from "@/lib/race/timeline";
import type { StintChart } from "./chart-data";

type Context = { run: Run; grandPrix: string; year: number };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Every completed lap of the driver with its forecast. */
export function exportLapsCsv({ run, grandPrix, year }: Context, completed: number) {
  const rows: (string | number)[][] = [
    [
      "lap",
      "lap_time",
      "lap_time_s",
      "s1",
      "s2",
      "s3",
      "compound",
      "tyre_age",
      "status",
      "in_metrics",
      "pred_s",
    ],
  ];
  for (const lap of run.laps.slice(0, completed)) {
    rows.push([
      lap.lap_number,
      fmtLap(lap.lap_time_sec),
      lap.lap_time_sec?.toFixed(3) ?? "",
      lap.sector1_time_sec?.toFixed(3) ?? "",
      lap.sector2_time_sec?.toFixed(3) ?? "",
      lap.sector3_time_sec?.toFixed(3) ?? "",
      tyreOf(lap.compound).name,
      lap.tyre_life ?? "",
      lap.flag ?? (lap.dirty_air ? "DIRTY_AIR" : "CLEAN"),
      lap.flag ? "no" : "yes",
      lap.prediction?.predicted_lap_time_sec.toFixed(3) ?? "",
    ]);
  }
  downloadCsv(`laps_${run.driver_code}_${slug(grandPrix)}_${year}.csv`, rows);
}

/** Renders the stint chart (actual vs predicted) to a 1600×760 PNG. */
export function exportChartPng(
  { run, grandPrix, year }: Context,
  chart: StintChart,
  stintNumber: number,
) {
  const W = 1600;
  const H = 760;
  const m = { l: 120, r: 50, t: 96, b: 76 };
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;

  const { laps, yMin, yMax } = chart;
  const n = laps.length;
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const X = (j: number) => m.l + (n <= 1 ? 0.5 : j / (n - 1)) * pw;
  const Y = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin)) * ph;
  const step = pw / Math.max(1, n - 1);
  const accent = "#FF6B1F";

  g.fillStyle = "#17171a";
  g.fillRect(0, 0, W, H);
  g.font = "600 30px sans-serif";
  g.fillStyle = "#ededee";
  g.fillText(`${run.driver_code} · ${grandPrix} ${year} · Stint ${stintNumber}`, m.l, 48);
  g.font = "20px sans-serif";
  g.fillStyle = "#9a9aa3";
  g.fillText("Lap time — actual vs predicted", m.l, 78);

  g.strokeStyle = "#26262b";
  g.fillStyle = "#9a9aa3";
  g.font = "18px monospace";
  g.lineWidth = 1;
  g.setLineDash([6, 6]);
  for (let q = 0; q < 4; q += 1) {
    const value = yMin + ((yMax - yMin) * (q + 0.5)) / 4;
    g.beginPath();
    g.moveTo(m.l, Y(value));
    g.lineTo(W - m.r, Y(value));
    g.stroke();
    g.fillText(fmtLapAxis(value), 12, Y(value) + 6);
  }
  g.setLineDash([]);

  laps.forEach((lap, j) => {
    if (!lap.shown || !isNeutralised(lap.flag)) return;
    const { color } = EVENT[lap.flag];
    g.globalAlpha = 0.18;
    g.fillStyle = color;
    g.fillRect(X(j) - step / 2, m.t, step, ph);
    g.globalAlpha = 1;
    g.font = "700 15px sans-serif";
    g.fillText(lap.flag, X(j) - step / 2 + 4, m.t + ph - 6);
  });

  const stroke = (
    pick: (lap: StintChart["laps"][number]) => number | null,
    color: string,
    dash: number[],
    width: number,
  ) => {
    g.beginPath();
    g.setLineDash(dash);
    g.strokeStyle = color;
    g.lineWidth = width;
    let pen = false;
    laps.forEach((lap, j) => {
      const value = pick(lap);
      if (value === null) {
        pen = false;
        return;
      }
      if (pen) g.lineTo(X(j), Y(value));
      else g.moveTo(X(j), Y(value));
      pen = true;
    });
    g.stroke();
    g.setLineDash([]);
  };
  stroke((l) => (l.shown ? l.predicted : null), accent, [10, 8], 3);
  stroke((l) => (l.clean && l.done ? l.time : null), "#ffffff", [], 3.5);

  laps.forEach((lap, j) => {
    if (lap.clean && lap.done && lap.time !== null) {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(X(j), Y(lap.time), 4.5, 0, 7);
      g.fill();
    }
    if (lap.dirty && lap.done) {
      g.fillStyle = "#B44CFF";
      g.fillRect(X(j) - 4, m.t + ph - 4, 8, 8);
    }
  });

  g.fillStyle = "#9a9aa3";
  g.font = "18px monospace";
  g.textAlign = "center";
  laps.forEach((lap, j) => {
    if (j === 0 || j === n - 1 || lap.lap % 5 === 0) g.fillText(`L${lap.lap}`, X(j), H - m.b + 30);
  });
  g.textAlign = "left";

  let lx = m.l;
  g.font = "18px sans-serif";
  for (const [color, label] of [
    ["#ffffff", "Actual"],
    [accent, "Predicted"],
    ["#F5C518", "SC / VSC (excluded)"],
    ["#B44CFF", "Dirty air"],
  ] as const) {
    g.fillStyle = color;
    g.fillRect(lx, H - 24, 22, 8);
    g.fillStyle = "#c9c9cf";
    g.fillText(label, lx + 30, H - 14);
    lx += g.measureText(label).width + 78;
  }
  g.fillStyle = "#5c5c64";
  g.textAlign = "right";
  g.fillText("Next Lap Predictor", W - m.r, H - 14);

  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(
        `laptimes_${run.driver_code}_${slug(grandPrix)}_${year}_stint${stintNumber}.png`,
        blob,
      );
    }
  });
}
