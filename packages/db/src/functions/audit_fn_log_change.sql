-- audit.fn_log_change: append-only audit trigger function (FND-03)
--
-- Attached AFTER INSERT OR UPDATE OR DELETE to every safety-relevant
-- table. Reads tenant context from app.* GUCs (set by withSchoolContext)
-- and writes a single row to public.audit_log.
--
-- SECURITY DEFINER so it can write to audit_log even though
-- INSERT/UPDATE/DELETE are revoked from authenticated/anon/public.
--
-- Soft-delete detection: an UPDATE that transitions deleted_at from NULL
-- to non-NULL is recorded as action='soft_delete'. All other UPDATEs
-- record as 'update'. INSERTs record as 'insert'. Hard DELETEs
-- (which should be impossible on protected tables thanks to
-- fn_block_hard_delete) are recorded as 'soft_delete' as a safety net.
--
-- actor_kind defaults to 'user' but can be overridden by setting
-- app.actor_kind to 'system' or 'trigger_seed' before the mutation
-- (used by seed scripts and background jobs).

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
  v_action     audit_action;
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
    -- Should never happen on protected tables (fn_block_hard_delete
    -- raises BEFORE DELETE), but record it as soft_delete defensively.
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
