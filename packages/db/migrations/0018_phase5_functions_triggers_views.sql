-- Phase 5 migration (part 5 of 5): SQL functions, triggers, and views.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000005_phase5_functions_triggers_views.sql.
--
-- Layers on top of 0016 + 0017 tables. Provides:
--   1. is_course_version_published(course_version_id)
--   2. fn_syllabus_seal_guard()     — BEFORE UPDATE trigger on
--      lesson_grade_sheet, stage_check, student_endorsement, course_version.
--      Rejects any update to a sealed row; validates sealing transitions.
--   3. fn_syllabus_tree_seal_guard() — BEFORE UPDATE trigger on stage,
--      course_phase, unit, lesson, line_item. Rejects edits to children
--      of a published course_version (transitive seal).
--   4. fn_stage_check_different_instructor() — BEFORE INSERT/UPDATE
--      trigger on stage_check. Forbids checker_user_id = enrollment
--      primary_instructor_id.
--   5. fn_flight_log_time_hobbs_invariant() — BEFORE INSERT/UPDATE
--      trigger on flight_log_time. day + night must be within ±6 min of
--      the paired hobbs delta (if paired entry exists).
--   6. clone_course_version(source_id, target_school_id) — PL/pgSQL deep
--      clone of an entire course version tree in a single transaction.
--   7. compute_recency_currency(user_id, kind) — reads flight_log_time
--      for 61.57 recency computation. v1 stub returns most-recent event.
--   8. user_flight_log_totals view (security_invoker = true).

-- ============================================================================
-- 1. is_course_version_published
-- ============================================================================
create or replace function public.is_course_version_published(p_cv_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists(
    select 1 from public.course_version
     where id = p_cv_id and published_at is not null
  );
$$;

-- ============================================================================
-- 2. Seal guard for lesson_grade_sheet / stage_check / student_endorsement
-- ============================================================================
create or replace function public.fn_syllabus_seal_guard()
returns trigger
language plpgsql
as $$
declare
  v_was_sealed boolean;
begin
  -- Determine whether the OLD row was sealed. Different tables flag it
  -- differently: lesson_grade_sheet / stage_check use `sealed_at is not null`,
  -- student_endorsement uses `sealed` boolean.
  if tg_table_name = 'student_endorsement' then
    v_was_sealed := coalesce((old).sealed, false);
  elsif tg_table_name in ('lesson_grade_sheet', 'stage_check') then
    v_was_sealed := (old).sealed_at is not null;
  elsif tg_table_name = 'course_version' then
    v_was_sealed := (old).published_at is not null
                    and (new).published_at is not null
                    and (old).published_at = (new).published_at;
    -- Editing a published course_version is forbidden unless the only
    -- change is setting superseded_at.
    if (old).published_at is not null then
      if (new).superseded_at is distinct from (old).superseded_at then
        return new;
      end if;
      raise exception
        'course_version % is published and cannot be modified', (old).id
        using errcode = 'P0001';
    end if;
    return new;
  else
    return new;
  end if;

  if v_was_sealed then
    raise exception
      '% % is sealed and cannot be modified', tg_table_name, (old).id
      using errcode = 'P0001';
  end if;

  -- Validate sealing transitions require signer_snapshot
  if tg_table_name = 'student_endorsement' then
    if (new).sealed = true and coalesce((old).sealed, false) = false then
      if (new).signer_snapshot is null or (new).sealed_at is null then
        raise exception
          'sealing % % requires signer_snapshot and sealed_at', tg_table_name, (old).id
          using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name in ('lesson_grade_sheet', 'stage_check') then
    if (new).sealed_at is not null and (old).sealed_at is null then
      if (new).signer_snapshot is null then
        raise exception
          'sealing % % requires signer_snapshot', tg_table_name, (old).id
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger lesson_grade_sheet_seal_guard
  before update on public.lesson_grade_sheet
  for each row execute function public.fn_syllabus_seal_guard();

create trigger stage_check_seal_guard
  before update on public.stage_check
  for each row execute function public.fn_syllabus_seal_guard();

create trigger student_endorsement_seal_guard
  before update on public.student_endorsement
  for each row execute function public.fn_syllabus_seal_guard();

create trigger course_version_seal_guard
  before update on public.course_version
  for each row execute function public.fn_syllabus_seal_guard();

-- ============================================================================
-- 3. Transitive seal on tree children
-- ============================================================================
create or replace function public.fn_syllabus_tree_seal_guard()
returns trigger
language plpgsql
as $$
declare
  v_cv_id uuid;
begin
  v_cv_id := (new).course_version_id;
  if v_cv_id is null then
    v_cv_id := (old).course_version_id;
  end if;
  if v_cv_id is not null and public.is_course_version_published(v_cv_id) then
    raise exception
      '% % belongs to a published course_version and cannot be modified',
      tg_table_name, (old).id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger stage_tree_seal_guard
  before update on public.stage
  for each row execute function public.fn_syllabus_tree_seal_guard();
create trigger course_phase_tree_seal_guard
  before update on public.course_phase
  for each row execute function public.fn_syllabus_tree_seal_guard();
create trigger unit_tree_seal_guard
  before update on public.unit
  for each row execute function public.fn_syllabus_tree_seal_guard();
create trigger lesson_tree_seal_guard
  before update on public.lesson
  for each row execute function public.fn_syllabus_tree_seal_guard();
create trigger line_item_tree_seal_guard
  before update on public.line_item
  for each row execute function public.fn_syllabus_tree_seal_guard();

-- ============================================================================
-- 4. stage_check different-instructor trigger
-- ============================================================================
create or replace function public.fn_stage_check_different_instructor()
returns trigger
language plpgsql
as $$
declare
  v_primary_instructor uuid;
begin
  select primary_instructor_id into v_primary_instructor
    from public.student_course_enrollment
   where id = (new).student_enrollment_id;
  if v_primary_instructor is not null
     and v_primary_instructor = (new).checker_user_id then
    raise exception
      'stage_check checker must differ from enrollment primary_instructor_id'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger stage_check_different_instructor
  before insert or update on public.stage_check
  for each row execute function public.fn_stage_check_different_instructor();

-- ============================================================================
-- 5. flight_log_time hobbs invariant
-- ============================================================================
-- day_minutes + night_minutes should equal the paired hobbs delta
-- (hobbs_in - hobbs_out) within ±6 minutes. Only enforced when a
-- paired flight_log_entry exists. Simulator rows skip the check.
create or replace function public.fn_flight_log_time_hobbs_invariant()
returns trigger
language plpgsql
as $$
declare
  v_hobbs_out numeric;
  v_hobbs_in  numeric;
  v_delta_min numeric;
  v_total     numeric;
begin
  if (new).is_simulator then
    return new;
  end if;
  if (new).flight_log_entry_id is null then
    return new;
  end if;

  -- Look up paired flight_in → flight_out hobbs
  select fi.hobbs_in, fo.hobbs_out
    into v_hobbs_in, v_hobbs_out
    from public.flight_log_entry fi
    left join public.flight_log_entry fo on fo.id = fi.paired_entry_id
   where fi.id = (new).flight_log_entry_id;

  if v_hobbs_in is null or v_hobbs_out is null then
    return new; -- cannot validate without both endpoints
  end if;

  v_delta_min := (v_hobbs_in - v_hobbs_out) * 60.0;
  v_total     := (new).day_minutes + (new).night_minutes;

  if abs(v_total - v_delta_min) > 6 then
    raise exception
      'flight_log_time day+night (% min) must be within ±6 min of hobbs delta (% min)',
      v_total, v_delta_min
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger flight_log_time_hobbs_invariant
  before insert or update on public.flight_log_time
  for each row execute function public.fn_flight_log_time_hobbs_invariant();

-- ============================================================================
-- 6. clone_course_version
-- ============================================================================
-- Deep-copies a course_version and its entire tree (stages, course_phases,
-- units, lessons, line_items) into a new course_version row under the
-- target school. Returns the new course_version id. Single transaction,
-- SECURITY INVOKER so RLS flows through the caller's claims.
--
-- Approach: build UUID remap tables as temp arrays, then insert in
-- FK-safe order (stage → course_phase → unit → lesson → line_item).
create or replace function public.clone_course_version(
  p_source_id uuid,
  p_target_school_id uuid
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_new_cv_id       uuid;
  v_src_course_id   uuid;
  v_src_version     public.course_version%rowtype;
begin
  select * into v_src_version from public.course_version where id = p_source_id;
  if not found then
    raise exception 'source course_version % not found', p_source_id;
  end if;
  v_src_course_id := v_src_version.course_id;

  -- New course_version (draft: published_at = null)
  insert into public.course_version (
    course_id, school_id, version_label, grading_scale, min_levels, notes
  ) values (
    v_src_course_id,
    p_target_school_id,
    v_src_version.version_label || ' (fork ' || to_char(now(), 'YYYY-MM-DD') || ')',
    v_src_version.grading_scale,
    v_src_version.min_levels,
    v_src_version.notes
  )
  returning id into v_new_cv_id;

  -- Clone stages
  create temporary table _stage_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _stage_map(old_id, new_id)
  select s.id, gen_random_uuid()
    from public.stage s
   where s.course_version_id = p_source_id and s.deleted_at is null;

  insert into public.stage (
    id, school_id, course_version_id, position, code, title, objectives, completion_standards
  )
  select m.new_id, p_target_school_id, v_new_cv_id,
         s.position, s.code, s.title, s.objectives, s.completion_standards
    from public.stage s
    join _stage_map m on m.old_id = s.id;

  -- Clone course_phases
  create temporary table _phase_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _phase_map(old_id, new_id)
  select cp.id, gen_random_uuid()
    from public.course_phase cp
   where cp.course_version_id = p_source_id and cp.deleted_at is null;

  insert into public.course_phase (
    id, school_id, course_version_id, stage_id, position, code, title,
    objectives, completion_standards
  )
  select m.new_id, p_target_school_id, v_new_cv_id, sm.new_id,
         cp.position, cp.code, cp.title, cp.objectives, cp.completion_standards
    from public.course_phase cp
    join _phase_map m on m.old_id = cp.id
    join _stage_map sm on sm.old_id = cp.stage_id;

  -- Clone units
  create temporary table _unit_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _unit_map(old_id, new_id)
  select u.id, gen_random_uuid()
    from public.unit u
   where u.course_version_id = p_source_id and u.deleted_at is null;

  insert into public.unit (
    id, school_id, course_version_id, stage_id, course_phase_id,
    position, code, title, objectives, completion_standards
  )
  select m.new_id, p_target_school_id, v_new_cv_id,
         sm.new_id, pm.new_id,
         u.position, u.code, u.title, u.objectives, u.completion_standards
    from public.unit u
    join _unit_map m on m.old_id = u.id
    left join _stage_map sm on sm.old_id = u.stage_id
    left join _phase_map pm on pm.old_id = u.course_phase_id;

  -- Clone lessons
  create temporary table _lesson_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _lesson_map(old_id, new_id)
  select l.id, gen_random_uuid()
    from public.lesson l
   where l.course_version_id = p_source_id and l.deleted_at is null;

  insert into public.lesson (
    id, school_id, course_version_id, stage_id, course_phase_id, unit_id,
    position, code, title, kind, objectives, completion_standards,
    min_hours, required_resources, required_currencies
  )
  select m.new_id, p_target_school_id, v_new_cv_id,
         sm.new_id, pm.new_id, um.new_id,
         l.position, l.code, l.title, l.kind, l.objectives,
         l.completion_standards, l.min_hours, l.required_resources,
         l.required_currencies
    from public.lesson l
    join _lesson_map m on m.old_id = l.id
    left join _stage_map sm on sm.old_id = l.stage_id
    left join _phase_map pm on pm.old_id = l.course_phase_id
    left join _unit_map um on um.old_id = l.unit_id;

  -- Clone line_items
  insert into public.line_item (
    id, school_id, course_version_id, lesson_id, position, code, title,
    description, objectives, completion_standards, classification,
    grading_scale_override
  )
  select gen_random_uuid(), p_target_school_id, v_new_cv_id, lm.new_id,
         li.position, li.code, li.title, li.description, li.objectives,
         li.completion_standards, li.classification, li.grading_scale_override
    from public.line_item li
    join _lesson_map lm on lm.old_id = li.lesson_id
   where li.deleted_at is null;

  return v_new_cv_id;
end;
$$;

-- ============================================================================
-- 7. compute_recency_currency (v1 stub)
-- ============================================================================
-- Returns the most recent flight_log_time row relevant to the given
-- recency kind. Phase 8 will add caching; this is read-only for v1.
create or replace function public.compute_recency_currency(
  p_user_id uuid,
  p_kind public.currency_kind
) returns table(
  last_qualifying_event timestamptz,
  expires_at            timestamptz
)
language plpgsql
stable
security invoker
as $$
declare
  v_last timestamptz;
begin
  if p_kind = 'night_passenger_currency' then
    select max(created_at) into v_last
      from public.flight_log_time
     where user_id = p_user_id
       and night_landings >= 1
       and deleted_at is null;
    last_qualifying_event := v_last;
    expires_at := v_last + interval '90 days';
    return next;
  elsif p_kind = 'day_passenger_currency' then
    select max(created_at) into v_last
      from public.flight_log_time
     where user_id = p_user_id
       and day_landings >= 1
       and deleted_at is null;
    last_qualifying_event := v_last;
    expires_at := v_last + interval '90 days';
    return next;
  elsif p_kind = 'instrument_currency' then
    select max(created_at) into v_last
      from public.flight_log_time
     where user_id = p_user_id
       and instrument_approaches >= 1
       and deleted_at is null;
    last_qualifying_event := v_last;
    expires_at := v_last + interval '6 months';
    return next;
  else
    -- Not a derived kind; return nothing.
    return;
  end if;
end;
$$;

-- ============================================================================
-- 8. user_flight_log_totals view
-- ============================================================================
create view public.user_flight_log_totals
  with (security_invoker = true) as
select
  user_id,
  sum(day_minutes + night_minutes)        as total_minutes,
  sum(case when kind = 'pic' then day_minutes + night_minutes else 0 end) as pic_minutes,
  sum(case when kind = 'dual_received' then day_minutes + night_minutes else 0 end) as dual_received_minutes,
  sum(case when kind = 'dual_given' then day_minutes + night_minutes else 0 end) as dual_given_minutes,
  sum(case when kind = 'solo' then day_minutes + night_minutes else 0 end) as solo_minutes,
  sum(case when kind = 'sic' then day_minutes + night_minutes else 0 end) as sic_minutes,
  sum(cross_country_minutes)              as cross_country_minutes,
  sum(night_minutes)                      as night_minutes,
  sum(instrument_actual_minutes)          as instrument_actual_minutes,
  sum(instrument_simulated_minutes)       as instrument_simulated_minutes,
  sum(day_landings)                       as day_landings,
  sum(night_landings)                     as night_landings,
  sum(instrument_approaches)              as instrument_approaches
from public.flight_log_time
where deleted_at is null
group by user_id;

comment on view public.user_flight_log_totals is
  'IACRA / 61.51(e) flight time totals per user. RLS flows through via '
  'security_invoker. Drives the student flight-log page and the IACRA '
  'hours export (SYL-11, STU-03).';
