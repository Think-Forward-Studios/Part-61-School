-- =============================================================================
-- Migration: 0044_admin_purge_user_function.sql
-- =============================================================================
-- Introduces admin.purge_user(user_id, school_id) — a SECURITY DEFINER
-- function that dynamically discovers every FK column pointing at
-- public.users.id via pg_catalog and either NULLs it (nullable) or
-- deletes the referencing row (NOT NULL). Iterates until no more
-- progress is made, so tables with multi-level FK dependencies clear
-- themselves in the right order without a hand-maintained list.
--
-- Called exclusively from admin.people.purge tRPC procedure, which
-- has already verified the caller's adminProcedure role + tenant
-- membership. The function re-verifies the target belongs to the
-- passed school_id as defense in depth.
--
-- Safety:
--   * The BEFORE DELETE hard-delete blocker is bypassed via the GUC
--     introduced in 0043. The guard is re-armed automatically at
--     transaction commit because we use set_config(..., true) (local).
--   * FK enforcement stays on. If we hit a FK violation from a table
--     the loop already visited, we skip it via SAVEPOINT and retry on
--     the next iteration; if it still blocks after 10 passes the
--     function raises and the whole transaction rolls back.
--   * No partial state possible: rollback wipes every change.
-- =============================================================================

-- Ensure the admin schema exists (the audit schema already does).
create schema if not exists admin;

create or replace function admin.purge_user(p_user_id uuid, p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  r           record;
  v_count     int;
  v_progress  boolean;
  v_attempt   int;
  v_cleared   jsonb := '{}'::jsonb;
  v_skipped   jsonb := '{}'::jsonb;
  v_email     text;
  v_key       text;
begin
  -- Confirm the target user belongs to this tenant.
  select email into v_email
    from public.users
   where id = p_user_id and school_id = p_school_id;
  if v_email is null then
    raise exception 'User % not found in school %', p_user_id, p_school_id
      using errcode = 'P0002';
  end if;

  -- Arm the hard-delete-trigger bypass for this transaction.
  perform set_config('app.allow_hard_delete', 'on', true);

  -- Iterate — each pass handles whatever is unblocked, skipping
  -- FK-violating tables for retry next pass.
  for v_attempt in 1..10 loop
    v_progress := false;

    for r in
      -- Every FK column in public.* that targets public.users.id.
      -- Excludes public.users itself (handled after the loop) so the
      -- user row is always the last thing deleted.
      select
        n.nspname                                                    as schema_name,
        cls.relname                                                  as table_name,
        a.attname                                                    as column_name,
        not a.attnotnull                                             as is_nullable
      from pg_constraint c
      join pg_class     cls on cls.oid = c.conrelid
      join pg_namespace n   on n.oid   = cls.relnamespace
      join pg_attribute a   on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype   = 'f'
        and c.confrelid = 'public.users'::regclass
        and n.nspname   = 'public'
        and cls.relname <> 'users'
        -- Single-column FKs only. Composite FKs to users aren't a
        -- pattern this codebase uses; if we ever add one, this
        -- function will need a join-key-aware delete.
        and array_length(c.conkey, 1) = 1
    loop
      v_key := r.table_name || '.' || r.column_name;
      begin
        if r.is_nullable then
          -- Actor / reference column — preserve the row, drop the
          -- pointer. Preserves OTHER users' history that happens to
          -- be stamped by the purged user.
          execute format(
            'update %I.%I set %I = null where %I = $1',
            r.schema_name, r.table_name, r.column_name, r.column_name
          ) using p_user_id;
        else
          -- NOT NULL FK — the row is owned by / meaningless without
          -- the user. Delete it.
          execute format(
            'delete from %I.%I where %I = $1',
            r.schema_name, r.table_name, r.column_name
          ) using p_user_id;
        end if;

        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_progress := true;
          v_cleared := v_cleared || jsonb_build_object(
            v_key,
            coalesce((v_cleared ->> v_key)::int, 0) + v_count
          );
          -- A successful pass clears any prior "skipped" entry for
          -- this key — it no longer blocks.
          v_skipped := v_skipped - v_key;
        end if;
      exception
        when foreign_key_violation then
          -- Dependent rows in another table still reference the rows
          -- we're trying to delete. Record the hint and retry next
          -- pass after that dependent table has been cleared.
          v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
        when others then
          -- Re-raise anything else — schema drift, permission issue,
          -- etc. should surface immediately.
          raise;
      end;
    end loop;

    -- No progress on this pass → nothing left to try.
    exit when not v_progress;
  end loop;

  -- Final: delete the user row itself. If anything still references
  -- it, this will fail and the whole transaction rolls back. The
  -- error message includes the skipped table list so the operator
  -- can see what blocked.
  delete from public.users
   where id = p_user_id and school_id = p_school_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Failed to delete public.users row. Remaining blockers: %',
      coalesce(v_skipped::text, '{}')
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'email',   v_email,
    'cleared', v_cleared,
    'skipped', v_skipped,
    'passes',  v_attempt
  );
end;
$$;

-- The function runs as its owner (postgres / supabase_admin). The
-- caller privilege check already happened at the tRPC adminProcedure
-- layer; we additionally revoke direct execute from public so the
-- function is only callable via the connection that runs our tRPC
-- backend (authenticated role).
revoke all on function admin.purge_user(uuid, uuid) from public;
grant execute on function admin.purge_user(uuid, uuid) to authenticated;
