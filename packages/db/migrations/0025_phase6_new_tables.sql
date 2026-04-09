-- Phase 6 migration (part 3): new tables + line_item_grade rollover column.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000012_phase6_new_tables.sql.
--
-- Creates:
--   1. line_item_grade.rollover_from_grade_sheet_id column (SYL-15)
--   2. lesson_override table (SYL-17) — mirrors Phase 4 maintenance_overrun
--   3. training_record_audit_exception table (SYL-24) — nightly audit results
--   4. student_progress_forecast_cache table (SYL-22/23) — mirrors Phase 4
--      aircraft_downtime_forecast
--
-- All three new tables get RLS, audit triggers, and (where appropriate)
-- hard-delete blockers via audit.attach().

-- ============================================================================
-- 1. line_item_grade: rollover column + partial index (SYL-15)
-- ============================================================================
alter table public.line_item_grade
  add column rollover_from_grade_sheet_id uuid
    references public.lesson_grade_sheet(id) on delete set null;

create index line_item_grade_rollover_idx
  on public.line_item_grade (rollover_from_grade_sheet_id)
  where rollover_from_grade_sheet_id is not null;

-- ============================================================================
-- 2. lesson_override (SYL-17) — mirrors maintenance_overrun pattern
-- ============================================================================
create table public.lesson_override (
  id                          uuid primary key default gen_random_uuid(),
  school_id                   uuid not null references public.schools(id),
  base_id                     uuid references public.bases(id),
  student_enrollment_id       uuid not null references public.student_course_enrollment(id),
  lesson_id                   uuid not null references public.lesson(id),
  kind                        public.lesson_override_kind not null,
  justification               text not null check (length(justification) >= 20),
  granted_at                  timestamptz not null default now(),
  granted_by_user_id          uuid not null references public.users(id),
  signer_snapshot             jsonb not null,
  expires_at                  timestamptz not null default now() + interval '30 days',
  consumed_at                 timestamptz,
  consumed_by_grade_sheet_id  uuid references public.lesson_grade_sheet(id),
  revoked_at                  timestamptz,
  revoked_by_user_id          uuid references public.users(id),
  revocation_reason           text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);

-- Only one active (unconsumed + unrevoked) override per enrollment+lesson
create unique index lesson_override_active_unique
  on public.lesson_override (student_enrollment_id, lesson_id)
  where consumed_at is null and revoked_at is null;

-- ============================================================================
-- 3. training_record_audit_exception (SYL-24)
-- ============================================================================
create table public.training_record_audit_exception (
  id                          uuid primary key default gen_random_uuid(),
  school_id                   uuid not null references public.schools(id),
  base_id                     uuid references public.bases(id),
  student_enrollment_id       uuid not null references public.student_course_enrollment(id),
  kind                        public.audit_exception_kind not null,
  severity                    public.audit_exception_severity not null,
  details                     jsonb not null default '{}'::jsonb,
  first_detected_at           timestamptz not null default now(),
  last_detected_at            timestamptz not null default now(),
  resolved_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);

-- UPSERT idempotency: one open exception per (enrollment, kind)
create unique index training_record_audit_exception_open_unique
  on public.training_record_audit_exception (student_enrollment_id, kind)
  where resolved_at is null;

-- ============================================================================
-- 4. student_progress_forecast_cache (SYL-22/23)
-- ============================================================================
create table public.student_progress_forecast_cache (
  student_enrollment_id       uuid primary key
    references public.student_course_enrollment(id) on delete cascade,
  school_id                   uuid not null references public.schools(id),
  base_id                     uuid not null references public.bases(id),
  computed_at                 timestamptz not null default now(),
  expected_hours_to_date      numeric not null,
  actual_hours_to_date        numeric not null,
  ahead_behind_hours          numeric not null,
  ahead_behind_weeks          numeric not null,
  remaining_hours             numeric not null,
  projected_checkride_date    date,
  projected_completion_date   date,
  confidence                  text not null check (confidence in ('low', 'medium', 'high'))
);

-- ============================================================================
-- 5. RLS enable
-- ============================================================================
alter table public.lesson_override                     enable row level security;
alter table public.training_record_audit_exception     enable row level security;
alter table public.student_progress_forecast_cache     enable row level security;

-- ============================================================================
-- 6. RLS policies — school_id + nullable-base predicate (Phase 4/5 pattern)
-- ============================================================================

-- lesson_override
create policy lesson_override_select_own_school_base on public.lesson_override
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy lesson_override_modify_own_school_base on public.lesson_override
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- training_record_audit_exception
create policy training_record_audit_exception_select_own_school on public.training_record_audit_exception
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy training_record_audit_exception_modify_own_school on public.training_record_audit_exception
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- student_progress_forecast_cache
create policy student_progress_forecast_cache_select on public.student_progress_forecast_cache
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy student_progress_forecast_cache_modify on public.student_progress_forecast_cache
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- ============================================================================
-- 7. Audit + hard-delete blockers
-- ============================================================================

-- lesson_override: safety-relevant, audit + hard-delete blocker
select audit.attach('lesson_override');

-- training_record_audit_exception: safety-relevant, audit + hard-delete blocker
select audit.attach('training_record_audit_exception');

-- student_progress_forecast_cache: cache table, audit-only (no hard-delete
-- blocker — evictable via ON DELETE CASCADE from enrollment)
create trigger student_progress_forecast_cache_audit
  after insert or update or delete on public.student_progress_forecast_cache
  for each row execute function audit.fn_log_change();
