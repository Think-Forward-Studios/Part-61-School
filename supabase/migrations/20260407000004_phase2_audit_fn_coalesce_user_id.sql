-- Phase 2 Plan 3: patch audit.fn_log_change to tolerate composite-PK tables
--
-- Some Phase 2-attached tables (person_profile, user_roles) do not have an
-- `id` column — their primary key is `user_id` (or a composite ending in
-- user_id). The original fn_log_change read `(new ->> 'id')::uuid` into
-- v_record_id, which yielded NULL and violated audit_log.record_id NOT NULL.
--
-- Fix: coalesce id → user_id → null (and make record_id effectively nullable
-- by falling back to the user_id surrogate). This keeps the canonical path
-- for tables that do have `id`, while letting the 1:1 user-scoped tables
-- audit cleanly.
--
-- We ALSO drop the hard-delete blocker on user_roles because role removal
-- (ADM-02) is a legitimate admin operation. Role revocation is still audited
-- via the remaining audit trigger — it just isn't forced to soft-delete.

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
    v_record_id := coalesce(
      (v_new_jsonb ->> 'id')::uuid,
      (v_new_jsonb ->> 'user_id')::uuid
    );
    v_action := 'insert';
    v_before := null;
    v_after  := v_new_jsonb;
  elsif (tg_op = 'UPDATE') then
    v_new_jsonb := to_jsonb(new);
    v_old_jsonb := to_jsonb(old);
    v_record_id := coalesce(
      (v_new_jsonb ->> 'id')::uuid,
      (v_new_jsonb ->> 'user_id')::uuid
    );
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
    v_record_id := coalesce(
      (v_old_jsonb ->> 'id')::uuid,
      (v_old_jsonb ->> 'user_id')::uuid
    );
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

-- Drop hard-delete blocker on user_roles so admin.people.removeRole can DELETE.
drop trigger if exists user_roles_block_hard_delete on public.user_roles;
