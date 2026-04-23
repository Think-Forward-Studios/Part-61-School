-- =============================================================================
-- Migration: 0043_hard_delete_bypass_flag.sql
-- =============================================================================
-- Teaches public.fn_block_hard_delete() to honor a transaction-scoped
-- GUC so the admin.people.purge tRPC procedure has a narrow escape
-- hatch for accidental-account cleanup.
--
-- Default behaviour (trigger always fires) is UNCHANGED. The trigger
-- yields only when the session has set app.allow_hard_delete = 'on'
-- for the current transaction — which the purge procedure does via
-- SET LOCAL before issuing its DELETEs.
--
-- Why this design:
--   * FK constraints keep firing. If the user has any downstream
--     history (flight logs, training events, holds, audit trail) the
--     DELETE still rolls back on FK violation, and the operator gets
--     the clear 'has activity' error the UI already translates.
--   * The bypass is opt-in per transaction. It cannot be left on
--     across requests or leaked to application code — SET LOCAL
--     scopes to the current transaction and vanishes on commit/roll.
--   * No change to the enrollment of protected tables: everything
--     audit.attach() touches continues to raise on plain DELETE.
--
-- Alternatives considered and rejected:
--   * session_replication_role = 'replica': disables FK constraint
--     triggers as well, which would let us orphan history rows.
--     Unsafe.
--   * ALTER TABLE DISABLE TRIGGER ... ENABLE TRIGGER dance: requires
--     table ownership, is not transactional (persists across errors
--     if we forget to re-enable), and leaks into concurrent sessions.
-- =============================================================================

create or replace function public.fn_block_hard_delete()
returns trigger
language plpgsql
as $$
begin
  -- Escape hatch for the admin-driven purge flow. Second argument
  -- `true` tells current_setting to return null instead of raising
  -- when the GUC has never been set in this session.
  if current_setting('app.allow_hard_delete', true) = 'on' then
    return old;
  end if;

  raise exception
    'Hard delete is not permitted on table %. Use soft delete (set deleted_at).',
    tg_table_name
    using errcode = 'P0001';
end;
$$;
