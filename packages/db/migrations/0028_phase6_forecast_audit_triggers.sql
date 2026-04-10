-- Phase 6 migration (part 6): forecast functions + audit sweep + triggers.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000015_phase6_forecast_audit_triggers.sql.
--
-- Creates:
--   1. student_progress_forecast(enrollment_id) — cadence math, ahead/behind
--   2. refresh_student_progress_forecast(enrollment_id) — SELECT FOR UPDATE cache upsert
--   3. run_training_record_audit() — nightly sweep, SECURITY DEFINER
--   4. Triggers:
--      a. trg_flight_log_time_refresh_forecast — AFTER INSERT/UPDATE on flight_log_time
--      b. trg_enrollment_cadence_refresh_forecast — AFTER UPDATE on enrollment
--      c. trg_course_version_refresh_forecast — AFTER UPDATE on course_version

-- ============================================================================
-- 0. Drop audit trigger on student_progress_forecast_cache
-- ============================================================================
-- The cache table has no `id` column (uses student_enrollment_id as PK),
-- which causes audit.fn_log_change() to fail with record_id NOT NULL
-- violation. This is a cache table (not safety-relevant), so dropping
-- the audit trigger is correct. The trigger was added in 0025 as
-- audit-only (no hard-delete blocker).
drop trigger if exists student_progress_forecast_cache_audit
  on public.student_progress_forecast_cache;

-- ============================================================================
-- 1. student_progress_forecast(p_enrollment_id)
-- ============================================================================
-- Returns jsonb matching student_progress_forecast_cache columns.
-- Reads enrollment cadence (with course_version fallback), computes
-- weeks_elapsed, expected vs actual hours, ahead/behind, projected dates.
create or replace function public.student_progress_forecast(
  p_enrollment_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_enrolled_at          timestamptz;
  v_cadence              numeric;
  v_minimum_hours_total  numeric;
  v_weeks_elapsed        numeric;
  v_expected_hours       numeric;
  v_actual_hours         numeric;
  v_ahead_behind_hours   numeric;
  v_ahead_behind_weeks   numeric;
  v_remaining_hours      numeric;
  v_projected_checkride  date;
  v_projected_completion date;
  v_confidence           text;
  v_student_user_id      uuid;
  v_school_id            uuid;
  v_base_id              uuid;
begin
  -- Fetch enrollment + course_version data
  select
    sce.enrolled_at,
    coalesce(sce.plan_cadence_hours_per_week,
             cv.default_plan_cadence_hours_per_week),
    coalesce((cv.minimum_hours ->> 'total')::numeric, 0),
    sce.user_id,
    sce.school_id,
    coalesce(
      (select b.id from public.bases b where b.school_id = sce.school_id limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  into v_enrolled_at, v_cadence, v_minimum_hours_total,
       v_student_user_id, v_school_id, v_base_id
  from public.student_course_enrollment sce
  left join public.course_version cv on cv.id = sce.course_version_id
  where sce.id = p_enrollment_id;

  if v_enrolled_at is null then
    return jsonb_build_object('error', 'enrollment_not_found');
  end if;

  -- Default cadence if none set
  v_cadence := coalesce(v_cadence, 3);

  -- Compute weeks elapsed since enrollment
  v_weeks_elapsed := greatest(
    extract(epoch from now() - v_enrolled_at) / 604800.0,
    0
  );

  -- Expected cumulative hours at this point
  v_expected_hours := round(v_weeks_elapsed * v_cadence, 2);

  -- Actual hours: sum of flight_log_time for this student
  -- Kinds that count: dual_received, solo, pic
  select coalesce(
    round(sum(flt.day_minutes + flt.night_minutes) / 60.0, 2),
    0
  ) into v_actual_hours
  from public.flight_log_time flt
  where flt.user_id = v_student_user_id
    and flt.kind in ('dual_received', 'solo', 'pic')
    and flt.deleted_at is null;

  -- Ahead/behind
  v_ahead_behind_hours := round(v_actual_hours - v_expected_hours, 2);

  -- Avoid division by zero
  if v_cadence > 0 then
    v_ahead_behind_weeks := round(v_ahead_behind_hours / v_cadence, 2);
  else
    v_ahead_behind_weeks := 0;
  end if;

  -- Remaining hours to minimum
  v_remaining_hours := greatest(0, v_minimum_hours_total - v_actual_hours);

  -- Projected checkride date
  if v_cadence > 0 and v_remaining_hours > 0 then
    v_projected_checkride := current_date +
      (ceil(v_remaining_hours / v_cadence) * 7)::integer;
  elsif v_remaining_hours <= 0 then
    v_projected_checkride := current_date;
  else
    v_projected_checkride := null;
  end if;

  -- Projected completion date (checkride + 14 days buffer)
  if v_projected_checkride is not null then
    v_projected_completion := v_projected_checkride + 14;
  end if;

  -- Confidence level based on weeks elapsed
  v_confidence := case
    when v_weeks_elapsed < 4 then 'low'
    when v_weeks_elapsed < 12 then 'medium'
    else 'high'
  end;

  return jsonb_build_object(
    'student_enrollment_id', p_enrollment_id,
    'school_id', v_school_id,
    'base_id', v_base_id,
    'computed_at', now(),
    'expected_hours_to_date', v_expected_hours,
    'actual_hours_to_date', v_actual_hours,
    'ahead_behind_hours', v_ahead_behind_hours,
    'ahead_behind_weeks', v_ahead_behind_weeks,
    'remaining_hours', v_remaining_hours,
    'projected_checkride_date', v_projected_checkride,
    'projected_completion_date', v_projected_completion,
    'confidence', v_confidence
  );
end;
$$;

grant execute on function public.student_progress_forecast(uuid) to authenticated;

-- ============================================================================
-- 2. refresh_student_progress_forecast(p_enrollment_id)
-- ============================================================================
-- Mirror of Phase 4 recompute_maintenance_status SELECT FOR UPDATE pattern.
-- Serializes on the cache row, computes via student_progress_forecast(),
-- upserts into cache.
create or replace function public.refresh_student_progress_forecast(
  p_enrollment_id uuid
) returns void
language plpgsql
security invoker
as $$
declare
  v_forecast jsonb;
  v_school_id uuid;
  v_base_id uuid;
begin
  -- Serialize: lock existing cache row if present
  perform 1
  from public.student_progress_forecast_cache
  where student_enrollment_id = p_enrollment_id
  for update;

  -- Compute forecast
  v_forecast := public.student_progress_forecast(p_enrollment_id);

  -- Skip if error
  if v_forecast ? 'error' then
    return;
  end if;

  v_school_id := (v_forecast ->> 'school_id')::uuid;
  v_base_id := (v_forecast ->> 'base_id')::uuid;

  -- Upsert into cache
  insert into public.student_progress_forecast_cache (
    student_enrollment_id,
    school_id,
    base_id,
    computed_at,
    expected_hours_to_date,
    actual_hours_to_date,
    ahead_behind_hours,
    ahead_behind_weeks,
    remaining_hours,
    projected_checkride_date,
    projected_completion_date,
    confidence
  ) values (
    p_enrollment_id,
    v_school_id,
    v_base_id,
    now(),
    (v_forecast ->> 'expected_hours_to_date')::numeric,
    (v_forecast ->> 'actual_hours_to_date')::numeric,
    (v_forecast ->> 'ahead_behind_hours')::numeric,
    (v_forecast ->> 'ahead_behind_weeks')::numeric,
    (v_forecast ->> 'remaining_hours')::numeric,
    (v_forecast ->> 'projected_checkride_date')::date,
    (v_forecast ->> 'projected_completion_date')::date,
    v_forecast ->> 'confidence'
  )
  on conflict (student_enrollment_id) do update
    set school_id                = excluded.school_id,
        base_id                  = excluded.base_id,
        computed_at              = excluded.computed_at,
        expected_hours_to_date   = excluded.expected_hours_to_date,
        actual_hours_to_date     = excluded.actual_hours_to_date,
        ahead_behind_hours       = excluded.ahead_behind_hours,
        ahead_behind_weeks       = excluded.ahead_behind_weeks,
        remaining_hours          = excluded.remaining_hours,
        projected_checkride_date = excluded.projected_checkride_date,
        projected_completion_date= excluded.projected_completion_date,
        confidence               = excluded.confidence;
end;
$$;

grant execute on function public.refresh_student_progress_forecast(uuid) to authenticated;

-- ============================================================================
-- 3. run_training_record_audit()
-- ============================================================================
-- Nightly sweep: iterates active enrollments, detects exceptions,
-- upserts into training_record_audit_exception, resolves stale ones.
-- SECURITY DEFINER so it can bypass RLS (called from pg_cron as superuser).
create or replace function public.run_training_record_audit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_started_at timestamptz := now();
  v_enrollment record;
  v_actual_hours numeric;
  v_minimum_total numeric;
  v_weeks_elapsed numeric;
  v_total_course_weeks numeric;
begin
  -- Iterate all active enrollments
  for v_enrollment in
    select
      sce.id as enrollment_id,
      sce.school_id,
      coalesce(
        (select b.id from public.bases b where b.school_id = sce.school_id limit 1),
        '00000000-0000-0000-0000-000000000000'::uuid
      ) as base_id,
      sce.user_id as student_user_id,
      sce.enrolled_at,
      cv.minimum_hours,
      coalesce(sce.plan_cadence_hours_per_week,
               cv.default_plan_cadence_hours_per_week, 3) as cadence
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    where sce.completed_at is null
      and sce.withdrawn_at is null
      and sce.deleted_at is null
  loop

    -- ---- hours_deficit check ----
    v_minimum_total := coalesce((v_enrollment.minimum_hours ->> 'total')::numeric, 0);

    if v_minimum_total > 0 and v_enrollment.cadence > 0 then
      -- Actual hours for this student
      select coalesce(round(sum(flt.day_minutes + flt.night_minutes) / 60.0, 2), 0)
        into v_actual_hours
      from public.flight_log_time flt
      where flt.user_id = v_enrollment.student_user_id
        and flt.kind in ('dual_received', 'solo', 'pic')
        and flt.deleted_at is null;

      -- Estimate total course duration in weeks
      v_total_course_weeks := v_minimum_total / v_enrollment.cadence;
      v_weeks_elapsed := greatest(
        extract(epoch from now() - v_enrollment.enrolled_at) / 604800.0,
        0
      );

      -- hours_deficit: >90% of schedule elapsed but <60% of required hours
      if v_weeks_elapsed > v_total_course_weeks * 0.9
         and v_actual_hours < v_minimum_total * 0.6
      then
        insert into public.training_record_audit_exception
          (school_id, base_id, student_enrollment_id, kind, severity, details,
           first_detected_at, last_detected_at)
        values (
          v_enrollment.school_id,
          v_enrollment.base_id,
          v_enrollment.enrollment_id,
          'hours_deficit',
          'critical',
          jsonb_build_object(
            'required_hours', v_minimum_total,
            'actual_hours', v_actual_hours,
            'weeks_elapsed', round(v_weeks_elapsed, 1),
            'estimated_course_weeks', round(v_total_course_weeks, 1)
          ),
          v_run_started_at,
          v_run_started_at
        )
        on conflict (student_enrollment_id, kind)
          where resolved_at is null
        do update set
          last_detected_at = v_run_started_at,
          details = excluded.details,
          updated_at = now();
      end if;
    end if;

    -- ---- missing_stage_checks ----
    -- Stages with completed lessons but no passed stage_check
    if exists (
      select 1
      from public.stage s
      join public.lesson l on l.stage_id = s.id
        or l.course_phase_id in (
          select cp.id from public.course_phase cp where cp.stage_id = s.id
        )
      join public.lesson_grade_sheet gs on gs.lesson_id = l.id
        and gs.student_enrollment_id = v_enrollment.enrollment_id
        and gs.sealed_at is not null
      left join public.stage_check sc on sc.stage_id = s.id
        and sc.student_enrollment_id = v_enrollment.enrollment_id
        and sc.status = 'passed'
      where s.course_version_id = (
        select course_version_id from public.student_course_enrollment
        where id = v_enrollment.enrollment_id
      )
        and sc.id is null
    ) then
      insert into public.training_record_audit_exception
        (school_id, base_id, student_enrollment_id, kind, severity, details,
         first_detected_at, last_detected_at)
      values (
        v_enrollment.school_id,
        v_enrollment.base_id,
        v_enrollment.enrollment_id,
        'missing_stage_checks',
        'warn',
        jsonb_build_object('description', 'Stage has completed lessons but no passed stage check'),
        v_run_started_at,
        v_run_started_at
      )
      on conflict (student_enrollment_id, kind)
        where resolved_at is null
      do update set
        last_detected_at = v_run_started_at,
        details = excluded.details,
        updated_at = now();
    end if;

    -- ---- stale_rollovers ----
    -- line_item_grade with rollover_from_grade_sheet_id that has no later
    -- passing grade and the original grade sheet was sealed > 30 days ago
    if exists (
      select 1
      from public.line_item_grade lig
      join public.lesson_grade_sheet gs on gs.id = lig.grade_sheet_id
      where gs.student_enrollment_id = v_enrollment.enrollment_id
        and lig.rollover_from_grade_sheet_id is not null
        and gs.sealed_at < now() - interval '30 days'
        and not exists (
          select 1
          from public.line_item_grade lig2
          join public.lesson_grade_sheet gs2 on gs2.id = lig2.grade_sheet_id
          join public.line_item li on li.id = lig2.line_item_id
          where gs2.student_enrollment_id = v_enrollment.enrollment_id
            and gs2.sealed_at > gs.sealed_at
            and lig2.line_item_id = lig.line_item_id
            and public.is_passing_grade(
              coalesce(li.grading_scale_override::text,
                       (select cv.grading_scale::text
                        from public.course_version cv
                        where cv.id = li.course_version_id)),
              lig2.grade_value)
        )
    ) then
      insert into public.training_record_audit_exception
        (school_id, base_id, student_enrollment_id, kind, severity, details,
         first_detected_at, last_detected_at)
      values (
        v_enrollment.school_id,
        v_enrollment.base_id,
        v_enrollment.enrollment_id,
        'stale_rollovers',
        'warn',
        jsonb_build_object('description', 'Rollover line items outstanding for more than 30 days'),
        v_run_started_at,
        v_run_started_at
      )
      on conflict (student_enrollment_id, kind)
        where resolved_at is null
      do update set
        last_detected_at = v_run_started_at,
        details = excluded.details,
        updated_at = now();
    end if;

    -- ---- expired_overrides ----
    -- lesson_override where expires_at < now() AND consumed_at IS NULL
    if exists (
      select 1
      from public.lesson_override lo
      where lo.student_enrollment_id = v_enrollment.enrollment_id
        and lo.expires_at < now()
        and lo.consumed_at is null
        and lo.revoked_at is null
        and lo.deleted_at is null
    ) then
      insert into public.training_record_audit_exception
        (school_id, base_id, student_enrollment_id, kind, severity, details,
         first_detected_at, last_detected_at)
      values (
        v_enrollment.school_id,
        v_enrollment.base_id,
        v_enrollment.enrollment_id,
        'expired_overrides',
        'info',
        jsonb_build_object('description', 'Unconsumed lesson overrides have expired'),
        v_run_started_at,
        v_run_started_at
      )
      on conflict (student_enrollment_id, kind)
        where resolved_at is null
      do update set
        last_detected_at = v_run_started_at,
        details = excluded.details,
        updated_at = now();
    end if;

    -- ---- Refresh forecast for this enrollment ----
    perform public.refresh_student_progress_forecast(v_enrollment.enrollment_id);

  end loop;

  -- ---- Resolve exceptions NOT touched this run ----
  update public.training_record_audit_exception
  set resolved_at = v_run_started_at,
      updated_at = now()
  where last_detected_at < v_run_started_at
    and resolved_at is null;
end;
$$;

grant execute on function public.run_training_record_audit() to authenticated;

-- ============================================================================
-- 4a. Trigger: flight_log_time -> refresh forecast for affected enrollments
-- ============================================================================
create or replace function public.fn_flight_log_time_refresh_forecast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
begin
  -- Find all active enrollments for this student
  for v_enrollment_id in
    select id from public.student_course_enrollment
    where user_id = new.user_id
      and completed_at is null
      and withdrawn_at is null
      and deleted_at is null
  loop
    perform public.refresh_student_progress_forecast(v_enrollment_id);
  end loop;

  return new;
end;
$$;

create trigger trg_flight_log_time_refresh_forecast
  after insert or update on public.flight_log_time
  for each row execute function public.fn_flight_log_time_refresh_forecast();

-- ============================================================================
-- 4b. Trigger: enrollment cadence change -> refresh that enrollment's forecast
-- ============================================================================
create or replace function public.fn_enrollment_cadence_refresh_forecast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.plan_cadence_hours_per_week is distinct from new.plan_cadence_hours_per_week then
    perform public.refresh_student_progress_forecast(new.id);
  end if;
  return new;
end;
$$;

create trigger trg_enrollment_cadence_refresh_forecast
  after update on public.student_course_enrollment
  for each row execute function public.fn_enrollment_cadence_refresh_forecast();

-- ============================================================================
-- 4c. Trigger: course_version minimums/cadence change -> refresh all enrollments
-- ============================================================================
create or replace function public.fn_course_version_refresh_forecast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
begin
  if old.minimum_hours is distinct from new.minimum_hours
     or old.default_plan_cadence_hours_per_week is distinct from new.default_plan_cadence_hours_per_week
  then
    for v_enrollment_id in
      select id from public.student_course_enrollment
      where course_version_id = new.id
        and completed_at is null
        and withdrawn_at is null
        and deleted_at is null
    loop
      perform public.refresh_student_progress_forecast(v_enrollment_id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_course_version_refresh_forecast
  after update on public.course_version
  for each row execute function public.fn_course_version_refresh_forecast();
