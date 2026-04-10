-- Phase 7 migration: geofence table + bases lat/lon columns (ADS-01, ADS-05).
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260410000000_phase7_geofence.sql.
--
-- Creates:
--   1. bases.latitude + bases.longitude columns (map centering)
--   2. geofence_kind enum (polygon | circle)
--   3. geofence table with RLS, audit trigger, hard-delete blocker
--   4. Partial unique index: one active geofence per base

-- ============================================================================
-- 1. Bases: add lat/lon columns
-- ============================================================================
alter table public.bases
  add column latitude double precision,
  add column longitude double precision;

-- ============================================================================
-- 2. Geofence kind enum
-- ============================================================================
create type public.geofence_kind as enum ('polygon', 'circle');

-- ============================================================================
-- 3. Geofence table
-- ============================================================================
create table public.geofence (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id),
  base_id       uuid not null references public.bases(id),
  kind          public.geofence_kind not null,
  geometry      jsonb not null,
  radius_nm     numeric,
  label         text not null default 'Training Area',
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- One active (non-deleted) geofence per base
create unique index geofence_active_per_base
  on public.geofence (base_id)
  where deleted_at is null;

-- ============================================================================
-- 4. RLS
-- ============================================================================
alter table public.geofence enable row level security;

-- All authenticated users in the school can read geofences
create policy geofence_select_own_school on public.geofence
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
  );

-- Only admin can write (insert / update / delete)
create policy geofence_modify_admin_only on public.geofence
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'active_role') = 'admin'
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'active_role') = 'admin'
  );

-- ============================================================================
-- 5. Audit trigger + hard-delete blocker
-- ============================================================================
select audit.attach('geofence');

create trigger trg_geofence_no_hard_delete
  before delete on public.geofence
  for each row execute function public.fn_block_hard_delete();
