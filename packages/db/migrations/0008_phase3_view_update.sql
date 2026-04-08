-- Phase 3 migration (part 2 of 2): aircraft_current_totals view update.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260408000001_phase3_view_update.sql.
--
-- Why a separate file: 0007 ran `ALTER TYPE flight_log_entry_kind ADD
-- VALUE 'flight_out' / 'flight_in'`. Postgres forbids using a freshly
-- added enum value in the same transaction that added it. By splitting
-- the view replacement into its own file, supabase/Drizzle migrations
-- run it in a separate transaction and the new values are visible.
--
-- The view must handle BOTH:
--   - Legacy single-row Phase 2 `kind='flight'` entries (in - out)
--   - New paired Phase 3 `kind='flight_out' + 'flight_in'` rows
--   - `baseline` rows (initial totals)
--   - `correction` rows (signed deltas)
--
-- For paired rows we count ONLY the `flight_in` (closed flights). The
-- `flight_in` row stores hobbs_in / tach_in and links back to its
-- matching `flight_out` via `paired_entry_id`, where hobbs_out / tach_out
-- live. In-progress flights (flight_out with no matching flight_in) are
-- intentionally excluded — the dispatch screen surfaces those live;
-- the totals view shows confirmed history.

drop view if exists public.aircraft_current_totals;

create view public.aircraft_current_totals
with (security_invoker = true)
as
select
  a.id as aircraft_id,
  a.school_id,
  a.base_id,

  -- Hobbs total
  coalesce(
    (select sum(coalesce(fl.hobbs_in, 0) - coalesce(fl.hobbs_out, 0))
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind in ('flight','correction')),
    0
  )
  + coalesce(
    (select sum(
       coalesce(fl_in.hobbs_in, 0)
       - coalesce(
           (select fl_out.hobbs_out
              from public.flight_log_entry fl_out
             where fl_out.id = fl_in.paired_entry_id),
           0
         )
       )
       from public.flight_log_entry fl_in
      where fl_in.aircraft_id = a.id
        and fl_in.kind = 'flight_in'),
    0
  )
  + coalesce(
    (select max(fl.hobbs_in)
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind = 'baseline'),
    0
  ) as current_hobbs,

  -- Tach total
  coalesce(
    (select sum(coalesce(fl.tach_in, 0) - coalesce(fl.tach_out, 0))
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind in ('flight','correction')),
    0
  )
  + coalesce(
    (select sum(
       coalesce(fl_in.tach_in, 0)
       - coalesce(
           (select fl_out.tach_out
              from public.flight_log_entry fl_out
             where fl_out.id = fl_in.paired_entry_id),
           0
         )
       )
       from public.flight_log_entry fl_in
      where fl_in.aircraft_id = a.id
        and fl_in.kind = 'flight_in'),
    0
  )
  + coalesce(
    (select max(fl.tach_in)
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind = 'baseline'),
    0
  ) as current_tach,

  -- Airframe total (sum of all signed deltas)
  coalesce(
    (select sum(fl.airframe_delta)
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id),
    0
  ) as current_airframe,

  -- Last flown timestamp (any flight kind)
  (select max(fl.flown_at)
     from public.flight_log_entry fl
    where fl.aircraft_id = a.id
      and fl.kind in ('flight','flight_in','correction')) as last_flown_at

from public.aircraft a;

grant select on public.aircraft_current_totals to authenticated;
