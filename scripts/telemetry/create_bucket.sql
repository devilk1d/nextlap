-- Public, read-only bucket for the replay's car-data files (scripts/telemetry/upload_telemetry.py).
--
-- Public bucket: anyone may GET /storage/v1/object/public/telemetry/<race>/<DRIVER>.json.
-- No policies on storage.objects are added, so the anon and authenticated roles cannot upload,
-- change or list; writes need the service role key (which bypasses RLS) and stay with the script.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('telemetry', 'telemetry', true, 5242880, array['application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
