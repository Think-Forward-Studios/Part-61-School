-- Phase 1 initial migration.
--
-- HAND-AUTHORED (not produced by `drizzle-kit generate`).
--
-- WHY HAND-AUTHORED: This migration was written for plan 01-02 in an
-- environment without `pnpm` / `drizzle-kit` installed (parallel
-- execution with plan 01-01 which owns the monorepo bootstrap). When
-- the toolchain is available (after 01-01 lands), a follow-up commit
-- in plan 01-03 should run `drizzle-kit generate --name init` against
-- the schema in packages/db/src/schema/ and DIFF the result against
-- this file. They should be byte-equivalent modulo whitespace; any
-- divergence is a bug in this file or a Drizzle helper change worth
-- understanding.
--
-- Order of operations:
--   1. Create enums
--   2. Create tables (schools → bases → users → user_roles → documents → audit_log)
--   3. Create indexes
--   4. Enable RLS on every business table
--   5. Create RLS policies (one per for-clause per table)
--   6. Create audit schema, audit.fn_log_change, public.fn_block_hard_delete,
--      audit.attach helper, public.custom_access_token_hook
--   7. Attach audit + block-hard-delete triggers to protected tables
--   8. Revoke direct DML on audit_log

-- ============================================================================
-- 1. Enums
-- ============================================================================
create type public.role as enum ('student', 'instructor', 'mechanic', 'admin');
create type public.mechanic_authority as enum ('none', 'a_and_p', 'ia');
create type public.document_kind as enum ('medical', 'pilot_license', 'government_id', 'insurance');
create type public.audit_action as enum ('insert', 'update', 'soft_delete');

-- ============================================================================
-- 2. Tables
-- ============================================================================

create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.bases (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id),
  name        text not null,
  timezone    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.users (
  id          uuid primary key,
  school_id   uuid not null references public.schools(id),
  email       text not null unique,
  full_name   text,
  timezone    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.user_roles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id),
  role                public.role not null,
  mechanic_authority  public.mechanic_authority not null default 'none',
  is_default          boolean not null default false,
  created_at          timestamptz not null default now()
);
create unique index user_roles_user_role_unique on public.user_roles (user_id, role);

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id),
  user_id       uuid not null references public.users(id),
  kind          public.document_kind not null,
  storage_path  text not null,
  mime_type     text not null,
  byte_size     integer not null,
  expires_at    timestamptz,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   uuid not null references public.users(id),
  deleted_at    timestamptz
);

create table public.audit_log (
  id           bigserial primary key,
  school_id    uuid,
  user_id      uuid,
  actor_kind   text not null default 'user',
  actor_role   text,
  table_name   text not null,
  record_id    uuid not null,
  action       public.audit_action not null,
  before       jsonb,
  after        jsonb,
  at           timestamptz not null default now()
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_user_at_idx     on public.audit_log (user_id, at);
create index audit_log_school_at_idx   on public.audit_log (school_id, at);

-- ============================================================================
-- 3. Enable Row Level Security
-- ============================================================================
alter table public.schools     enable row level security;
alter table public.bases       enable row level security;
alter table public.users       enable row level security;
alter table public.user_roles  enable row level security;
alter table public.documents   enable row level security;
alter table public.audit_log   enable row level security;

-- ============================================================================
-- 4. RLS Policies
-- ============================================================================

-- schools: see/update own row only
create policy schools_select_own on public.schools
  for select to authenticated
  using (id = (auth.jwt() ->> 'school_id')::uuid);
create policy schools_update_own on public.schools
  for update to authenticated
  using      (id = (auth.jwt() ->> 'school_id')::uuid)
  with check (id = (auth.jwt() ->> 'school_id')::uuid);

-- bases: full read/insert/update scoped to school_id
create policy bases_select_own_school on public.bases
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy bases_insert_own_school on public.bases
  for insert to authenticated
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy bases_update_own_school on public.bases
  for update to authenticated
  using      (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- users
create policy users_select_own_school on public.users
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy users_update_own_school on public.users
  for update to authenticated
  using      (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- user_roles (joined via users.school_id)
create policy user_roles_select_own_school on public.user_roles
  for select to authenticated
  using (user_id in (
    select id from public.users where school_id = (auth.jwt() ->> 'school_id')::uuid
  ));
create policy user_roles_modify_own_school on public.user_roles
  for all to authenticated
  using      (user_id in (
    select id from public.users where school_id = (auth.jwt() ->> 'school_id')::uuid
  ))
  with check (user_id in (
    select id from public.users where school_id = (auth.jwt() ->> 'school_id')::uuid
  ));

-- documents
create policy documents_select_own_school on public.documents
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy documents_insert_own_school on public.documents
  for insert to authenticated
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy documents_update_own_school on public.documents
  for update to authenticated
  using      (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- audit_log (read own school; INSERT blocked at policy level — trigger
-- bypasses via SECURITY DEFINER; UPDATE/DELETE revoked below)
create policy audit_log_select_own_school on public.audit_log
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy audit_log_insert_blocked on public.audit_log
  for insert to authenticated
  with check (false);

-- ============================================================================
-- 5. audit schema + trigger function
-- ============================================================================
create schema if not exists audit;

create or replace function audit.fn_log_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_id  uuid := nullif(current_setting('app.school_id',  true), '')::uuid;
  v_user_id    uuid := nullif(current_setting('app.user_id',    true), '')::uuid;
  v_role       text := nullif(current_setting('app.active_role', true), '');
  v_actor_kind text := coalesce(nullif(current_setting('app.actor_kind', true), ''), 'user');
  v_record_id  uuid;
  v_action     public.audit_action;
  v_before     jsonb;
  v_after      jsonb;
  v_old_jsonb  jsonb;
  v_new_jsonb  jsonb;
begin
  if (tg_op = 'INSERT') then
    v_new_jsonb := to_jsonb(new);
    v_record_id := (v_new_jsonb ->> 'id')::uuid;
    v_action := 'insert';
    v_before := null;
    v_after  := v_new_jsonb;
  elsif (tg_op = 'UPDATE') then
    v_new_jsonb := to_jsonb(new);
    v_old_jsonb := to_jsonb(old);
    v_record_id := (v_new_jsonb ->> 'id')::uuid;
    if (v_old_jsonb ? 'deleted_at')
       and (v_old_jsonb ->> 'deleted_at') is null
       and (v_new_jsonb ->> 'deleted_at') is not null then
      v_action := 'soft_delete';
    else
      v_action := 'update';
    end if;
    v_before := v_old_jsonb;
    v_after  := v_new_jsonb;
  elsif (tg_op = 'DELETE') then
    v_old_jsonb := to_jsonb(old);
    v_record_id := (v_old_jsonb ->> 'id')::uuid;
    v_action := 'soft_delete';
    v_before := v_old_jsonb;
    v_after  := null;
  end if;

  insert into public.audit_log
    (school_id, user_id, actor_kind, actor_role,
     table_name, record_id, action, before, after)
  values (
    coalesce(
      v_school_id,
      (v_after  ->> 'school_id')::uuid,
      (v_before ->> 'school_id')::uuid
    ),
    v_user_id,
    v_actor_kind,
    v_role,
    tg_table_name,
    v_record_id,
    v_action,
    v_before,
    v_after
  );

  return coalesce(new, old);
end;
$$;

-- ============================================================================
-- 6. Hard-delete block + audit attach helper
-- ============================================================================
create or replace function public.fn_block_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Hard delete is not permitted on table %. Use soft delete (set deleted_at).',
    tg_table_name
    using errcode = 'P0001';
end;
$$;

create or replace function audit.attach(p_table text)
returns void
language plpgsql
as $$
begin
  execute format(
    'drop trigger if exists %I_audit on public.%I',
    p_table, p_table);
  execute format(
    'create trigger %I_audit
       after insert or update or delete on public.%I
       for each row execute function audit.fn_log_change()',
    p_table, p_table);

  execute format(
    'drop trigger if exists %I_block_hard_delete on public.%I',
    p_table, p_table);
  execute format(
    'create trigger %I_block_hard_delete
       before delete on public.%I
       for each row execute function public.fn_block_hard_delete()',
    p_table, p_table);
end;
$$;

-- ============================================================================
-- 7. Custom access token hook (Supabase Auth)
-- ============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims        jsonb;
  v_user_id     uuid;
  v_school_id   uuid;
  v_roles       text[];
  v_active_role text;
begin
  v_user_id := (event ->> 'user_id')::uuid;

  select u.school_id
    into v_school_id
    from public.users u
   where u.id = v_user_id;

  select coalesce(array_agg(ur.role::text), array[]::text[])
    into v_roles
    from public.user_roles ur
   where ur.user_id = v_user_id;

  select ur.role::text
    into v_active_role
    from public.user_roles ur
   where ur.user_id = v_user_id
     and ur.is_default = true
   limit 1;

  if v_active_role is null and array_length(v_roles, 1) > 0 then
    v_active_role := v_roles[1];
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if v_school_id is not null then
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id));
  end if;
  claims := jsonb_set(claims, '{roles}', to_jsonb(v_roles));
  if v_active_role is not null then
    claims := jsonb_set(claims, '{active_role}', to_jsonb(v_active_role));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ============================================================================
-- 8. Attach audit + block-hard-delete triggers to protected tables
-- ============================================================================
select audit.attach('bases');
select audit.attach('users');
select audit.attach('user_roles');
select audit.attach('documents');

-- ============================================================================
-- 9. Lock down audit_log writes (UPDATE/DELETE revoked from non-superusers)
-- ============================================================================
revoke update, delete on public.audit_log from public;
revoke update, delete on public.audit_log from authenticated;
revoke update, delete on public.audit_log from anon;
