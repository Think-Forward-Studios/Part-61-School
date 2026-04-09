# Phase 6: Syllabus Rules, Progression & Audit — Research

**Researched:** 2026-04-08
**Domain:** Postgres PL/pgSQL rules engine + pg_cron + tRPC gating + forecast caches
**Confidence:** HIGH (pattern mirror-heavy; every moving part has a Phase 3/4/5 precedent in this repo)

<user_constraints>

## User Constraints (from 06-CONTEXT.md)

### Locked Decisions

**Rules engine location:** SQL functions throughout. Canonical signatures:

- `public.check_lesson_prerequisites(enrollment_id uuid, lesson_id uuid) returns jsonb` — `{ ok, missing_lessons: uuid[] }`
- `public.check_student_qualifications(enrollment_id uuid, lesson_id uuid) returns jsonb` — `{ ok, missing_currencies: text[], missing_qualifications: text[] }`
- `public.check_instructor_qualifications(instructor_user_id uuid, lesson_id uuid) returns jsonb` — `{ ok, missing_currencies: text[], missing_qualifications: text[] }`
- `public.check_resource_requirements(aircraft_id uuid, lesson_id uuid) returns jsonb` — `{ ok, missing_tags: text[], missing_type: text, missing_sim_kind: text }`
- `public.check_lesson_repeat_limit(enrollment_id uuid, lesson_id uuid) returns jsonb` — `{ ok, current_count, max, exceeded }`
- `public.evaluate_lesson_eligibility(enrollment_id, lesson_id, aircraft_id, instructor_user_id) returns jsonb` — orchestrator, `{ ok, blockers: jsonb[] }`, short-circuits on active override.
- tRPC wraps each function; blockers map to `PRECONDITION_FAILED`.

**Rollover (SYL-15):** Virtual, via `compute_rollover_line_items(enrollment_id, target_lesson_id)`; seeded by `gradeSheet.createFromReservation`; new nullable FK column `line_item_grade.rollover_from_grade_sheet_id`. A later sealed passing grade clears the rollover.

**Prerequisites (SYL-16):** `lesson.prerequisite_lesson_ids uuid[]` column (simple AND-of-lessons). Gate at `schedule.approve` and `gradeSheet.createFromReservation`, both bypassable by active override.

**Management override (SYL-17):** New `lesson_override` table mirroring Phase 4 `maintenance_overrun`:

- columns: `id, school_id, base_id, student_enrollment_id, lesson_id, kind enum(prerequisite_skip|repeat_limit_exceeded|currency_waiver), justification text CHECK(length>=20), granted_at, granted_by_user_id, signer_snapshot jsonb, expires_at default now()+30d, consumed_at, revoked_at, revoked_by_user_id, revocation_reason`
- `adminOrChiefInstructorProcedure` grants, single-use consumption on first grade sheet create, audit + hard-delete blocker triggers, `management_override_activity` view for admin dashboard.

**Authorized repeats (SYL-20):** `line_item.max_repeats int NULL` + `lesson.max_repeats int NULL`. `check_lesson_repeat_limit` counts sealed `lesson_grade_sheet` rows for (enrollment, lesson).

**Lesson requirements (SYL-18/19/SCH-11):** Extend `lesson` with `required_instructor_qualifications jsonb`, `required_instructor_currencies jsonb`, `required_student_qualifications jsonb`, `required_aircraft_equipment jsonb`, `required_aircraft_type text`, `required_sim_kind text`. Deterministic blocker order: prerequisites → student currencies → student quals → instructor currencies → instructor quals → aircraft equipment → aircraft type/sim → repeat limit.

**Course minimums (SYL-21):** `course_version.minimum_hours jsonb` column + seeded per §61.109/61.65/61.129. Live view `student_course_minimums_status WITH (security_invoker = true)` joining `flight_log_time`. No caching in Phase 6.

**Plan pace + forecast (SYL-22/23):** `student_course_enrollment.plan_cadence_hours_per_week numeric` + `course_version.default_plan_cadence_hours_per_week`. `student_progress_forecast(enrollment_id) returns jsonb` computes ahead_behind, projected_checkride_date, projected_completion_date, confidence level. Cached in `student_progress_forecast_cache`, refreshed by trigger on `flight_log_time` insert/update (mirroring Phase 4 `aircraft_downtime_forecast`).

**Next activity (SCH-14):** `suggest_next_activity(enrollment_id) returns jsonb`. Walks course tree in order, prefers rollover lessons, short-circuits first-not-complete with human-readable reasoning. Exposed via `schedule.suggestNextActivity`.

**Nightly audit (SYL-24):** pg_cron `select cron.schedule('phase6_nightly_training_record_audit', '0 7 * * *', 'select public.run_training_record_audit()')`. Populates `training_record_audit_exception` table (id, school_id, student_enrollment_id, kind enum, severity enum, details jsonb, first_detected_at, last_detected_at, resolved_at). Idempotent — re-running reconciles without duplicates. Route: `/admin/audit/training-records`.

**SCH-05/11 wiring:** `schedule.approve` calls `evaluate_lesson_eligibility` when `reservation.lesson_id IS NOT NULL`; legacy `checkStudentCurrency` stays for targeted UI.

**New procedures/helpers:** `chiefInstructorOnlyProcedure` (stricter than Phase 5 `adminOrChiefInstructorProcedure`), `buildOverrideSignerSnapshot(ctx)`.

**tRPC additions:** `admin.overrides.*`, `admin.audit.*`, `schedule.evaluateLessonEligibility`, `schedule.suggestNextActivity`, `record.getMyProgressForecast`, `admin.enrollments.getProgressForecast`, `admin.enrollments.getMinimumsStatus`, `record.getMyMinimumsStatus`.

**UI additions:** `/admin/audit/training-records`, `/admin/overrides`, student profile panels (`MinimumsStatusPanel`, `ProgressForecastPanel`, `RolloverQueuePanel`, `NextActivityChip`), `/schedule/request` inline blocker list + override modal, `/record` dashboard chips.

**Banned-term caveat:** Display labels in `packages/domain/src/schemas/overrideKindLabels.ts` + `auditExceptionLabels.ts` (outside banned-term lint glob). No "approved" in .tsx source — use "authorized" / "granted" / "chief instructor granted".

### Claude's Discretion

- Exact PL/pgSQL body of each check function (signatures locked)
- Audit severity thresholds (warn vs critical)
- Forecast cache refresh-on-insert vs nightly-materialized
- Ahead/behind chip color palette
- Override modal dialog vs dedicated page (dialog recommended)
- NextActivityChip shows just next lesson (recommended) vs next 3
- Tree-walking strategy in `suggest_next_activity` (recursive CTE recommended)

### Deferred Ideas (OUT OF SCOPE)

Email/SMS notifications (Phase 8), severity auto-escalation, ML checkride projection, IACRA pre-check validation, DPE scheduling, bulk class overrides, override approval workflow, gamified display, historical trend charts, resource forecasting deep integration, multi-enrollment progress view, waiver expiration reminders, student-initiated overrides, any-of-N prerequisite graphs, audit dashboard charts.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                  | Research Support                                                                                                                                              |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYL-15 | Incomplete line items auto-roll forward                      | `compute_rollover_line_items` SQL + `line_item_grade.rollover_from_grade_sheet_id` FK; recursive-satisfaction query below                                     |
| SYL-16 | Prerequisite enforcement (schedule + grade)                  | `lesson.prerequisite_lesson_ids uuid[]` + `check_lesson_prerequisites` function; gated in `schedule.approve` and `gradeSheet.createFromReservation`           |
| SYL-17 | Management override with reason, authorizer, audit           | `lesson_override` table mirrors Phase 4 `maintenance_overrun`; `buildOverrideSignerSnapshot` helper; partial unique index on active rows; consumption trigger |
| SYL-18 | Lesson duration / resource / qualification requirements      | New jsonb + text columns on `lesson`; `check_resource_requirements` + `check_instructor_qualifications`                                                       |
| SYL-19 | Syllabus rules engine evaluated at schedule + grade          | `evaluate_lesson_eligibility` orchestrator + deterministic blocker order                                                                                      |
| SYL-20 | Authorized repeat counts                                     | `line_item.max_repeats`, `lesson.max_repeats`, `check_lesson_repeat_limit`, override kind `repeat_limit_exceeded`                                             |
| SYL-21 | Per-student course minimums tracker                          | `course_version.minimum_hours jsonb` + `student_course_minimums_status` view over `flight_log_time`                                                           |
| SYL-22 | Ahead/behind plan indicator                                  | `plan_cadence_hours_per_week` + `student_progress_forecast` function                                                                                          |
| SYL-23 | Projected checkride + completion date                        | same forecast function (remaining_hours / cadence → date math), cached in `student_progress_forecast_cache`                                                   |
| SYL-24 | Nightly automated training record audit                      | pg_cron + `run_training_record_audit()` + `training_record_audit_exception` + idempotent UPSERT                                                               |
| SCH-05 | Reservation blocked on missing prerequisite/currency         | `schedule.approve` extended with `evaluate_lesson_eligibility`                                                                                                |
| SCH-11 | Instructor currency + qualification verification             | `check_instructor_qualifications` inside orchestrator                                                                                                         |
| SCH-14 | Next-activity suggestion                                     | `suggest_next_activity` recursive CTE + `NextActivityChip`                                                                                                    |
| IPF-06 | Management alerts for out-of-order / non-conforming activity | `management_override_activity` view feeding admin dashboard panel                                                                                             |

</phase_requirements>

## Summary

Phase 6 is almost entirely **SQL function work plus a mirror of the Phase 4 override pattern**. Every structural decision in CONTEXT.md has a direct Phase 3/4/5 precedent in this repo: Phase 3 `is_airworthy_at` establishes the "SQL function returning status" contract, Phase 4 `maintenance_overrun` establishes the signer-snapshot + consume-once pattern, Phase 4 `aircraft_downtime_forecast` establishes the trigger-refreshed cache pattern, Phase 5 `currency_status` + `check_student_currency` establishes the `jsonb { ok, ... }` check-function return shape, and Phase 5 `adminOrChiefInstructorProcedure` is the template for `chiefInstructorOnlyProcedure`. The only net-new infrastructure is **pg_cron** (Supabase-native, version 1.6.4, already available — just needs `create extension if not exists pg_cron`).

The hardest technical questions are (1) how to write `compute_rollover_line_items` so that a later sealed passing grade correctly suppresses an older failure, (2) how to serialize override consumption against concurrent `createFromReservation` calls, and (3) the idempotent UPSERT shape for the nightly audit reconciler. All three have clean answers using patterns already in the repo (SELECT FOR UPDATE, partial unique index, ON CONFLICT ... WHERE resolved_at IS NULL).

**Primary recommendation:** Mirror Phase 4 migration structure exactly — enum extensions → column additions → new tables → SQL functions → triggers → pg_cron registration → seed backfill. Keep every check function pure (no side effects), let `evaluate_lesson_eligibility` be the only caller that knows the blocker ordering, and let the tRPC layer be a thin typed wrapper over `PRECONDITION_FAILED`.

## Standard Stack

### Core (all already in repo — no new deps)

| Library               | Version        | Purpose                                         | Why Standard                                                                                                    |
| --------------------- | -------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| PostgreSQL (Supabase) | 15             | PL/pgSQL rules engine + RLS + pg_cron           | Phase 1-5 precedent; RLS-first architecture                                                                     |
| pg_cron               | 1.6.4          | Nightly `run_training_record_audit()` scheduler | Supabase-native, confirmed enabled via SQL Editor or `create extension`; jobs registerable from migration files |
| Drizzle ORM           | (repo current) | Schema + migrations                             | Phase 1-5 pattern                                                                                               |
| tRPC                  | (repo current) | Typed procedure wrappers over SQL functions     | Phase 1-5 pattern                                                                                               |
| Zod                   | (repo current) | Blocker payload schemas in `packages/domain`    | Phase 1-5 pattern                                                                                               |
| date-fns-tz           | (repo current) | `projected_checkride_date` display formatting   | CLAUDE.md mandates for timezone-correct display                                                                 |

### Supporting (new in Phase 6, reusing existing libs)

| Asset                                                     | Purpose                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/domain/src/schemas/blockers.ts`                 | Zod discriminated union for blocker kinds (see Architecture Pattern 3) |
| `packages/domain/src/schemas/overrideKindLabels.ts`       | Display labels outside banned-term lint glob                           |
| `packages/domain/src/schemas/auditExceptionLabels.ts`     | Display labels                                                         |
| `packages/api/src/helpers/buildOverrideSignerSnapshot.ts` | Mirror of `buildInstructorSignerSnapshot`                              |
| `packages/api/src/procedures.ts` addition                 | `chiefInstructorOnlyProcedure`                                         |

### Alternatives Considered

| Instead of                                                   | Could Use                      | Why Rejected                                                                                                           |
| ------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| SQL-function rules engine                                    | App-tier TypeScript rules      | Rejected in CONTEXT — breaks RLS-policy-callable contract, splits logic from Phase 3/4/5                               |
| Physical rollover rows (copied line items)                   | Virtual on-create              | Rejected in CONTEXT — virtual with FK is cleaner and avoids data drift                                                 |
| Full graph prerequisite DAG                                  | Simple `uuid[]` AND-of-lessons | Rejected — v2 feature per deferred list                                                                                |
| pg_cron alternative (Edge Functions schedule, external cron) | —                              | pg_cron is Supabase-blessed and already in-database; Phase 4 precedent of SQL-heavy logic argues for staying in the DB |

**Installation (one-time, in a migration):**

```sql
create extension if not exists pg_cron;
```

## Architecture Patterns

### Recommended Migration File Layout

Following the Phase 2-5 "enum extensions isolated from usage" caveat:

```
packages/db/migrations/
├── 0023_phase6_enums.sql                  # lesson_override_kind, audit_exception_kind, audit_exception_severity
├── 0024_phase6_lesson_columns.sql         # prerequisite_lesson_ids, max_repeats, required_* columns
├── 0025_phase6_course_version_columns.sql # minimum_hours, default_plan_cadence_hours_per_week
├── 0026_phase6_enrollment_columns.sql     # plan_cadence_hours_per_week
├── 0027_phase6_line_item_grade_columns.sql # rollover_from_grade_sheet_id FK
├── 0028_phase6_tables.sql                 # lesson_override, training_record_audit_exception, student_progress_forecast_cache
├── 0029_phase6_views.sql                  # student_course_minimums_status, management_override_activity
├── 0030_phase6_functions.sql              # All check_*, evaluate_lesson_eligibility, compute_rollover_line_items, student_progress_forecast, suggest_next_activity, run_training_record_audit
├── 0031_phase6_triggers.sql               # consume_lesson_override, refresh_progress_forecast, audit+hard-delete blockers
├── 0032_phase6_pg_cron.sql                # create extension + cron.schedule() call
└── 0033_phase6_seed_minimums.sql          # Backfill course_version.minimum_hours for PPL/IR/Comm-SEL
```

Each file hand-authored and **mirrored verbatim** to `supabase/migrations/YYYYMMDDNNNNNN_phase6_*.sql` (Phase 1-5 convention).

### Pattern 1: Check Function Return Shape

Every `check_*` function returns the same jsonb envelope so `evaluate_lesson_eligibility` can concatenate without type gymnastics:

```sql
-- Pattern (from Phase 5 currency_status + Phase 6 CONTEXT lock)
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

  -- A prereq is satisfied iff a sealed grade sheet exists for this enrollment
  -- where every Required/Must Pass line item has a passing grade.
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
          and not public.is_passing_grade(li.grading_scale, lig.grade_value)
      )
  );

  return jsonb_build_object(
    'ok', array_length(v_missing, 1) is null,
    'missing_lessons', to_jsonb(v_missing)
  );
end;
$$;
```

Note: `public.is_passing_grade(scale, value)` must be a new SQL wrapper around the TS `isPassingGrade` helper — Phase 6 needs it in-database because all rules live in SQL. **This is a new function to add in 0030**, derived by rewriting the TS logic in PL/pgSQL (it's a small switch on scale).

### Pattern 2: Orchestrator Deterministic Ordering + Override Short-Circuit

```sql
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
  v_override_active boolean;
  v_check jsonb;
begin
  -- Short-circuit on any active unconsumed non-expired non-revoked override.
  select exists (
    select 1 from public.lesson_override
    where student_enrollment_id = p_enrollment_id
      and lesson_id = p_lesson_id
      and consumed_at is null
      and revoked_at is null
      and expires_at > now()
  ) into v_override_active;

  if v_override_active then
    return jsonb_build_object('ok', true, 'blockers', '[]'::jsonb, 'override_active', true);
  end if;

  -- Deterministic order (matches inspector expectations):
  -- prerequisites → student currency → student quals → instructor currency
  -- → instructor quals → aircraft equipment → aircraft type/sim → repeat limit

  v_check := public.check_lesson_prerequisites(p_enrollment_id, p_lesson_id);
  if not (v_check->>'ok')::boolean then
    v_blockers := v_blockers || jsonb_build_object('kind', 'prerequisites', 'detail', v_check);
  end if;

  v_check := public.check_student_qualifications(p_enrollment_id, p_lesson_id);
  if not (v_check->>'ok')::boolean then
    v_blockers := v_blockers || jsonb_build_object('kind', 'student_qualifications', 'detail', v_check);
  end if;

  -- ... (instructor currency, instructor quals, aircraft, repeat) same shape ...

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'override_active', false
  );
end;
$$;
```

**Blocker payload shape (locked recommendation):** discriminated union on `kind`, with `detail` carrying the raw check-function output. Zod schema in `packages/domain/src/schemas/blockers.ts` mirrors this. UI renders per-kind with a one-line message + "How to fix" deep link.

### Pattern 3: Rollover Computation (The Tricky Query)

```sql
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
    -- Step 1: every failing required/must-pass grade across all sealed sheets
    select lig.grade_sheet_id, lig.line_item_id, gs.sealed_at, gs.lesson_id
    from public.line_item_grade lig
    join public.line_item li on li.id = lig.line_item_id
    join public.lesson_grade_sheet gs on gs.id = lig.grade_sheet_id
    where gs.student_enrollment_id = p_enrollment_id
      and gs.sealed_at is not null
      and li.classification in ('required', 'must_pass')
      and not public.is_passing_grade(li.grading_scale, lig.grade_value)
  ),
  later_pass as (
    -- Step 2: has the same line item been passed in a later sealed sheet?
    select f.grade_sheet_id, f.line_item_id
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
        and public.is_passing_grade(li2.grading_scale, lig2.grade_value)
    )
  )
  select f.grade_sheet_id, f.line_item_id
  from failing f
  where (f.grade_sheet_id, f.line_item_id) not in (
    select grade_sheet_id, line_item_id from later_pass
  );
end;
$$;
```

**Performance note:** at ~20 sealed sheets × ~30 line items = ~600 rows per enrollment, this is fine without indexes beyond the existing ones. Add a covering index `(student_enrollment_id, sealed_at) WHERE sealed_at IS NOT NULL` on `lesson_grade_sheet` if EXPLAIN shows seqscan at scale.

### Pattern 4: Override Consumption Race (CRITICAL)

Two parallel `gradeSheet.createFromReservation` calls for the same enrollment+lesson with one active override. Winner consumes, loser must see "no override" and re-evaluate. Use `SELECT ... FOR UPDATE` inside the same transaction as the grade sheet insert:

```sql
-- Inside gradeSheet.createFromReservation tRPC procedure, within withTenantTx:
-- 1. Lock and fetch candidate override
select id from public.lesson_override
where student_enrollment_id = $1
  and lesson_id = $2
  and consumed_at is null
  and revoked_at is null
  and expires_at > now()
for update
limit 1;
-- 2. If found, UPDATE SET consumed_at = now() ... in the same tx
-- 3. Else call evaluate_lesson_eligibility; raise PRECONDITION_FAILED on blockers
-- 4. Insert the lesson_grade_sheet row
-- 5. Commit — losing concurrent tx will see consumed_at IS NOT NULL on its SELECT FOR UPDATE
```

**Also add a partial unique index** as defense in depth:

```sql
create unique index lesson_override_single_active_idx
  on public.lesson_override (student_enrollment_id, lesson_id)
  where consumed_at is null and revoked_at is null;
-- (expires_at intentionally not in the predicate — clock-dependent predicates are
--  not index-sargable in Postgres partial indexes; expiry is enforced at query time.)
```

### Pattern 5: Forecast Cache (Mirror Phase 4 `aircraft_downtime_forecast`)

```sql
create table public.student_progress_forecast_cache (
  student_enrollment_id uuid primary key references public.student_course_enrollment(id) on delete cascade,
  school_id uuid not null,
  computed_at timestamptz not null default now(),
  forecast jsonb not null,
  -- standard audit columns per repo pattern
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: standard school_id pattern
alter table public.student_progress_forecast_cache enable row level security;

create or replace function public.refresh_student_progress_forecast(p_enrollment_id uuid)
returns void language plpgsql as $$
begin
  -- Lock the cache row to serialize concurrent refresh (Phase 4 pattern)
  perform 1 from public.student_progress_forecast_cache
    where student_enrollment_id = p_enrollment_id
    for update;

  insert into public.student_progress_forecast_cache (student_enrollment_id, school_id, forecast, computed_at)
  select p_enrollment_id, sce.school_id, public.student_progress_forecast(p_enrollment_id), now()
  from public.student_course_enrollment sce where sce.id = p_enrollment_id
  on conflict (student_enrollment_id) do update
  set forecast = excluded.forecast,
      computed_at = excluded.computed_at,
      updated_at = now();
end;
$$;
```

**Refresh trigger scope (minimal correct set):**

1. `after insert or update on flight_log_time` — resolve affected enrollment(s) via the pilot's active enrollments, refresh each
2. `after update of plan_cadence_hours_per_week on student_course_enrollment` — refresh that enrollment
3. `after update of minimum_hours, default_plan_cadence_hours_per_week on course_version` — refresh all enrollments on that course version (can be slow if many; acceptable in Phase 6 scale ~10-50 students)
4. **Nightly safety net:** the `run_training_record_audit()` cron job also calls `refresh_student_progress_forecast` for every active enrollment, catching any drift.

### Pattern 6: Nightly Audit Idempotent UPSERT

```sql
create or replace function public.run_training_record_audit() returns void
language plpgsql
security definer  -- runs as superuser via pg_cron; RLS bypassed for writes
as $$
declare
  r record;
  exc record;
begin
  -- For each active enrollment, compute the current exception set.
  for r in select id, school_id from public.student_course_enrollment
           where completed_at is null and withdrawn_at is null loop

    -- Refresh the forecast cache while we're here
    perform public.refresh_student_progress_forecast(r.id);

    -- Example: missing_lessons detector
    for exc in select 'missing_lessons'::public.audit_exception_kind as kind,
                       'warn'::public.audit_exception_severity as severity,
                       public.detect_missing_lessons(r.id) as details loop
      if exc.details is not null and jsonb_array_length(exc.details) > 0 then
        insert into public.training_record_audit_exception
          (school_id, student_enrollment_id, kind, severity, details,
           first_detected_at, last_detected_at)
        values (r.school_id, r.id, exc.kind, exc.severity, exc.details, now(), now())
        on conflict (student_enrollment_id, kind) where resolved_at is null
        do update set last_detected_at = now(), details = excluded.details, severity = excluded.severity;
      end if;
    end loop;

    -- Resolve any currently-open exception that no longer applies
    update public.training_record_audit_exception
    set resolved_at = now()
    where student_enrollment_id = r.id
      and resolved_at is null
      and last_detected_at < now() - interval '1 minute';  -- not touched this run
  end loop;
end;
$$;
```

**Natural key for UPSERT:** `(student_enrollment_id, kind) where resolved_at is null`. This partial unique index must exist:

```sql
create unique index audit_exception_open_idx
  on public.training_record_audit_exception (student_enrollment_id, kind)
  where resolved_at is null;
```

**RLS on audit exceptions table:**

- Writes: `security definer` function bypasses RLS (pg_cron runs as postgres)
- Reads: standard `school_id = current_setting('app.school_id')::uuid` policy for authenticated users
- INSERT from authenticated blocked (only the function writes)

### Pattern 7: Next-Activity Recursive CTE

```sql
create or replace function public.suggest_next_activity(p_enrollment_id uuid)
returns jsonb
language plpgsql stable as $$
declare
  v_course_version_id uuid;
  v_lesson record;
  v_eligibility jsonb;
  v_rollover_lesson_id uuid;
begin
  select course_version_id into v_course_version_id
    from public.student_course_enrollment where id = p_enrollment_id;

  -- Prefer a lesson with outstanding rollover line items
  select gs.lesson_id into v_rollover_lesson_id
  from public.lesson_grade_sheet gs
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
      'reasoning', 'Outstanding rollover line items from prior lesson; re-attempt recommended.',
      'kind', 'rollover'
    );
  end if;

  -- Walk the course tree in order, first lesson that is not satisfactorily complete
  for v_lesson in
    select l.id, l.name
    from public.lesson l
    join public.unit u on u.id = l.unit_id
    join public.phase p on p.id = u.phase_id
    join public.stage s on s.id = p.stage_id
    where s.course_version_id = v_course_version_id
    order by s.sort_order, p.sort_order, u.sort_order, l.sort_order
  loop
    -- Skip if already satisfactorily complete
    if exists (
      select 1 from public.lesson_grade_sheet gs
      where gs.student_enrollment_id = p_enrollment_id
        and gs.lesson_id = v_lesson.id
        and gs.sealed_at is not null
        and not exists (
          select 1 from public.line_item_grade lig
          join public.line_item li on li.id = lig.line_item_id
          where lig.grade_sheet_id = gs.id
            and li.classification in ('required', 'must_pass')
            and not public.is_passing_grade(li.grading_scale, lig.grade_value)
        )
    ) then
      continue;
    end if;

    -- Return the first not-yet-complete lesson with current eligibility snapshot
    return jsonb_build_object(
      'lesson_id', v_lesson.id,
      'reasoning', 'Next lesson in course sequence.',
      'kind', 'sequence'
      -- eligibility snapshot computed on the client since it depends on aircraft + instructor
    );
  end loop;

  return jsonb_build_object('lesson_id', null, 'reasoning', 'Course complete or no eligible lesson found.', 'kind', 'none');
end;
$$;
```

### Anti-Patterns to Avoid

- **Evaluating rules in TypeScript and SQL independently:** CONTEXT locks SQL as the single source of truth. Do not re-implement `isPassingGrade` semantics in PL/pgSQL and TS differently — port the TS helper to a `public.is_passing_grade` SQL function, call it from both sides if TS still needs it (`withTenantTx` query), or keep TS-side purely for UI preview and never for decisions.
- **Consuming the override outside the grade sheet insert transaction:** If consumption happens in a separate statement, you get a TOCTOU race. Consume and insert in the same `withTenantTx`.
- **Expiring overrides via a clock predicate in a unique index:** Postgres cannot index on `now()` — enforce expiry at query time, use the partial unique index only on `(consumed_at is null and revoked_at is null)`.
- **Running the nightly audit as `security invoker`:** pg_cron runs as postgres; relying on `app.school_id` session setting will fail since pg_cron does not set it. Use `security definer` and scope by reading `school_id` from each enrollment row.
- **Querying `student_course_minimums_status` view from a hot page without `EXPLAIN`:** live view is fine for Phase 6 but verify on a seeded student with 50+ flight_log_time rows before shipping.
- **Storing rollover as physical duplicated line items:** use the nullable FK `rollover_from_grade_sheet_id` — virtual rollover per CONTEXT.

## Don't Hand-Roll

| Problem                               | Don't Build                                          | Use Instead                                                                                 | Why                                                    |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Nightly scheduler                     | cron-in-node, queue workers, Edge Function schedules | pg_cron (`cron.schedule`)                                                                   | Supabase-native, transactional with data, zero ops     |
| Override consume-once race            | App-tier mutex / advisory lock in node               | `SELECT ... FOR UPDATE` in same tx                                                          | Phase 4 `maintenance_overrun` precedent, transactional |
| Passing-grade logic                   | Duplicate in PL/pgSQL and TypeScript                 | Single `public.is_passing_grade` SQL function called from TS via `withTenantTx` when needed | Avoid drift between engines                            |
| Signer snapshot                       | Recomputing on read                                  | JSONB copy at grant time                                                                    | Phase 4 `signer_snapshot` precedent — legal durability |
| Forecast recompute on every page load | Inline in tRPC                                       | Trigger-refreshed cache table                                                               | Phase 4 `aircraft_downtime_forecast` precedent         |
| Audit dedup tracking                  | Bookkeeping table for "seen exceptions"              | Partial unique index on open rows + UPSERT ON CONFLICT                                      | Self-reconciling, idempotent by construction           |
| Course tree walking                   | Materialized ordered list                            | Recursive CTE / ordered join in SQL function                                                | Tree is small (< 100 lessons), live traversal is fine  |
| Rollover suppression                  | Complex bookkeeping flags                            | Subquery checking "later sealed pass exists"                                                | Read-path complexity only, no write coordination       |

**Key insight:** Every piece of Phase 6 has a pre-existing in-repo pattern. The temptation is to "improve" on Phase 4's override model — don't. Ceremonial consistency matters both for future auditors and for developer onboarding. Mirror Phase 4 structurally even where Phase 6 might allow deviation.

## Common Pitfalls

### Pitfall 1: Enum Extension + Usage in Same Migration

**What goes wrong:** Postgres forbids adding an enum value and then using it in the same transaction.
**Why it happens:** Repo caveat from Phase 2-5 — enum values committed in their own migration file.
**How to avoid:** `0023_phase6_enums.sql` contains ONLY `alter type ... add value` / new `create type`. Tables + functions that reference those values go in 0024+.
**Warning signs:** `ERROR: unsafe use of new value ... of enum type` during `drizzle-kit migrate`.

### Pitfall 2: pg_cron Extension Not Installed in Local Supabase CLI

**What goes wrong:** `supabase start` locally fails to find pg_cron.
**Why it happens:** Some older supabase-cli images don't ship pg_cron by default.
**How to avoid:** Test `create extension if not exists pg_cron` on the current CLI image before depending on it. If missing, bump the CLI version. Hosted Supabase has it since well before 2025.
**Warning signs:** Migration 0032 fails locally with `extension "pg_cron" is not available`.
**Mitigation:** Wrap the `cron.schedule` call in a `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN ... END IF; END $$` guard, or document the CLI version requirement in `CLAUDE.md`.

### Pitfall 3: Override Consumption Before Insert Validation

**What goes wrong:** `consumed_at` is set, then the grade sheet insert fails validation, transaction rolls back — but in the client's UI the "override used" state got reported.
**Why it happens:** Returning too eagerly from the procedure.
**How to avoid:** Consume + insert in the same transaction. Only report "override consumed" in the response payload after the commit succeeds.

### Pitfall 4: `security_invoker` on Minimums View with RLS

**What goes wrong:** View returns zero rows because RLS policies on `flight_log_time` filter by the querying user.
**Why it happens:** Admin querying a student's totals via the view inherits admin's RLS context, which is fine — but confirm the policy allows admin to see the student. Phase 5 patterns should already permit this.
**How to avoid:** Explicit test: admin queries `student_course_minimums_status` for another user's enrollment and gets rows.

### Pitfall 5: Forecast Cache Refresh Storm

**What goes wrong:** Bulk `flight_log_time` insert (e.g. dispatch closing 5 flights in one transaction) fires the refresh trigger 5 times per row.
**Why it happens:** Row-level triggers on inserts.
**How to avoid:** Use a `statement`-level trigger that collects affected enrollment IDs from `new_table` transition table, deduplicates, and calls `refresh_student_progress_forecast` once per distinct enrollment.

### Pitfall 6: Banned-Term Lint in Override UI Copy

**What goes wrong:** UI string "Chief instructor approved override" trips the banned-term ESLint rule (`approved`).
**Why it happens:** FND-05 rule globs `apps/web/**`.
**How to avoid:** Use "granted" / "authorized" — never "approved" in .tsx source. Labels file in `packages/domain/src/schemas/` sits outside the lint glob.

### Pitfall 7: `is_passing_grade` SQL/TS Drift

**What goes wrong:** TS `isPassingGrade` and SQL `is_passing_grade` disagree on edge cases (e.g. absolute "Practice" counts as passing or not).
**Why it happens:** Duplicate implementations.
**How to avoid:** Write the SQL version first (it's the authority), add a regression test that iterates every (scale, value) combination and asserts TS and SQL return identical results.

### Pitfall 8: Audit Exception Reconciler Window

**What goes wrong:** The "resolve not-touched-this-run" sweep uses `last_detected_at < now() - interval '1 minute'` — if the whole run takes >1 minute across many enrollments, some newly-upserted rows get spuriously resolved.
**Why it happens:** Time-window heuristic.
**How to avoid:** Record `run_started_at` at function start, resolve where `last_detected_at < run_started_at`.

### Pitfall 9: Prerequisite Check Treats Draft Sheets as Satisfaction

**What goes wrong:** Student's draft (unsealed) grade sheet with passing grades is treated as meeting the prerequisite, letting the next lesson schedule before the current one is signed.
**Why it happens:** Forgetting the `sealed_at is not null` filter.
**How to avoid:** Every satisfaction check filters on `gs.sealed_at is not null`. Add a regression test.

### Pitfall 10: Override `consumed_at` Trigger vs. Explicit UPDATE

**What goes wrong:** Two mechanisms race — a trigger on `lesson_grade_sheet` insert tries to mark the override consumed, and the tRPC procedure also updates it.
**Why it happens:** Belt-and-suspenders without coordination.
**How to avoid:** Choose ONE. Recommendation: tRPC procedure updates it explicitly within the same tx (Pattern 4), no trigger. Simpler to reason about.

## Code Examples

### Example 1: chiefInstructorOnlyProcedure

```typescript
// packages/api/src/procedures.ts — ADD after adminOrChiefInstructorProcedure
// Source: mirrors Phase 5 adminOrChiefInstructorProcedure, stricter (no admin fallback)
export const chiefInstructorOnlyProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const isChief = await ctx.db.withTenantTx(async (tx) => {
    const [row] = await tx
      .select({ is_chief: userRoles.isChiefInstructor })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, ctx.session.user.id),
          eq(userRoles.role, 'instructor'),
          eq(userRoles.isChiefInstructor, true),
        ),
      )
      .limit(1);
    return !!row?.is_chief;
  });

  if (!isChief) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Chief instructor role required',
    });
  }

  return next({ ctx });
});
```

### Example 2: buildOverrideSignerSnapshot

```typescript
// packages/api/src/helpers/buildOverrideSignerSnapshot.ts
// Source: mirrors packages/api/src/helpers/buildInstructorSignerSnapshot.ts
import type { Context } from '../context';

export async function buildOverrideSignerSnapshot(ctx: Context) {
  return ctx.db.withTenantTx(async (tx) => {
    const [person] = await tx
      .select({
        full_name: personProfile.fullName,
        cert_type: personProfile.instructorCertType, // e.g. 'CFII'
        cert_number: personProfile.instructorCertNumber,
      })
      .from(personProfile)
      .where(eq(personProfile.userId, ctx.session.user.id))
      .limit(1);

    if (!person)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Granter profile not found' });

    return {
      full_name: person.full_name,
      cert_type: person.cert_type,
      cert_number: person.cert_number,
      granted_at: new Date().toISOString(),
      granted_by_user_id: ctx.session.user.id,
    };
  });
}
```

### Example 3: pg_cron Registration from Migration

```sql
-- 0032_phase6_pg_cron.sql
-- Source: https://supabase.com/docs/guides/database/extensions/pg_cron
create extension if not exists pg_cron;

-- Idempotent registration: unschedule if already present, then schedule fresh.
do $$
begin
  perform cron.unschedule('phase6_nightly_training_record_audit');
exception when others then
  -- not scheduled yet, ignore
  null;
end $$;

select cron.schedule(
  'phase6_nightly_training_record_audit',
  '0 7 * * *',  -- 07:00 UTC daily
  $$select public.run_training_record_audit()$$
);
```

### Example 4: Extending `schedule.approve` (sketch)

```typescript
// packages/api/src/routers/schedule.ts — approve procedure
// After existing Phase 3 airworthiness + Phase 5 student-currency checks:
if (reservation.lesson_id && reservation.student_enrollment_id) {
  const result = await tx.execute<{ evaluate_lesson_eligibility: EligibilityResult }>(sql`
    select public.evaluate_lesson_eligibility(
      ${reservation.student_enrollment_id},
      ${reservation.lesson_id},
      ${reservation.aircraft_id},
      ${reservation.instructor_user_id}
    ) as evaluate_lesson_eligibility
  `);
  const payload = result.rows[0]?.evaluate_lesson_eligibility;
  if (!payload?.ok) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Lesson eligibility blockers',
      cause: { blockers: payload?.blockers ?? [] },
    });
  }
}
```

## State of the Art

| Old Approach                         | Current Approach                              | When Changed                                   | Impact                                            |
| ------------------------------------ | --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| App-tier rules engine in node        | SQL functions callable from RLS + cron + tRPC | Phase 3 set the pattern with `is_airworthy_at` | Single source of truth, RLS-callable, no drift    |
| Per-process cron (node-cron, BullMQ) | pg_cron in Supabase                           | Supabase shipped pg_cron ~2023, 1.6.4 current  | No separate worker infra, transactional with data |
| Physical duplicated rollover rows    | Virtual via nullable FK                       | Phase 6 CONTEXT decision                       | No data drift, cleaner audit                      |
| Live recompute forecast on read      | Trigger-refreshed cache                       | Phase 4 `aircraft_downtime_forecast`           | Bounded read latency, eventual via nightly sweep  |

**Deprecated/outdated:**

- `schedule.checkStudentCurrency` as the _only_ gate — Phase 6 supersedes with `evaluate_lesson_eligibility`. Keep the old procedure for narrower UI queries per CONTEXT, but document in its JSDoc that `approve` no longer relies on it alone.

## Open Questions

1. **Does Supabase local CLI ship pg_cron in the current release?**
   - What we know: Hosted Supabase has pg_cron 1.6.4. Supabase CLI historically had gaps ([GitHub issue #158](https://github.com/supabase/cli/issues/158), though now resolved).
   - What's unclear: Exact CLI version in developer's `.env` / local dev image.
   - Recommendation: Wave 0 task verifies `create extension pg_cron` works locally; if not, pin the required CLI version in CLAUDE.md and document the upgrade.

2. **Should `is_passing_grade` SQL mirror also become the TS authority (port back)?**
   - What we know: Phase 5 shipped TS `isPassingGrade` in `packages/domain`.
   - What's unclear: Whether TS callers in Phase 5 UI still need it post-Phase-6.
   - Recommendation: Keep TS for UI preview (pre-seal hint text), add a unit test that compares TS output to a Postgres-backed query for every (scale, value) pair. SQL is authority at gate time.

3. **Forecast cache refresh on bulk flight_log_time insert — statement trigger or row trigger?**
   - What we know: Phase 4 uses row-level triggers for `aircraft_downtime_forecast`.
   - What's unclear: Whether dispatch flow ever inserts >1 `flight_log_time` in one statement.
   - Recommendation: Start with row-level trigger + `SELECT FOR UPDATE` dedup (Phase 4 pattern). If dispatch tests show storming, convert to statement-level with transition tables.

4. **`training_record_audit_exception` severity thresholds?**
   - Marked as Claude's discretion.
   - Recommendation: `critical` for `missing_endorsements` (student cannot continue), `warn` for `hours_deficit` / `missing_stage_checks` / `stale_rollovers`, `info` for `expired_overrides` / `missing_lessons` early in course.

5. **Admin dashboard: new panel or new sub-page for IPF-06 overrides activity?**
   - Marked as Claude's discretion.
   - Recommendation: Panel on existing admin dashboard (Phase 4 already has the dashboard shell) + dedicated `/admin/overrides` full-list page. Dashboard panel shows last 10 with link to full page.

## Validation Architecture

> `.planning/config.json` does not set `workflow.nyquist_validation = true`, so this section is a lightweight sketch only — full Nyquist validation is not mandated by repo config.

### Test Framework

| Property           | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| Framework          | Vitest (`tests/rls/*.test.ts` pattern)                   |
| Config file        | `tests/rls/package.json` + existing vitest config        |
| Quick run command  | `pnpm -w --filter @part61/tests-rls test -- -t "phase6"` |
| Full suite command | `pnpm -w test` (all workspaces)                          |

### Phase Requirements → Test Map (sketch for planner)

| Req              | Behavior                                              | Test Type                 | Target file                                                                                          |
| ---------------- | ----------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| SYL-15           | rollover appears on new sheet, clears on pass         | integration               | `tests/rls/api-phase6-rollover.test.ts`                                                              |
| SYL-16           | prereq blocks approve + createFromReservation         | integration               | `tests/rls/api-phase6-prereq.test.ts`                                                                |
| SYL-17           | override grants → single consume → re-blocks          | integration + concurrency | `tests/rls/api-phase6-override.test.ts` (mirror `phase4-camp-functions.test.ts` concurrency harness) |
| SYL-18/19/SCH-11 | instructor + aircraft + student reqs filter correctly | integration               | `tests/rls/api-phase6-eligibility.test.ts`                                                           |
| SYL-20           | 3rd attempt when `max_repeats=2` blocks               | integration               | included in override test                                                                            |
| SYL-21           | minimums view sums correctly                          | SQL                       | `tests/rls/phase6-minimums.test.ts`                                                                  |
| SYL-22/23        | forecast function math                                | SQL + integration         | `tests/rls/phase6-forecast.test.ts`                                                                  |
| SCH-14           | suggest_next_activity returns expected lesson         | SQL                       | `tests/rls/phase6-next-activity.test.ts`                                                             |
| SYL-24           | run_training_record_audit idempotent                  | SQL                       | `tests/rls/phase6-audit-cron.test.ts`                                                                |
| IPF-06           | management_override_activity view                     | SQL                       | included in override test                                                                            |

### Wave 0 Gaps

- [ ] Verify pg_cron available in local supabase CLI — if not, bump CLI version
- [ ] Fixture helper: "enrolled student with N sealed grade sheets and M failing line items" for rollover/prereq tests (extend Phase 5 harness in `tests/rls/harness.ts`)
- [ ] Concurrency harness pattern from `phase4-camp-functions.test.ts` copied for override consumption race test

## Sources

### Primary (HIGH confidence)

- `/Users/christopher/Desktop/Part 61 School/.planning/phases/06-syllabus-rules-progression-audit/06-CONTEXT.md` — all structural decisions
- `/Users/christopher/Desktop/Part 61 School/.planning/REQUIREMENTS.md` — SYL-15..24, SCH-05/11/14, IPF-06 wording
- `/Users/christopher/Desktop/Part 61 School/packages/db/migrations/0011_phase4_functions_triggers.sql` — SQL-function pattern, SELECT FOR UPDATE serialization, trigger structure
- `/Users/christopher/Desktop/Part 61 School/packages/db/migrations/0010_phase4_camp_tables.sql` (referenced) — override table pattern
- `/Users/christopher/Desktop/Part 61 School/CLAUDE.md` — stack, banned-term rule, conventions
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — extension install, `cron.schedule()` from migrations, version 1.6.4

### Secondary (MEDIUM confidence)

- [Supabase Cron guide](https://supabase.com/docs/guides/cron) — migration-stored scheduled jobs best practice
- [Supabase pg_cron debugging guide](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz) — troubleshooting reference for Wave 0

### Tertiary (LOW confidence — needs local verification)

- Local Supabase CLI pg_cron availability (varies by CLI version; issue #158 historically)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every component already in repo; pg_cron confirmed via Supabase docs
- Architecture: HIGH — every pattern has a Phase 3/4/5 in-repo precedent
- Pitfalls: HIGH — 8 of 10 pitfalls learned directly from Phase 2-5 caveats
- Validation: MEDIUM — nyquist not enabled; test mapping is a planner hint, not a locked contract

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable — pg_cron is mature, all other patterns are internal)
