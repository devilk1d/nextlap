-- How one stored prediction splits into the contribution of each feature group.
-- Filled by `python -m scripts.explain_predictions --write` (service-role key); read by the website.
--
--   predicted_lap_time_sec (lap_predictions)
--     = window_mean_sec + baseline_shift + c_pace + c_progress + c_telemetry + c_tyres
--       + c_weather + c_traffic + c_track
--
-- All values are seconds. A contribution is how far a group moves the prediction away from the
-- model's output when that group is neutral (window-relative features flat, the rest at the race
-- median); `ref_*` are those race medians. Exact Shapley values over the seven groups.
create table if not exists public.prediction_factors (
  model_run_id     bigint           not null references public.model_runs (id) on delete cascade,
  race_id          integer          not null,
  driver_code      text             not null,
  lap_number       smallint         not null,
  window_mean_sec  double precision not null,
  baseline_shift   double precision not null,
  c_pace           double precision not null,
  c_progress       double precision not null,
  c_telemetry      double precision not null,
  c_tyres          double precision not null,
  c_weather        double precision not null,
  c_traffic        double precision not null,
  c_track          double precision not null,
  ref_gap_ahead    double precision,
  ref_tyre_life    double precision,
  ref_track_temp   double precision,
  primary key (model_run_id, race_id, driver_code, lap_number),
  foreign key (race_id, driver_code, lap_number)
    references public.laps (race_id, driver_code, lap_number) on delete cascade
);

alter table public.prediction_factors enable row level security;

create policy prediction_factors_public_read on public.prediction_factors
  for select to anon, authenticated using (true);

grant select on public.prediction_factors to anon, authenticated;
