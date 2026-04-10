-- Phase 6 migration (part 5): SQL rules engine functions.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000014_phase6_functions.sql.
--
-- Creates:
--   1. is_passing_grade(scale, value)          — TS parity helper
--   2. check_lesson_prerequisites(...)         — SYL-16
--   3. check_student_qualifications(...)       — SYL-18
--   4. check_instructor_qualifications(...)    — SYL-18 / SCH-11
--   5. check_resource_requirements(...)        — SYL-18
--   6. check_lesson_repeat_limit(...)          — SYL-20
--   7. evaluate_lesson_eligibility(...)        — SYL-19 orchestrator
--   8. compute_rollover_line_items(...)        — SYL-15
--   9. suggest_next_activity(...)              — SCH-14
--
-- All functions are SECURITY INVOKER so RLS applies. STABLE where
-- the function has no side effects.
--
-- Source of truth for passing-grade semantics:
--   packages/domain/src/schemas/gradingLabels.ts → isPassingGrade()

-- ============================================================================
-- 1. is_passing_grade(p_scale, p_value)
-- ============================================================================
-- Port of the TypeScript isPassingGrade helper.
-- Scales:
--   absolute_ipm: 'PM' or 'M' pass
--   relative_5:   numeric value >= 3 passes
--   pass_fail:    'pass' passes
-- Returns false for null/empty values.
create or replace function public.is_passing_grade(
  p_scale text,
  p_value text
) returns boolean
language sql
immutable
security invoker
as $$
  select case
    when p_value is null or p_value = '' then false
    when p_scale = 'absolute_ipm' then p_value in ('PM', 'M')
    when p_scale = 'relative_5' then (
      case when p_value ~ '^\d+(\.\d+)?$'
           then p_value::numeric >= 3
           else false
      end
    )
    when p_scale = 'pass_fail' then p_value = 'pass'
    else false
  end;
$$;

grant execute on function public.is_passing_grade(text, text) to authenticated;

-- ============================================================================
-- 2. check_lesson_prerequisites(enrollment_id, lesson_id)
-- ============================================================================
-- Returns { ok: bool, missing_lessons: uuid[] }.
-- A prerequisite is satisfied iff a sealed grade sheet exists where ALL
-- required/must_pass line items have passing grades.
create or replace function public.check_lesson_prerequisites(
  p_enrollment_id uuid,
  p_lesson_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_required uuid[];
  v_missing  uuid[];
begin
  select prerequisite_lesson_ids into v_required
    from public.lesson where id = p_lesson_id;

  if v_required is null or array_length(v_required, 1) is null then
    return jsonb_build_object('ok', true, 'missing_lessons', '[]'::jsonb);
  end if;

  -- A prerequisite lesson is satisfied when there exists a sealed grade sheet
  -- for this enrollment where no required/must_pass line item has a failing grade.
  select coalesce(array_agg(req_lesson_id), array[]::uuid[]) into v_missing
  from unnest(v_required) as req_lesson_id
  where not exists (
    select 1
    from public.lesson_grade_sheet gs
    where gs.student_enrollment_id = p_enrollment_id
      and gs.lesson_id = req_lesson_id
      and gs.sealed_at is not null
      and not exists (
        select 1
        from public.line_item_grade lig
        join public.line_item li on li.id = lig.line_item_id
        where lig.grade_sheet_id = gs.id
          and li.classification in ('required', 'must_pass')
          and not public.is_passing_grade(
            coalesce(li.grading_scale_override::text,
                     (select cv.grading_scale::text
                      from public.course_version cv
                      where cv.id = li.course_version_id)),
            lig.grade_value)
      )
  );

  return jsonb_build_object(
    'ok', array_length(v_missing, 1) is null,
    'missing_lessons', to_jsonb(v_missing)
  );
end;
$$;

grant execute on function public.check_lesson_prerequisites(uuid, uuid) to authenticated;

-- ============================================================================
-- 3. check_student_qualifications(enrollment_id, lesson_id)
-- ============================================================================
-- Reads lesson.required_student_qualifications + lesson.required_currencies
-- (from Phase 5). Joins personnel_currency for the student.
-- Returns { ok, missing_currencies: text[], missing_qualifications: text[] }.
create or replace function public.check_student_qualifications(
  p_enrollment_id uuid,
  p_lesson_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_student_user_id uuid;
  v_required_currencies jsonb;
  v_required_quals jsonb;
  v_missing_currencies text[] := array[]::text[];
  v_missing_quals text[] := array[]::text[];
  v_item text;
begin
  -- Get the student user_id from the enrollment
  select user_id into v_student_user_id
    from public.student_course_enrollment
    where id = p_enrollment_id;

  -- Read lesson requirements
  select
    coalesce(required_currencies, '[]'::jsonb),
    coalesce(required_student_qualifications, '[]'::jsonb)
  into v_required_currencies, v_required_quals
  from public.lesson where id = p_lesson_id;

  -- Check currencies: each required currency_kind must have an active
  -- (non-expired) personnel_currency row for this student
  for v_item in select jsonb_array_elements_text(v_required_currencies)
  loop
    if not exists (
      select 1 from public.personnel_currency pc
      where pc.user_id = v_student_user_id
        and pc.kind::text = v_item
        and pc.subject_kind = 'student'
        and (pc.expires_at is null or pc.expires_at > now())
        and pc.deleted_at is null
    ) then
      v_missing_currencies := array_append(v_missing_currencies, v_item);
    end if;
  end loop;

  -- Check qualifications: each required qualification must have a matching row
  for v_item in select jsonb_array_elements_text(v_required_quals)
  loop
    if not exists (
      select 1 from public.personnel_currency pc
      where pc.user_id = v_student_user_id
        and pc.subject_kind = 'student'
        and pc.kind::text = v_item
        and (pc.expires_at is null or pc.expires_at > now())
        and pc.deleted_at is null
    ) then
      v_missing_quals := array_append(v_missing_quals, v_item);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', array_length(v_missing_currencies, 1) is null
          and array_length(v_missing_quals, 1) is null,
    'missing_currencies', to_jsonb(v_missing_currencies),
    'missing_qualifications', to_jsonb(v_missing_quals)
  );
end;
$$;

grant execute on function public.check_student_qualifications(uuid, uuid) to authenticated;

-- ============================================================================
-- 4. check_instructor_qualifications(instructor_user_id, lesson_id)
-- ============================================================================
-- Reads lesson.required_instructor_qualifications + required_instructor_currencies.
-- Joins instructor_qualification + personnel_currency.
-- Returns { ok, missing_currencies: text[], missing_qualifications: text[] }.
create or replace function public.check_instructor_qualifications(
  p_instructor_user_id uuid,
  p_lesson_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_required_currencies jsonb;
  v_required_quals jsonb;
  v_missing_currencies text[] := array[]::text[];
  v_missing_quals text[] := array[]::text[];
  v_item text;
begin
  -- Read lesson requirements
  select
    coalesce(required_instructor_currencies, '[]'::jsonb),
    coalesce(required_instructor_qualifications, '[]'::jsonb)
  into v_required_currencies, v_required_quals
  from public.lesson where id = p_lesson_id;

  -- Check instructor currencies
  for v_item in select jsonb_array_elements_text(v_required_currencies)
  loop
    if not exists (
      select 1 from public.personnel_currency pc
      where pc.user_id = p_instructor_user_id
        and pc.kind::text = v_item
        and pc.subject_kind = 'instructor'
        and (pc.expires_at is null or pc.expires_at > now())
        and pc.deleted_at is null
    ) then
      v_missing_currencies := array_append(v_missing_currencies, v_item);
    end if;
  end loop;

  -- Check instructor qualifications (from instructor_qualification table)
  for v_item in select jsonb_array_elements_text(v_required_quals)
  loop
    if not exists (
      select 1 from public.instructor_qualification iq
      where iq.user_id = p_instructor_user_id
        and iq.descriptor = v_item
        and iq.revoked_at is null
    ) then
      v_missing_quals := array_append(v_missing_quals, v_item);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', array_length(v_missing_currencies, 1) is null
          and array_length(v_missing_quals, 1) is null,
    'missing_currencies', to_jsonb(v_missing_currencies),
    'missing_qualifications', to_jsonb(v_missing_quals)
  );
end;
$$;

grant execute on function public.check_instructor_qualifications(uuid, uuid) to authenticated;

-- ============================================================================
-- 5. check_resource_requirements(aircraft_id, lesson_id)
-- ============================================================================
-- Reads lesson.required_aircraft_equipment + required_aircraft_type +
-- required_sim_kind. Joins aircraft_equipment.
-- Returns { ok, missing_tags: text[], missing_type: text|null,
--           missing_sim_kind: text|null }.
create or replace function public.check_resource_requirements(
  p_aircraft_id uuid,
  p_lesson_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_required_equipment jsonb;
  v_required_type text;
  v_required_sim_kind text;
  v_missing_tags text[] := array[]::text[];
  v_missing_type text;
  v_missing_sim_kind text;
  v_item text;
  v_ac_model text;
begin
  -- Read lesson requirements
  select
    coalesce(required_aircraft_equipment, '[]'::jsonb),
    required_aircraft_type,
    required_sim_kind
  into v_required_equipment, v_required_type, v_required_sim_kind
  from public.lesson where id = p_lesson_id;

  -- If aircraft_id is null (e.g. ground lesson), skip equipment checks
  if p_aircraft_id is not null then
    -- Check equipment tags
    for v_item in select jsonb_array_elements_text(v_required_equipment)
    loop
      if not exists (
        select 1 from public.aircraft_equipment ae
        where ae.aircraft_id = p_aircraft_id
          and ae.tag::text = v_item
      ) then
        v_missing_tags := array_append(v_missing_tags, v_item);
      end if;
    end loop;

    -- Check aircraft type (model match)
    if v_required_type is not null then
      select model into v_ac_model
        from public.aircraft where id = p_aircraft_id;
      if v_ac_model is null or v_ac_model != v_required_type then
        v_missing_type := v_required_type;
      end if;
    end if;
  else
    -- No aircraft provided but equipment required
    if jsonb_array_length(v_required_equipment) > 0 then
      for v_item in select jsonb_array_elements_text(v_required_equipment)
      loop
        v_missing_tags := array_append(v_missing_tags, v_item);
      end loop;
    end if;
    if v_required_type is not null then
      v_missing_type := v_required_type;
    end if;
  end if;

  -- Check sim kind (if required and not matched — stored on the lesson itself,
  -- the aircraft/sim is expected to have this kind)
  if v_required_sim_kind is not null then
    -- For now, sim_kind must match the aircraft kind field if it exists.
    -- Since we don't have a dedicated sim table, we check against a tag-based approach.
    -- Phase 6 v1: if sim is required but no aircraft provided, it's missing.
    if p_aircraft_id is null then
      v_missing_sim_kind := v_required_sim_kind;
    end if;
    -- If aircraft IS provided, we trust the equipment tags for sim validation.
  end if;

  return jsonb_build_object(
    'ok', array_length(v_missing_tags, 1) is null
          and v_missing_type is null
          and v_missing_sim_kind is null,
    'missing_tags', to_jsonb(v_missing_tags),
    'missing_type', v_missing_type,
    'missing_sim_kind', v_missing_sim_kind
  );
end;
$$;

grant execute on function public.check_resource_requirements(uuid, uuid) to authenticated;

-- ============================================================================
-- 6. check_lesson_repeat_limit(enrollment_id, lesson_id)
-- ============================================================================
-- Counts sealed grade sheets for this (enrollment, lesson) pair.
-- Returns { ok, current_count, max, exceeded }.
create or replace function public.check_lesson_repeat_limit(
  p_enrollment_id uuid,
  p_lesson_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_max_repeats int;
  v_current_count int;
begin
  select max_repeats into v_max_repeats
    from public.lesson where id = p_lesson_id;

  -- No limit set → always ok
  if v_max_repeats is null then
    return jsonb_build_object(
      'ok', true,
      'current_count', 0,
      'max', null,
      'exceeded', false
    );
  end if;

  select count(*) into v_current_count
    from public.lesson_grade_sheet gs
    where gs.student_enrollment_id = p_enrollment_id
      and gs.lesson_id = p_lesson_id
      and gs.sealed_at is not null;

  return jsonb_build_object(
    'ok', v_current_count < v_max_repeats,
    'current_count', v_current_count,
    'max', v_max_repeats,
    'exceeded', v_current_count >= v_max_repeats
  );
end;
$$;

grant execute on function public.check_lesson_repeat_limit(uuid, uuid) to authenticated;

-- ============================================================================
-- 7. evaluate_lesson_eligibility(enrollment_id, lesson_id, aircraft_id, instructor_user_id)
-- ============================================================================
-- Orchestrator: runs all checks in deterministic order. Short-circuits on
-- active override (consumed_at IS NULL, revoked_at IS NULL, expires_at > now()).
--
-- Blocker order (matches inspector expectations):
--   prerequisites -> student currencies -> student quals ->
--   instructor currencies -> instructor quals ->
--   resource requirements -> repeat limit
--
-- Returns { ok, blockers: jsonb[], override_active: bool, override_id?: uuid }.
create or replace function public.evaluate_lesson_eligibility(
  p_enrollment_id uuid,
  p_lesson_id uuid,
  p_aircraft_id uuid,
  p_instructor_user_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_blockers jsonb := '[]'::jsonb;
  v_override_id uuid;
  v_check jsonb;
begin
  -- Short-circuit on active override
  select id into v_override_id
  from public.lesson_override
  where student_enrollment_id = p_enrollment_id
    and lesson_id = p_lesson_id
    and consumed_at is null
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if v_override_id is not null then
    return jsonb_build_object(
      'ok', true,
      'blockers', '[]'::jsonb,
      'override_active', true,
      'override_id', v_override_id
    );
  end if;

  -- 1. Prerequisites
  v_check := public.check_lesson_prerequisites(p_enrollment_id, p_lesson_id);
  if not (v_check ->> 'ok')::boolean then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('kind', 'prerequisites', 'detail', v_check)
    );
  end if;

  -- 2. Student qualifications (currencies + quals combined)
  v_check := public.check_student_qualifications(p_enrollment_id, p_lesson_id);
  if not (v_check ->> 'ok')::boolean then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('kind', 'student_qualifications', 'detail', v_check)
    );
  end if;

  -- 3. Instructor qualifications (currencies + quals combined)
  if p_instructor_user_id is not null then
    v_check := public.check_instructor_qualifications(p_instructor_user_id, p_lesson_id);
    if not (v_check ->> 'ok')::boolean then
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object('kind', 'instructor_qualifications', 'detail', v_check)
      );
    end if;
  end if;

  -- 4. Resource requirements
  v_check := public.check_resource_requirements(p_aircraft_id, p_lesson_id);
  if not (v_check ->> 'ok')::boolean then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('kind', 'resource_requirements', 'detail', v_check)
    );
  end if;

  -- 5. Repeat limit
  v_check := public.check_lesson_repeat_limit(p_enrollment_id, p_lesson_id);
  if not (v_check ->> 'ok')::boolean then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('kind', 'repeat_limit', 'detail', v_check)
    );
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'override_active', false
  );
end;
$$;

grant execute on function public.evaluate_lesson_eligibility(uuid, uuid, uuid, uuid) to authenticated;

-- ============================================================================
-- 8. compute_rollover_line_items(enrollment_id, target_lesson_id)
-- ============================================================================
-- Returns rows of (source_grade_sheet_id, line_item_id) representing
-- required/must_pass line items that failed in a prior sealed grade sheet
-- and have NOT been subsequently passed.
--
-- "Subsequently passed" = a later sealed grade sheet (by sealed_at) for the
-- same enrollment has the same line_item with a passing grade.
create or replace function public.compute_rollover_line_items(
  p_enrollment_id uuid,
  p_target_lesson_id uuid
) returns table (source_grade_sheet_id uuid, line_item_id uuid)
language plpgsql
stable
security invoker
as $$
begin
  return query
  with failing as (
    -- All failing required/must_pass grades across sealed sheets for this enrollment
    select
      lig.grade_sheet_id as source_grade_sheet_id,
      lig.line_item_id,
      gs.sealed_at
    from public.line_item_grade lig
    join public.line_item li on li.id = lig.line_item_id
    join public.lesson_grade_sheet gs on gs.id = lig.grade_sheet_id
    where gs.student_enrollment_id = p_enrollment_id
      and gs.sealed_at is not null
      and li.classification in ('required', 'must_pass')
      and not public.is_passing_grade(
        coalesce(li.grading_scale_override::text,
                 (select cv.grading_scale::text
                  from public.course_version cv
                  where cv.id = li.course_version_id)),
        lig.grade_value)
  ),
  later_pass as (
    -- For each failing row, find if a later sealed sheet has a passing grade
    select f.source_grade_sheet_id, f.line_item_id
    from failing f
    where exists (
      select 1
      from public.line_item_grade lig2
      join public.line_item li2 on li2.id = lig2.line_item_id
      join public.lesson_grade_sheet gs2 on gs2.id = lig2.grade_sheet_id
      where gs2.student_enrollment_id = p_enrollment_id
        and gs2.sealed_at is not null
        and gs2.sealed_at > f.sealed_at
        and lig2.line_item_id = f.line_item_id
        and public.is_passing_grade(
          coalesce(li2.grading_scale_override::text,
                   (select cv.grading_scale::text
                    from public.course_version cv
                    where cv.id = li2.course_version_id)),
          lig2.grade_value)
    )
  )
  select f.source_grade_sheet_id, f.line_item_id
  from failing f
  where not exists (
    select 1 from later_pass lp
    where lp.source_grade_sheet_id = f.source_grade_sheet_id
      and lp.line_item_id = f.line_item_id
  );
end;
$$;

grant execute on function public.compute_rollover_line_items(uuid, uuid) to authenticated;

-- ============================================================================
-- 9. suggest_next_activity(enrollment_id)
-- ============================================================================
-- Walks the course tree in position order (stage → course_phase → unit → lesson).
-- Returns the first not-yet-satisfactorily-completed lesson.
-- Prefers rollover lessons first.
--
-- Returns { lesson_id, title, reasoning, kind }.
create or replace function public.suggest_next_activity(
  p_enrollment_id uuid
) returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_course_version_id uuid;
  v_lesson record;
  v_rollover_lesson_id uuid;
  v_rollover_title text;
begin
  select course_version_id into v_course_version_id
    from public.student_course_enrollment where id = p_enrollment_id;

  if v_course_version_id is null then
    return jsonb_build_object(
      'lesson_id', null,
      'title', null,
      'reasoning', 'No course version associated with this enrollment.',
      'kind', 'none'
    );
  end if;

  -- Prefer a lesson with outstanding rollover line items
  select gs.lesson_id, l.title into v_rollover_lesson_id, v_rollover_title
  from public.lesson_grade_sheet gs
  join public.lesson l on l.id = gs.lesson_id
  where gs.student_enrollment_id = p_enrollment_id
    and gs.sealed_at is not null
    and exists (
      select 1 from public.compute_rollover_line_items(p_enrollment_id, gs.lesson_id)
    )
  order by gs.sealed_at asc
  limit 1;

  if v_rollover_lesson_id is not null then
    return jsonb_build_object(
      'lesson_id', v_rollover_lesson_id,
      'title', v_rollover_title,
      'reasoning', 'Outstanding rollover line items from prior lesson; re-attempt recommended.',
      'kind', 'rollover'
    );
  end if;

  -- Walk the course tree in order using the position columns.
  -- lesson can be attached to stage, course_phase, or unit (exclusive FK).
  -- We order by the parent chain positions.
  for v_lesson in
    select
      l.id,
      l.title
    from public.lesson l
    left join public.unit u on u.id = l.unit_id
    left join public.course_phase cp on cp.id = coalesce(l.course_phase_id, u.course_phase_id)
    left join public.stage s on s.id = coalesce(l.stage_id, cp.stage_id, u.stage_id)
    where l.course_version_id = v_course_version_id
      and l.deleted_at is null
    order by
      coalesce(s.position, 0),
      coalesce(cp.position, 0),
      coalesce(u.position, 0),
      l.position
  loop
    -- Skip if already satisfactorily complete: sealed grade sheet where
    -- all required/must_pass items pass
    if exists (
      select 1 from public.lesson_grade_sheet gs
      where gs.student_enrollment_id = p_enrollment_id
        and gs.lesson_id = v_lesson.id
        and gs.sealed_at is not null
        and not exists (
          select 1
          from public.line_item_grade lig
          join public.line_item li on li.id = lig.line_item_id
          where lig.grade_sheet_id = gs.id
            and li.classification in ('required', 'must_pass')
            and not public.is_passing_grade(
              coalesce(li.grading_scale_override::text,
                       (select cv.grading_scale::text
                        from public.course_version cv
                        where cv.id = li.course_version_id)),
              lig.grade_value)
        )
    ) then
      continue;
    end if;

    -- Return the first not-yet-complete lesson
    return jsonb_build_object(
      'lesson_id', v_lesson.id,
      'title', v_lesson.title,
      'reasoning', 'Next lesson in course sequence.',
      'kind', 'sequence'
    );
  end loop;

  -- All lessons complete
  return jsonb_build_object(
    'lesson_id', null,
    'title', null,
    'reasoning', 'All lessons satisfactorily completed.',
    'kind', 'none'
  );
end;
$$;

grant execute on function public.suggest_next_activity(uuid) to authenticated;
