-- Phase 6 migration (part 4): views for course minimums + override activity.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000013_phase6_views.sql.
--
-- Creates:
--   1. student_course_minimums_status view (SYL-21)
--   2. management_override_activity view (IPF-06)

-- ============================================================================
-- 1. student_course_minimums_status (SYL-21)
-- ============================================================================
-- For each active enrollment, compares actual flight time (from flight_log_time)
-- against the course_version.minimum_hours jsonb.
--
-- Returns one row per (enrollment, category) with:
--   required, actual, remaining, percent columns.
--
-- Uses security_invoker so RLS on underlying tables flows through.
create view public.student_course_minimums_status
  with (security_invoker = true) as
with enrollment_data as (
  select
    sce.id as enrollment_id,
    sce.school_id,
    sce.user_id as student_user_id,
    cv.minimum_hours
  from public.student_course_enrollment sce
  join public.course_version cv on cv.id = sce.course_version_id
  where sce.completed_at is null
    and sce.withdrawn_at is null
    and cv.minimum_hours is not null
    and cv.minimum_hours != '{}'::jsonb
),
student_totals as (
  select
    flt.user_id,
    flt.school_id,
    round(sum(flt.day_minutes + flt.night_minutes) / 60.0, 1)      as total_hours,
    round(sum(case when flt.kind = 'dual_received'
              then flt.day_minutes + flt.night_minutes else 0 end)
              / 60.0, 1)                                             as dual_hours,
    round(sum(case when flt.kind = 'solo'
              then flt.day_minutes + flt.night_minutes else 0 end)
              / 60.0, 1)                                             as solo_hours,
    round(sum(flt.cross_country_minutes) / 60.0, 1)                 as cross_country_hours,
    round(sum(flt.night_minutes) / 60.0, 1)                         as night_hours,
    round(sum(flt.instrument_actual_minutes
              + flt.instrument_simulated_minutes) / 60.0, 1)        as instrument_hours,
    -- Solo cross-country approximation: solo flights with cross_country > 0
    round(sum(case when flt.kind = 'solo' then flt.cross_country_minutes else 0 end)
              / 60.0, 1)                                             as solo_cross_country_hours,
    sum(flt.day_landings)                                            as day_landings,
    sum(flt.night_landings)                                          as night_landings
  from public.flight_log_time flt
  where flt.deleted_at is null
  group by flt.user_id, flt.school_id
),
categories as (
  select
    ed.enrollment_id,
    ed.school_id,
    cat.key as category,
    (cat.value)::numeric as required,
    case cat.key
      when 'total' then coalesce(st.total_hours, 0)
      when 'dual' then coalesce(st.dual_hours, 0)
      when 'solo' then coalesce(st.solo_hours, 0)
      when 'cross_country' then coalesce(st.cross_country_hours, 0)
      when 'night' then coalesce(st.night_hours, 0)
      when 'instrument' then coalesce(st.instrument_hours, 0)
      when 'solo_cross_country' then coalesce(st.solo_cross_country_hours, 0)
      when 'landings_day' then coalesce(st.day_landings, 0)
      when 'landings_night' then coalesce(st.night_landings, 0)
      else 0
    end::numeric as actual
  from enrollment_data ed
  cross join lateral jsonb_each_text(ed.minimum_hours) as cat(key, value)
  left join student_totals st
    on st.user_id = ed.student_user_id
    and st.school_id = ed.school_id
  -- Exclude nested objects (e.g. solo_cross_country_long) — only numeric keys
  where jsonb_typeof(ed.minimum_hours -> cat.key) = 'number'
)
select
  enrollment_id,
  school_id,
  category,
  required,
  actual,
  greatest(required - actual, 0) as remaining,
  case when required > 0
       then least(round((actual / required) * 100, 1), 100)
       else 100
  end as percent
from categories;

comment on view public.student_course_minimums_status is
  'Per-enrollment, per-category progress toward FAA Part 61 course minimums. '
  'Compares flight_log_time aggregates against course_version.minimum_hours. '
  'security_invoker=true so RLS flows through.';

-- ============================================================================
-- 2. management_override_activity (IPF-06)
-- ============================================================================
-- Last 30 days of lesson_override rows for the admin dashboard panel.
create view public.management_override_activity
  with (security_invoker = true) as
select
  lo.id as override_id,
  lo.school_id,
  lo.base_id,
  lo.student_enrollment_id,
  lo.lesson_id,
  lo.kind,
  lo.justification,
  lo.granted_at,
  lo.granted_by_user_id,
  grantor.full_name as granted_by_name,
  lo.signer_snapshot,
  lo.expires_at,
  lo.consumed_at,
  lo.consumed_by_grade_sheet_id,
  lo.revoked_at,
  lo.revoked_by_user_id,
  lo.revocation_reason,
  sce.user_id as student_user_id,
  student.full_name as student_name,
  l.title as lesson_title,
  l.code as lesson_code
from public.lesson_override lo
join public.student_course_enrollment sce on sce.id = lo.student_enrollment_id
join public.users student on student.id = sce.user_id
left join public.users grantor on grantor.id = lo.granted_by_user_id
join public.lesson l on l.id = lo.lesson_id
where lo.granted_at >= now() - interval '30 days'
  and lo.deleted_at is null;

comment on view public.management_override_activity is
  'Recent lesson overrides (last 30 days) for the admin dashboard IPF-06 panel. '
  'security_invoker=true so RLS on lesson_override + users flows through.';
