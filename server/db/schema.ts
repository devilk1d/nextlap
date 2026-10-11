// Read-only mirror of nextlap_schema_v2.sql (public schema). Update when the schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET";
export type PredictionOrigin = "out_of_fold" | "validation" | "in_sample";
export type ModelType = "LSTM" | "GRU" | "Naive-Last" | "Mean-3";
export type Scheme = "seen" | "unseen";

export type CircuitRow = {
  circuit_key: number;
  short_name: string;
  official_name: string | null;
  country_code: string | null;
  length_km: number | null;
  is_study_circuit: boolean;
};

export type DriverRow = { code: string; full_name: string | null };

export type TeamRow = { name: string; short_code: string; color_hex: string };

export type RaceRow = {
  race_id: number;
  year: number;
  round_number: number;
  event_name: string;
  event_date: string;
  event_format: "conventional" | "sprint" | "sprint_shootout" | "sprint_qualifying";
  circuit_key: number;
  country: string;
  location: string;
  total_laps: number;
  exclusion_reason: "wet" | "not_modeled" | null;
  is_wet: boolean | null;
  is_predictable: boolean | null;
  circ_length_m: number | null;
  circ_turn_deg_per_km: number | null;
  circ_pct_tight: number | null;
  circ_pct_medium: number | null;
  circ_alt_range_m: number | null;
  circ_num_corners: number | null;
};

export type RaceEntryRow = {
  race_id: number;
  driver_code: string;
  driver_number: number;
  team: string;
  grid_position: number | null;
  finish_position: number | null;
  classified_position: string | null;
  status: string | null;
  points: number | null;
  laps_completed: number | null;
  q_pos: number | null;
  q1_sec: number | null;
  q2_sec: number | null;
  q3_sec: number | null;
  q_best_sec: number | null;
  q_gap_to_pole_pct: number | null;
  q_last_segment: number | null;
  q_seg_gap_pct: number | null;
  season_final_rank: number | null;
  in_top10: boolean;
};

export type LapRow = {
  race_id: number;
  driver_code: string;
  lap_number: number;
  stint: number | null;
  compound: Compound | null;
  tyre_life: number | null;
  fresh_tyre: boolean | null;
  track_status: string;
  is_green: boolean | null;
  is_yellow: boolean | null;
  is_safety_car: boolean | null;
  is_red_flag: boolean | null;
  is_vsc: boolean | null;
  position: number | null;
  is_accurate: boolean;
  is_deleted: boolean;
  deleted_reason: string | null;
  is_personal_best: boolean | null;
  fastf1_generated: boolean;
  lap_start_date: string | null;
  lap_time_sec: number | null;
  sector1_time_sec: number | null;
  sector2_time_sec: number | null;
  sector3_time_sec: number | null;
  lap_start_time_sec: number | null;
  lap_end_time_sec: number | null;
  pit_in_time_sec: number | null;
  pit_out_time_sec: number | null;
  is_in_lap: boolean;
  is_out_lap: boolean;
  speed_i1: number | null;
  speed_i2: number | null;
  speed_fl: number | null;
  speed_st: number | null;
  air_temp: number | null;
  track_temp: number | null;
  humidity: number | null;
  pressure: number | null;
  rainfall: boolean | null;
  wind_speed: number | null;
  wind_direction: number | null;
  gap_ahead_sec: number | null;
  gap_behind_sec: number | null;
  gap_ahead_prev_sec: number | null;
  gap_behind_prev_sec: number | null;
  driver_ahead: string | null;
  driver_behind: string | null;
};

export type LapTelemetryRow = {
  race_id: number;
  driver_code: string;
  lap_number: number;
  tel_speed_max: number | null;
  tel_speed_min: number | null;
  tel_speed_mean: number | null;
  tel_speed_std: number | null;
  tel_throttle_mean: number | null;
  tel_throttle_std: number | null;
  tel_pct_full_throttle: number | null;
  tel_pct_coast: number | null;
  tel_pct_braking: number | null;
  tel_n_brake_zones: number | null;
  tel_n_gear_mode: number | null;
  tel_gear_mean: number | null;
  tel_n_gear_shifts: number | null;
  tel_pct_drs_open: number | null;
  tel_n_drs_activations: number | null;
  tel_rpm_max: number | null;
  tel_rpm_mean: number | null;
  tel_rpm_std: number | null;
  tel_pct_slow: number | null;
  tel_pct_fast: number | null;
  tel_accel_p99: number | null;
  tel_decel_p01: number | null;
  tel_lap_dist_m: number | null;
  tel_n_samples: number | null;
  tel_span_sec: number | null;
  tel_valid_frac: number | null;
};

export type ModelRunRow = {
  id: number;
  name: string;
  purpose: "experiment" | "generalization" | "final";
  scheme: Scheme | null;
  model_type: ModelType;
  feature_set: string;
  window_size: number | null;
  feature_names: string[] | null;
  hyperparams: Json;
  artifact_ref: string | null;
  notes: string | null;
  is_default: boolean;
  created_at: string;
};

export type LapPredictionRow = {
  model_run_id: number;
  race_id: number;
  driver_code: string;
  lap_number: number;
  predicted_lap_time_sec: number;
  origin: PredictionOrigin;
};

export type ExperimentResultRow = {
  id: number;
  scheme: Scheme;
  fold_label: string;
  model_type: ModelType;
  feature_set: string;
  n_test: number;
  rmse: number;
  mae: number;
  mape: number | null;
  seed_std_rmse: number | null;
  train_rmse: number | null;
  val_rmse: number | null;
  epochs: number | null;
  window_size: number | null;
  units: number | null;
  dropout: number | null;
  dense_units: number | null;
  learning_rate: number | null;
  batch_size: number | null;
};

type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      circuits: ReadOnlyTable<CircuitRow>;
      drivers: ReadOnlyTable<DriverRow>;
      teams: ReadOnlyTable<TeamRow>;
      races: ReadOnlyTable<RaceRow>;
      race_entries: ReadOnlyTable<RaceEntryRow>;
      laps: ReadOnlyTable<LapRow>;
      lap_telemetry: ReadOnlyTable<LapTelemetryRow>;
      model_runs: ReadOnlyTable<ModelRunRow>;
      lap_predictions: ReadOnlyTable<LapPredictionRow>;
      experiment_results: ReadOnlyTable<ExperimentResultRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      race_bundle: {
        Args: { p_race_id: number; p_model_run_id?: number };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
