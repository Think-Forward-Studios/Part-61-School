-- Phase 8 migration (part 7): training_activity_trail view (REP-02).
--
-- Hand-authored. 08-03 owns migration 0038 exclusively.
--
-- Derives a single audit trail row per reservation joining:
--   - reservation (scheduler, authorizer, lifecycle timestamps)
--   - flight_log_entry (flight_out / flight_in — ramp-out / ramp-in timestamps)
--   - lesson_grade_sheet (close-out attestation count)
--
-- Read-only view. security_invoker = true so RLS on the underlying
-- reservation / flight_log_entry / lesson_grade_sheet tables flows
-- through per-query (base filter + school_id filter).
--
-- No new indexes — the underlying reservation table already has
-- school_id + time_range indexes suitable for REP-02 filters.

create or replace view public.training_activity_trail
  with (security_invoker = true) as
select
  r.id                 as reservation_id,
  r.school_id,
  r.base_id,
  r.activity_type,
  r.student_id,
  r.instructor_id,
  r.requested_by,
  r.requested_at,
  r.approved_by,
  r.approved_at,
  (select fo.flown_at
     from public.flight_log_entry fo
    where fo.kind = 'flight_out'
      and fo.aircraft_id = r.aircraft_id
      and fo.flown_at >= lower(r.time_range)
      and fo.flown_at <  upper(r.time_range)
    order by fo.flown_at asc
    limit 1)          as ramp_out_at,
  (select fi.flown_at
     from public.flight_log_entry fi
    where fi.kind = 'flight_in'
      and fi.aircraft_id = r.aircraft_id
      and fi.flown_at >= lower(r.time_range)
      and fi.flown_at <  upper(r.time_range) + interval '6 hours'
    order by fi.flown_at asc
    limit 1)          as ramp_in_at,
  r.closed_at,
  r.closed_by,
  (select count(*)
     from public.lesson_grade_sheet gs
    where gs.reservation_id = r.id
      and gs.deleted_at is null) as grade_sheet_count,
  r.status,
  r.close_out_reason
from public.reservation r
where r.deleted_at is null;

comment on view public.training_activity_trail is
  'REP-02 training activity audit trail. One row per reservation with '
  'scheduler / authorizer / ramp-out / ramp-in / close-out derived from '
  'flight_log_entry + lesson_grade_sheet. security_invoker = true so '
  'RLS on underlying tables flows through per-query.';

grant select on public.training_activity_trail to authenticated;
