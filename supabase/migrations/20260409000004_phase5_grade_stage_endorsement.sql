-- Phase 5 migration (part 4 of 5): grade sheets, stage checks,
-- endorsements, flight_log_time.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000004_phase5_grade_stage_endorsement.sql.
--
-- Tables created:
--   lesson_grade_sheet
--   line_item_grade
--   stage_check
--   endorsement_template  (catalog, not school-scoped)
--   student_endorsement
--   flight_log_time
--
-- Every safety-relevant table gets: RLS (school_id scoped), audit.attach
-- (both audit + hard-delete blocker). endorsement_template is reference
-- data so it gets audit-only, no hard-delete blocker.
--
-- Seal columns (sealed_at / sealed + signer_snapshot) are present now;
-- the seal-enforcement triggers live in 0018.

-- ============================================================================
-- 1. New enums
-- ============================================================================
create type public.lesson_grade_sheet_kind as enum (
  'lesson',
  'stage_test',
  'end_of_course_oral',
  'knowledge_test'
);

create type public.lesson_grade_sheet_status as enum (
  'draft',
  'signed',
  'sealed'
);

create type public.stage_check_status as enum (
  'scheduled',
  'passed',
  'failed'
);

create type public.flight_log_time_kind as enum (
  'dual_received',
  'dual_given',
  'pic',
  'sic',
  'solo'
);

create type public.endorsement_category as enum (
  'student_pilot',
  'solo',
  'xc',
  'aircraft_class_rating',
  'flight_review',
  'ipc',
  'practical_test',
  'knowledge_test',
  'other'
);

-- ============================================================================
-- 2. lesson_grade_sheet
-- ============================================================================
create table public.lesson_grade_sheet (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null references public.schools(id),
  base_id                   uuid references public.bases(id),
  reservation_id            uuid references public.reservation(id),
  student_enrollment_id     uuid not null references public.student_course_enrollment(id),
  lesson_id                 uuid not null references public.lesson(id),
  kind                      public.lesson_grade_sheet_kind not null default 'lesson',
  conducted_at              timestamptz not null default now(),
  conducted_by_user_id      uuid references public.users(id),
  ground_minutes            integer not null default 0,
  flight_minutes            integer not null default 0,
  overall_remarks           text,
  status                    public.lesson_grade_sheet_status not null default 'draft',
  score_numeric             numeric(6,2),
  score_max                 numeric(6,2),
  signer_snapshot           jsonb,
  sealed_at                 timestamptz,
  corrects_grade_sheet_id   uuid references public.lesson_grade_sheet(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.users(id),
  updated_by                uuid references public.users(id),
  deleted_at                timestamptz
);
create index lesson_grade_sheet_enrollment_idx
  on public.lesson_grade_sheet (student_enrollment_id, conducted_at desc)
  where deleted_at is null;
create index lesson_grade_sheet_lesson_idx
  on public.lesson_grade_sheet (lesson_id) where deleted_at is null;

-- ============================================================================
-- 3. line_item_grade
-- ============================================================================
create table public.line_item_grade (
  id              uuid primary key default gen_random_uuid(),
  grade_sheet_id  uuid not null references public.lesson_grade_sheet(id),
  line_item_id    uuid not null references public.line_item(id),
  grade_value     text not null,
  grade_remarks   text,
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index line_item_grade_sheet_idx
  on public.line_item_grade (grade_sheet_id, position);

-- ============================================================================
-- 4. stage_check
-- ============================================================================
create table public.stage_check (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null references public.schools(id),
  base_id                   uuid references public.bases(id),
  student_enrollment_id     uuid not null references public.student_course_enrollment(id),
  stage_id                  uuid not null references public.stage(id),
  checker_user_id           uuid not null references public.users(id),
  scheduled_at              timestamptz,
  conducted_at              timestamptz,
  status                    public.stage_check_status not null default 'scheduled',
  remarks                   text,
  signer_snapshot           jsonb,
  sealed_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.users(id),
  updated_by                uuid references public.users(id),
  deleted_at                timestamptz
);
create index stage_check_enrollment_idx
  on public.stage_check (student_enrollment_id, scheduled_at desc)
  where deleted_at is null;

-- ============================================================================
-- 5. endorsement_template (catalog / reference data)
-- ============================================================================
create table public.endorsement_template (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  title           text not null,
  body_template   text not null,
  category        public.endorsement_category not null,
  ac_reference    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create unique index endorsement_template_code_unique
  on public.endorsement_template (code) where deleted_at is null;

-- ============================================================================
-- 6. student_endorsement
-- ============================================================================
create table public.student_endorsement (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references public.schools(id),
  base_id                 uuid references public.bases(id),
  student_user_id         uuid not null references public.users(id),
  template_id             uuid references public.endorsement_template(id),
  rendered_text           text not null,
  issued_at               timestamptz not null default now(),
  issued_by_user_id       uuid references public.users(id),
  signer_snapshot         jsonb,
  expires_at              timestamptz,
  aircraft_context        text,
  notes                   text,
  sealed                  boolean not null default false,
  sealed_at               timestamptz,
  revoked_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references public.users(id),
  updated_by              uuid references public.users(id),
  deleted_at              timestamptz
);
create index student_endorsement_student_idx
  on public.student_endorsement (student_user_id, issued_at desc)
  where deleted_at is null;

-- ============================================================================
-- 7. flight_log_time
-- ============================================================================
create table public.flight_log_time (
  id                             uuid primary key default gen_random_uuid(),
  school_id                      uuid not null references public.schools(id),
  base_id                        uuid references public.bases(id),
  reservation_id                 uuid references public.reservation(id),
  flight_log_entry_id            uuid references public.flight_log_entry(id),
  user_id                        uuid not null references public.users(id),
  kind                           public.flight_log_time_kind not null,
  day_minutes                    integer not null default 0,
  night_minutes                  integer not null default 0,
  cross_country_minutes          integer not null default 0,
  instrument_actual_minutes      integer not null default 0,
  instrument_simulated_minutes   integer not null default 0,
  is_simulator                   boolean not null default false,
  time_in_make_model             text,
  day_landings                   integer not null default 0,
  night_landings                 integer not null default 0,
  instrument_approaches          integer not null default 0,
  notes                          text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  created_by                     uuid references public.users(id),
  updated_by                     uuid references public.users(id),
  deleted_at                     timestamptz,
  constraint flight_log_time_minutes_nonneg check (
    day_minutes                  >= 0
    and night_minutes            >= 0
    and cross_country_minutes    >= 0
    and instrument_actual_minutes >= 0
    and instrument_simulated_minutes >= 0
    and day_landings             >= 0
    and night_landings           >= 0
    and instrument_approaches    >= 0
  )
);
create index flight_log_time_user_idx
  on public.flight_log_time (user_id, created_at desc)
  where deleted_at is null;
create index flight_log_time_reservation_idx
  on public.flight_log_time (reservation_id)
  where deleted_at is null;

-- ============================================================================
-- 8. RLS enable + policies
-- ============================================================================
alter table public.lesson_grade_sheet      enable row level security;
alter table public.line_item_grade         enable row level security;
alter table public.stage_check             enable row level security;
alter table public.endorsement_template    enable row level security;
alter table public.student_endorsement     enable row level security;
alter table public.flight_log_time         enable row level security;

-- school-scoped standard pattern
create policy lesson_grade_sheet_select on public.lesson_grade_sheet
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy lesson_grade_sheet_modify on public.lesson_grade_sheet
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- line_item_grade: inherit via parent grade sheet
create policy line_item_grade_select on public.line_item_grade
  for select to authenticated
  using (grade_sheet_id in (select id from public.lesson_grade_sheet));
create policy line_item_grade_modify on public.line_item_grade
  for all to authenticated
  using (grade_sheet_id in (select id from public.lesson_grade_sheet))
  with check (grade_sheet_id in (select id from public.lesson_grade_sheet));

create policy stage_check_select on public.stage_check
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy stage_check_modify on public.stage_check
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- endorsement_template: catalog, readable by all authenticated; modify
-- restricted to admin via tRPC (no RLS write policy → writes need the
-- superuser/migration path).
create policy endorsement_template_select on public.endorsement_template
  for select to authenticated
  using (true);

create policy student_endorsement_select on public.student_endorsement
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy student_endorsement_modify on public.student_endorsement
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy flight_log_time_select on public.flight_log_time
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy flight_log_time_modify on public.flight_log_time
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- ============================================================================
-- 9. Audit + hard-delete blocker triggers
-- ============================================================================
select audit.attach('lesson_grade_sheet');
select audit.attach('line_item_grade');
select audit.attach('stage_check');
select audit.attach('student_endorsement');
select audit.attach('flight_log_time');

-- endorsement_template: audit-only (reference data, no hard-delete blocker)
create trigger endorsement_template_audit
  after insert or update or delete on public.endorsement_template
  for each row execute function audit.fn_log_change();
