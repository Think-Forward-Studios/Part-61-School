-- Phase 5 migration (part 3 of 5): 6-level course tree + versioning.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000003_phase5_course_tree.sql.
--
-- Creates:
--   course, course_version, stage, course_phase, unit, lesson, line_item
--   + enums: lesson_kind, line_item_classification, grading_scale
--   + extends student_course_enrollment with course_version_id FK
--   + extends reservation with lesson_id, student_enrollment_id FKs
--   + seeds currency_kind_config rows for new student currencies
--
-- All tree-node tables denormalize school_id + course_version_id so:
--   (a) RLS can stay simple ("school_id = jwt school_id")
--   (b) the transitive seal trigger (0018) is a 1-row EXISTS on
--       course_version.published_at rather than a recursive join.
--
-- Exclusive-FK CHECK constraints:
--   unit:    num_nonnulls(stage_id, course_phase_id) = 1
--   lesson:  num_nonnulls(stage_id, course_phase_id, unit_id) = 1
--
-- course.school_id is nullable so seeded system templates (school_id=null)
-- are visible catalog-wide; school forks (clone_course_version) copy them
-- to a specific school_id.

-- ============================================================================
-- 1. New enums
-- ============================================================================
create type public.lesson_kind as enum
  ('ground','flight','simulator','oral','written_test');

create type public.line_item_classification as enum
  ('required','optional','must_pass');

create type public.grading_scale as enum
  ('absolute_ipm','relative_5','pass_fail');

-- ============================================================================
-- 2. course
-- ============================================================================
create type public.course_rating_sought as enum (
  'private_pilot',
  'instrument_rating',
  'commercial_single_engine',
  'commercial_multi_engine',
  'cfi',
  'cfii',
  'mei',
  'custom'
);

create table public.course (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid references public.schools(id), -- null = system template
  code            text not null,
  title           text not null,
  rating_sought   public.course_rating_sought not null,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  updated_by      uuid references public.users(id),
  deleted_at      timestamptz
);
create unique index course_school_code_unique
  on public.course (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  where deleted_at is null;

-- ============================================================================
-- 3. course_version
-- ============================================================================
create table public.course_version (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.course(id),
  school_id        uuid references public.schools(id), -- inherited at clone time; null for system templates
  version_label    text not null,
  grading_scale    public.grading_scale not null default 'absolute_ipm',
  min_levels       integer not null default 3 check (min_levels between 3 and 5),
  notes            text,
  published_at     timestamptz,
  published_by     uuid references public.users(id),
  superseded_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.users(id),
  updated_by       uuid references public.users(id),
  deleted_at       timestamptz
);
create unique index course_version_course_label_unique
  on public.course_version (course_id, version_label)
  where deleted_at is null;
create index course_version_published_idx
  on public.course_version (published_at)
  where deleted_at is null;

-- ============================================================================
-- 4. stage
-- ============================================================================
create table public.stage (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid references public.schools(id), -- denormalized from course_version
  course_version_id     uuid not null references public.course_version(id),
  position              integer not null,
  code                  text not null,
  title                 text not null,
  objectives            text,
  completion_standards  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.users(id),
  updated_by            uuid references public.users(id),
  deleted_at            timestamptz
);
create index stage_version_position_idx
  on public.stage (course_version_id, position)
  where deleted_at is null;

-- ============================================================================
-- 5. course_phase (optional middle layer; parent = stage)
-- ============================================================================
create table public.course_phase (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid references public.schools(id),
  course_version_id     uuid not null references public.course_version(id),
  stage_id              uuid not null references public.stage(id),
  position              integer not null,
  code                  text not null,
  title                 text not null,
  objectives            text,
  completion_standards  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.users(id),
  updated_by            uuid references public.users(id),
  deleted_at            timestamptz
);
create index course_phase_stage_position_idx
  on public.course_phase (stage_id, position)
  where deleted_at is null;

-- ============================================================================
-- 6. unit (optional middle layer; exclusive parent stage | course_phase)
-- ============================================================================
create table public.unit (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid references public.schools(id),
  course_version_id     uuid not null references public.course_version(id),
  stage_id              uuid references public.stage(id),
  course_phase_id       uuid references public.course_phase(id),
  position              integer not null,
  code                  text not null,
  title                 text not null,
  objectives            text,
  completion_standards  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.users(id),
  updated_by            uuid references public.users(id),
  deleted_at            timestamptz,
  constraint unit_exclusive_parent
    check (num_nonnulls(stage_id, course_phase_id) = 1)
);
create index unit_parent_idx
  on public.unit (coalesce(course_phase_id, stage_id), position)
  where deleted_at is null;

-- ============================================================================
-- 7. lesson (exclusive parent: stage | course_phase | unit)
-- ============================================================================
create table public.lesson (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid references public.schools(id),
  course_version_id         uuid not null references public.course_version(id),
  stage_id                  uuid references public.stage(id),
  course_phase_id           uuid references public.course_phase(id),
  unit_id                   uuid references public.unit(id),
  position                  integer not null,
  code                      text not null,
  title                     text not null,
  kind                      public.lesson_kind not null,
  objectives                text,
  completion_standards      text,
  min_hours                 numeric(4,1),
  required_resources        jsonb not null default '[]'::jsonb,
  required_currencies       jsonb not null default '[]'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.users(id),
  updated_by                uuid references public.users(id),
  deleted_at                timestamptz,
  constraint lesson_exclusive_parent
    check (num_nonnulls(stage_id, course_phase_id, unit_id) = 1)
);
create index lesson_version_position_idx
  on public.lesson (course_version_id, position)
  where deleted_at is null;
create index lesson_unit_idx
  on public.lesson (unit_id) where unit_id is not null and deleted_at is null;
create index lesson_course_phase_idx
  on public.lesson (course_phase_id) where course_phase_id is not null and deleted_at is null;
create index lesson_stage_idx
  on public.lesson (stage_id) where stage_id is not null and deleted_at is null;

-- ============================================================================
-- 8. line_item
-- ============================================================================
create table public.line_item (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid references public.schools(id),
  course_version_id         uuid not null references public.course_version(id),
  lesson_id                 uuid not null references public.lesson(id),
  position                  integer not null,
  code                      text not null,
  title                     text not null,
  description               text,
  objectives                text,
  completion_standards      text,
  classification            public.line_item_classification not null default 'required',
  grading_scale_override    public.grading_scale,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.users(id),
  updated_by                uuid references public.users(id),
  deleted_at                timestamptz
);
create index line_item_lesson_position_idx
  on public.line_item (lesson_id, position)
  where deleted_at is null;

-- ============================================================================
-- 9. RLS enable + policies
-- ============================================================================
alter table public.course          enable row level security;
alter table public.course_version  enable row level security;
alter table public.stage           enable row level security;
alter table public.course_phase    enable row level security;
alter table public.unit            enable row level security;
alter table public.lesson          enable row level security;
alter table public.line_item       enable row level security;

-- course: school_id null = system template (visible to all authenticated),
-- otherwise school-scoped. Modify only within own school.
create policy course_select on public.course
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy course_modify on public.course
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- course_version: same null-is-template pattern
create policy course_version_select on public.course_version
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy course_version_modify on public.course_version
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- Helper macro repeats: the tree nodes below all follow the same
-- "school_id null = template read, matching school = read+write" rule.
create policy stage_select on public.stage
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy stage_modify on public.stage
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy course_phase_select on public.course_phase
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy course_phase_modify on public.course_phase
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy unit_select on public.unit
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy unit_modify on public.unit
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy lesson_select on public.lesson
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy lesson_modify on public.lesson
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy line_item_select on public.line_item
  for select to authenticated
  using (school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy line_item_modify on public.line_item
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- ============================================================================
-- 10. Audit + hard-delete blocker triggers
-- ============================================================================
select audit.attach('course');
select audit.attach('course_version');
select audit.attach('stage');
select audit.attach('course_phase');
select audit.attach('unit');
select audit.attach('lesson');
select audit.attach('line_item');

-- ============================================================================
-- 11. Extend student_course_enrollment: replace course_descriptor with
--     course_version_id FK.
-- ============================================================================
alter table public.student_course_enrollment
  add column course_version_id uuid references public.course_version(id),
  add column primary_instructor_id uuid references public.users(id);

-- course_descriptor stays as a nullable legacy column for one release so
-- Phase 2 seed data continues to validate. New rows should set
-- course_version_id; the domain layer will enforce it in Phase 5 Plan 03.
alter table public.student_course_enrollment
  alter column course_descriptor drop not null;

-- ============================================================================
-- 12. Extend reservation with lesson_id + student_enrollment_id
-- ============================================================================
alter table public.reservation
  add column lesson_id uuid references public.lesson(id),
  add column student_enrollment_id uuid references public.student_course_enrollment(id);

-- ============================================================================
-- 13. Seed currency_kind_config for new student currencies
-- ============================================================================
insert into public.currency_kind_config (kind, warning_days) values
  ('medical_class_1',            30),
  ('medical_class_2',            30),
  ('medical_class_3',            30),
  ('basicmed',                   30),
  ('flight_review',              60),
  ('solo_endorsement_scope',     90),
  ('day_passenger_currency',     30),
  ('night_passenger_currency',   30),
  ('instrument_currency',        60),
  ('tailwheel_currency',         90),
  ('high_performance_currency',  90),
  ('complex_currency',           90)
on conflict (kind) do nothing;
