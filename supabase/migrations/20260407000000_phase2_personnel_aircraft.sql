-- Phase 2 migration: personnel, admin & fleet primitives.
--
-- Hand-authored (mirrored verbatim at
-- supabase/migrations/20260407000000_phase2_personnel_aircraft.sql).
--
-- Order of operations:
--   1. Extend existing enums (role, document_kind) idempotently
--   2. Create new enums
--   3. Extend users (status) and documents (aircraft_id)
--   4. Create Phase 2 tables in FK order
--   5. Wire documents.aircraft_id FK (after aircraft exists)
--   6. Enable RLS on every new table
--   7. Create the currency_status SQL function
--   8. Create the two derived-totals views WITH (security_invoker = true)
--   9. Seed currency_kind_config defaults
--  10. Attach audit + hard-delete blocker triggers to safety-relevant tables
--
-- Append-only + audit contract reminders:
--   - flight_log_entry has NO update policy (RLS denies updates) and
--     a hard-delete blocker trigger (raises P0001 on DELETE).
--   - Corrections are NEW rows with kind='correction' and a corrects_id FK.
--   - Views MUST be security_invoker = true (Pitfall 2 in 02-RESEARCH).

-- ============================================================================
-- 1. Extend existing enums (idempotent — Drizzle-kit omits IF NOT EXISTS)
-- ============================================================================
alter type public.role add value if not exists 'rental_customer';
alter type public.document_kind add value if not exists 'aircraft_photo';

-- ============================================================================
-- 2. New enums
-- ============================================================================
create type public.user_status as enum ('pending', 'active', 'inactive', 'rejected');
create type public.hold_kind as enum ('hold', 'grounding');
create type public.currency_kind as enum ('cfi', 'cfii', 'mei', 'medical', 'bfr', 'ipc');
create type public.qualification_kind as enum ('aircraft_type', 'sim_authorization', 'course_authorization');
create type public.flight_log_entry_kind as enum ('flight', 'baseline', 'correction');
create type public.engine_position as enum ('single', 'left', 'right', 'center', 'n1', 'n2', 'n3', 'n4');
create type public.citizenship_status as enum ('us_citizen', 'us_national', 'foreign_national', 'unknown');
create type public.tsa_afsp_status as enum ('not_required', 'pending', 'approved', 'expired');
create type public.experience_source as enum ('self_reported', 'imported', 'derived');
create type public.aircraft_equipment_tag as enum (
  'ifr_equipped','complex','high_performance','glass_panel','autopilot',
  'ads_b_out','ads_b_in','gtn_650','gtn_750','g1000','g3x',
  'garmin_530','kln_94','tail_dragger','retractable_gear'
);

-- ============================================================================
-- 3. Extend existing tables
-- ============================================================================
alter table public.users add column status public.user_status not null default 'active';
create index users_status_idx on public.users (status);

alter table public.documents add column aircraft_id uuid;
-- FK added in step 5 after aircraft table exists.

-- ============================================================================
-- 4. Create Phase 2 tables (FK order)
-- ============================================================================

-- 4a. Aircraft primitives (bases already exists from Phase 1)
create table public.aircraft (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id),
  base_id           uuid not null references public.bases(id),
  tail_number       text not null,
  make              text,
  model             text,
  year              integer,
  equipment_notes   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index aircraft_school_tail_unique on public.aircraft (school_id, tail_number);

create table public.aircraft_engine (
  id            uuid primary key default gen_random_uuid(),
  aircraft_id   uuid not null references public.aircraft(id),
  position      public.engine_position not null,
  serial_number text,
  installed_at  timestamptz,
  removed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table public.aircraft_equipment (
  aircraft_id   uuid not null references public.aircraft(id),
  tag           public.aircraft_equipment_tag not null,
  primary key (aircraft_id, tag)
);

-- 4b. Flight log event store (append-only)
create table public.flight_log_entry (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id),
  base_id         uuid not null references public.bases(id),
  aircraft_id     uuid not null references public.aircraft(id),
  kind            public.flight_log_entry_kind not null,
  flown_at        timestamptz not null,
  hobbs_out       numeric(10,1),
  hobbs_in        numeric(10,1),
  tach_out        numeric(10,1),
  tach_in         numeric(10,1),
  airframe_delta  numeric(10,1) not null default 0,
  corrects_id     uuid references public.flight_log_entry(id),
  recorded_by     uuid not null references public.users(id),
  recorded_at     timestamptz not null default now(),
  notes           text
);
create index flight_log_entry_aircraft_flown_idx on public.flight_log_entry (aircraft_id, flown_at);

create table public.flight_log_entry_engine (
  flight_log_entry_id  uuid not null references public.flight_log_entry(id),
  engine_id            uuid not null references public.aircraft_engine(id),
  delta_hours          numeric(10,1) not null default 0,
  primary key (flight_log_entry_id, engine_id)
);

-- 4c. Personnel 1:1 and 1:N tables
create table public.person_profile (
  user_id                 uuid primary key references public.users(id),
  school_id               uuid not null references public.schools(id),
  first_name              text,
  last_name               text,
  date_of_birth           date,
  address_line1           text,
  address_line2           text,
  city                    text,
  state                   text,
  postal_code             text,
  country                 text,
  phone                   text,
  email_alt               text,
  faa_airman_cert_number  text,
  citizenship_status      public.citizenship_status,
  tsa_afsp_status         public.tsa_afsp_status,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create table public.emergency_contact (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id),
  user_id      uuid not null references public.users(id),
  name         text not null,
  relationship text,
  phone        text,
  email        text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.info_release_authorization (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id),
  user_id      uuid not null references public.users(id),
  name         text not null,
  relationship text,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  notes        text
);

create table public.instructor_experience (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id),
  user_id            uuid not null references public.users(id),
  total_time         numeric(10,1),
  pic_time           numeric(10,1),
  instructor_time    numeric(10,1),
  multi_engine_time  numeric(10,1),
  instrument_time    numeric(10,1),
  as_of_date         date not null,
  source             public.experience_source not null default 'self_reported',
  notes              text,
  created_at         timestamptz not null default now()
);

-- 4d. Holds, currencies, qualifications
create table public.person_hold (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id),
  user_id         uuid not null references public.users(id),
  kind            public.hold_kind not null,
  reason          text not null,
  created_by      uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  cleared_at      timestamptz,
  cleared_by      uuid references public.users(id),
  cleared_reason  text
);
create index person_hold_user_active_idx on public.person_hold (user_id) where cleared_at is null;

create table public.currency_kind_config (
  kind          public.currency_kind primary key,
  warning_days  integer not null
);

create table public.instructor_currency (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id),
  user_id       uuid not null references public.users(id),
  kind          public.currency_kind not null,
  effective_at  timestamptz not null,
  expires_at    timestamptz,
  notes         text,
  document_id   uuid references public.documents(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index instructor_currency_user_kind_idx on public.instructor_currency (user_id, kind);
create index instructor_currency_expires_idx on public.instructor_currency (expires_at);

create table public.instructor_qualification (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id),
  base_id      uuid not null references public.bases(id),
  user_id      uuid not null references public.users(id),
  kind         public.qualification_kind not null,
  descriptor   text not null,
  granted_at   timestamptz not null default now(),
  granted_by   uuid references public.users(id),
  notes        text,
  revoked_at   timestamptz
);

-- 4e. No-show + enrollment scaffolds
create table public.no_show (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id),
  user_id            uuid not null references public.users(id),
  scheduled_at       timestamptz not null,
  aircraft_id        uuid references public.aircraft(id),
  instructor_id      uuid references public.users(id),
  lesson_descriptor  text,
  recorded_by        uuid not null references public.users(id),
  recorded_at        timestamptz not null default now(),
  reason             text
);
create index no_show_user_scheduled_idx on public.no_show (user_id, scheduled_at);

create table public.student_course_enrollment (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id),
  user_id            uuid not null references public.users(id),
  course_descriptor  text not null,
  enrolled_at        timestamptz not null default now(),
  completed_at       timestamptz,
  withdrawn_at       timestamptz,
  notes              text,
  deleted_at         timestamptz
);

-- 4f. Multi-base join
create table public.user_base (
  user_id     uuid not null references public.users(id),
  base_id     uuid not null references public.bases(id),
  school_id   uuid not null references public.schools(id),
  created_at  timestamptz not null default now(),
  primary key (user_id, base_id)
);

-- ============================================================================
-- 5. Wire documents.aircraft_id FK (aircraft now exists)
-- ============================================================================
alter table public.documents
  add constraint documents_aircraft_id_fkey
  foreign key (aircraft_id) references public.aircraft(id);

-- ============================================================================
-- 6. Enable RLS and create policies
-- ============================================================================

alter table public.aircraft enable row level security;
alter table public.aircraft_engine enable row level security;
alter table public.aircraft_equipment enable row level security;
alter table public.flight_log_entry enable row level security;
alter table public.flight_log_entry_engine enable row level security;
alter table public.person_profile enable row level security;
alter table public.emergency_contact enable row level security;
alter table public.info_release_authorization enable row level security;
alter table public.instructor_experience enable row level security;
alter table public.person_hold enable row level security;
alter table public.currency_kind_config enable row level security;
alter table public.instructor_currency enable row level security;
alter table public.instructor_qualification enable row level security;
alter table public.no_show enable row level security;
alter table public.student_course_enrollment enable row level security;
alter table public.user_base enable row level security;

-- --- aircraft (base-scoped with admin cross-base branch) -----------------
create policy aircraft_select_own_school_base on public.aircraft
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy aircraft_modify_own_school_base on public.aircraft
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- --- aircraft_engine (inherits isolation via EXISTS against aircraft) ----
create policy aircraft_engine_select_own_school on public.aircraft_engine
  for select to authenticated
  using (aircraft_id in (select id from public.aircraft));
create policy aircraft_engine_modify_own_school on public.aircraft_engine
  for all to authenticated
  using (aircraft_id in (select id from public.aircraft))
  with check (aircraft_id in (select id from public.aircraft));

-- --- aircraft_equipment --------------------------------------------------
create policy aircraft_equipment_select_own_school on public.aircraft_equipment
  for select to authenticated
  using (aircraft_id in (select id from public.aircraft));
create policy aircraft_equipment_modify_own_school on public.aircraft_equipment
  for all to authenticated
  using (aircraft_id in (select id from public.aircraft))
  with check (aircraft_id in (select id from public.aircraft));

-- --- flight_log_entry (append-only, base-scoped) -------------------------
-- NOTE: NO update policy. UPDATE is denied by RLS. DELETE is blocked by
-- the hard-delete trigger attached in step 10 via audit.attach().
create policy flight_log_entry_select_own_school_base on public.flight_log_entry
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy flight_log_entry_insert_own_school_base on public.flight_log_entry
  for insert to authenticated
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- --- flight_log_entry_engine --------------------------------------------
create policy flight_log_entry_engine_select_own_school on public.flight_log_entry_engine
  for select to authenticated
  using (flight_log_entry_id in (select id from public.flight_log_entry));
create policy flight_log_entry_engine_insert_own_school on public.flight_log_entry_engine
  for insert to authenticated
  with check (flight_log_entry_id in (select id from public.flight_log_entry));

-- --- person_profile ------------------------------------------------------
create policy person_profile_select_own_school on public.person_profile
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy person_profile_modify_own_school on public.person_profile
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- emergency_contact ---------------------------------------------------
create policy emergency_contact_select_own_school on public.emergency_contact
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy emergency_contact_modify_own_school on public.emergency_contact
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- info_release_authorization ------------------------------------------
create policy info_release_authorization_select_own_school on public.info_release_authorization
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy info_release_authorization_modify_own_school on public.info_release_authorization
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- instructor_experience -----------------------------------------------
create policy instructor_experience_select_own_school on public.instructor_experience
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy instructor_experience_modify_own_school on public.instructor_experience
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- person_hold ---------------------------------------------------------
create policy person_hold_select_own_school on public.person_hold
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy person_hold_modify_own_school on public.person_hold
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- currency_kind_config (global, read-only to all authenticated) -------
create policy currency_kind_config_select_all on public.currency_kind_config
  for select to authenticated
  using (true);

-- --- instructor_currency -------------------------------------------------
create policy instructor_currency_select_own_school on public.instructor_currency
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy instructor_currency_modify_own_school on public.instructor_currency
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- instructor_qualification (base-scoped with admin branch) ------------
create policy instructor_qualification_select_own_school_base on public.instructor_qualification
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy instructor_qualification_modify_own_school_base on public.instructor_qualification
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- --- no_show -------------------------------------------------------------
create policy no_show_select_own_school on public.no_show
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy no_show_modify_own_school on public.no_show
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- student_course_enrollment -------------------------------------------
create policy student_course_enrollment_select_own_school on public.student_course_enrollment
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy student_course_enrollment_modify_own_school on public.student_course_enrollment
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- --- user_base -----------------------------------------------------------
create policy user_base_select_own_school on public.user_base
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy user_base_modify_own_school on public.user_base
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- ============================================================================
-- 7. currency_status SQL function (IPF-01)
-- ============================================================================
-- STABLE (not IMMUTABLE) because now() is transaction-scoped, not
-- value-stable across transactions. Canonical reference copy lives at
-- packages/db/src/functions/currency_status.sql.
create or replace function public.currency_status(
  p_expires_at timestamptz,
  p_warning_days integer
) returns text
language sql
stable
as $$
  select case
    when p_expires_at is null then 'unknown'
    when p_expires_at < now() then 'expired'
    when p_expires_at < now() + (p_warning_days || ' days')::interval then 'due_soon'
    else 'current'
  end;
$$;

grant execute on function public.currency_status(timestamptz, integer) to authenticated;

-- ============================================================================
-- 8. Derived-totals views (MUST be security_invoker = true — Pitfall 2)
-- ============================================================================

create view public.aircraft_current_totals
with (security_invoker = true)
as
select
  a.id as aircraft_id,
  a.school_id,
  a.base_id,
  coalesce(
    (select sum(coalesce(fl.hobbs_in, 0) - coalesce(fl.hobbs_out, 0))
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind in ('flight','correction')),
    0
  ) + coalesce(
    (select max(fl.hobbs_in)
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind = 'baseline'),
    0
  ) as current_hobbs,
  coalesce(
    (select sum(coalesce(fl.tach_in, 0) - coalesce(fl.tach_out, 0))
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind in ('flight','correction')),
    0
  ) + coalesce(
    (select max(fl.tach_in)
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id
        and fl.kind = 'baseline'),
    0
  ) as current_tach,
  coalesce(
    (select sum(fl.airframe_delta)
       from public.flight_log_entry fl
      where fl.aircraft_id = a.id),
    0
  ) as current_airframe,
  (select max(fl.flown_at)
     from public.flight_log_entry fl
    where fl.aircraft_id = a.id
      and fl.kind in ('flight','correction')) as last_flown_at
from public.aircraft a;

grant select on public.aircraft_current_totals to authenticated;

create view public.aircraft_engine_current_totals
with (security_invoker = true)
as
select
  ae.aircraft_id,
  a.school_id,
  a.base_id,
  ae.id as engine_id,
  ae.position,
  coalesce(sum(fle.delta_hours), 0) as current_engine_hours
from public.aircraft_engine ae
join public.aircraft a on a.id = ae.aircraft_id
left join public.flight_log_entry_engine fle on fle.engine_id = ae.id
group by ae.aircraft_id, a.school_id, a.base_id, ae.id, ae.position;

grant select on public.aircraft_engine_current_totals to authenticated;

-- ============================================================================
-- 9. Seed currency_kind_config defaults
-- ============================================================================
insert into public.currency_kind_config (kind, warning_days) values
  ('medical', 30),
  ('bfr',     60),
  ('cfi',     30),
  ('cfii',    30),
  ('mei',     30),
  ('ipc',     30)
on conflict (kind) do nothing;

-- ============================================================================
-- 10. Attach audit + hard-delete blocker triggers
-- ============================================================================
-- audit.attach() (defined in 0000_init.sql) adds BOTH an audit trigger
-- AND a BEFORE DELETE hard-delete blocker. Use it for any table whose
-- rows must never be hard-deleted.
select audit.attach('aircraft');
select audit.attach('aircraft_engine');
select audit.attach('flight_log_entry');
select audit.attach('flight_log_entry_engine');
select audit.attach('person_profile');
select audit.attach('person_hold');
select audit.attach('instructor_currency');
select audit.attach('instructor_qualification');
select audit.attach('no_show');
select audit.attach('student_course_enrollment');
select audit.attach('instructor_experience');
select audit.attach('user_base');

-- Audit-only tables (hard-delete permitted): emergency_contact,
-- info_release_authorization, aircraft_equipment, currency_kind_config.
-- These are not training-record-relevant so we attach only the audit
-- trigger without the block-delete trigger by calling fn_log_change
-- directly.
create trigger emergency_contact_audit
  after insert or update or delete on public.emergency_contact
  for each row execute function audit.fn_log_change();

create trigger info_release_authorization_audit
  after insert or update or delete on public.info_release_authorization
  for each row execute function audit.fn_log_change();

create trigger aircraft_equipment_audit
  after insert or update or delete on public.aircraft_equipment
  for each row execute function audit.fn_log_change();
