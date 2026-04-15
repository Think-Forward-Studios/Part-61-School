-- Phase 8 migration (part 3): school_rate + user_session_activity.
--
-- Hand-authored; Drizzle schemas in packages/db/src/schema/school_rate.ts
-- and session_activity.ts mirror this for type inference only.
--
-- Tables:
--   1. public.school_rate            — REP-03/04 admin-configurable rates
--   2. public.user_session_activity  — MSG-03 active session tracking
--
-- Safety-relevance:
--   school_rate: YES — cost numbers users rely on. Soft-delete only,
--     audit-attached, hard-delete blocked.
--   user_session_activity: NO — transient session data, high-frequency
--     writes. No deleted_at, no audit trigger.

-- ============================================================================
-- 1. rate_kind enum
-- ============================================================================
create type public.rate_kind as enum (
  'aircraft_wet',
  'aircraft_dry',
  'instructor',
  'ground_instructor',
  'simulator',
  'surcharge_fixed'
);

-- ============================================================================
-- 2. school_rate
-- ============================================================================
create table public.school_rate (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools(id),
  kind                 public.rate_kind not null,
  aircraft_id          uuid,
  aircraft_make_model  text,
  instructor_id        uuid,
  amount_cents         integer not null check (amount_cents >= 0),
  currency_code        text not null default 'USD',
  effective_from       timestamptz not null default now(),
  effective_until      timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.users(id),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.users(id),
  deleted_at           timestamptz
);

create index school_rate_kind_idx
  on public.school_rate (school_id, kind)
  where deleted_at is null;

create index school_rate_aircraft_idx
  on public.school_rate (school_id, aircraft_id)
  where aircraft_id is not null and deleted_at is null;

create index school_rate_instructor_idx
  on public.school_rate (school_id, instructor_id)
  where instructor_id is not null and deleted_at is null;

alter table public.school_rate enable row level security;

create policy school_rate_select_own_school on public.school_rate
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy school_rate_admin_write on public.school_rate
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'active_role') = 'admin'
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'active_role') = 'admin'
  );

select audit.attach('school_rate');

-- ============================================================================
-- 3. user_session_activity
-- ============================================================================
create table public.user_session_activity (
  user_id               uuid primary key references public.users(id),
  school_id             uuid not null references public.schools(id),
  last_seen_at          timestamptz not null default now(),
  last_seen_ip          text,
  last_seen_user_agent  text,
  active_role           text,
  active_base_id        uuid references public.bases(id)
);

create index user_session_activity_school_last_seen_idx
  on public.user_session_activity (school_id, last_seen_at desc);

alter table public.user_session_activity enable row level security;

create policy user_session_activity_select_own_school on public.user_session_activity
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy user_session_activity_upsert_self on public.user_session_activity
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
