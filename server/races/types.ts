import type {
  CircuitRow,
  Compound,
  LapPredictionRow,
  LapRow,
  LapTelemetryRow,
  PredictionMetricRow,
  RaceEntryRow,
  RaceRow,
} from "@/server/db/schema";
import type { ModelRun } from "@/server/models/service";

export type RaceInfo = Omit<RaceRow, "is_wet" | "is_predictable"> & {
  /** False for wet races and races missing from the model output (`exclusion_reason`). */
  predictable: boolean;
  circuit: CircuitRow;
};

type BundleLap = LapRow &
  Partial<Omit<LapTelemetryRow, "race_id" | "driver_code" | "lap_number">>;

/** Payload of the `race_bundle` RPC (telemetry keys are absent when a lap has none). */
export type RaceBundle = {
  entries: RaceEntryRow[];
  laps: BundleLap[];
  predictions: Pick<
    LapPredictionRow,
    "driver_code" | "lap_number" | "predicted_lap_time_sec" | "origin"
  >[];
};

export type LapPrediction = Pick<LapPredictionRow, "predicted_lap_time_sec" | "origin">;

export type Lap = Omit<BundleLap, "race_id" | "driver_code"> & {
  /** Within `DIRTY_AIR_GAP_SEC` of the car ahead at the end of a lap run under racing conditions. */
  dirty_air: boolean;
  /** Model forecast for this lap (made from the preceding laps); null when none exists. */
  prediction: LapPrediction | null;
};

export type Car = Omit<RaceEntryRow, "race_id"> & {
  driver_name: string | null;
  team_code: string | null;
  team_color: string | null;
  laps: Lap[];
};

export type RaceDetail = {
  race: RaceInfo;
  /** Run the predictions come from; null when none is selected or flagged as default. */
  model: ModelRun | null;
  metrics: Omit<PredictionMetricRow, "model_run_id" | "race_id">[];
  cars: Car[];
};

export type RaceSummary = {
  race_id: number;
  year: number;
  event_name: string;
  event_date: string;
  predictable: boolean;
  winner: { driver_code: string; team: string; grid_position: number | null } | null;
  pole: { driver_code: string; q_best_sec: number | null } | null;
  fastest_lap: { driver_code: string; lap_number: number; lap_time_sec: number } | null;
  winning_margin_sec: number | null;
  winning_strategy: Compound[];
  avg_pit_stops: number | null;
  dnf_count: number;
  /** Distinct periods: runs of consecutive laps in which any car was affected. */
  incidents: { safety_car: number; vsc: number; yellow: number; red_flag: number };
  mean_track_temp_c: number | null;
  mean_air_temp_c: number | null;
  /** Share of recorded laps per compound (0..1). */
  compound_share: Partial<Record<Compound, number>>;
};
