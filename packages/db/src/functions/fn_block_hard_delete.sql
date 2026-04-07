-- fn_block_hard_delete: BEFORE DELETE trigger that raises an exception.
--
-- Attached to every soft-delete-only table (documents, users, user_roles,
-- bases). Forces callers to use UPDATE ... SET deleted_at = now() instead
-- of DELETE. The audit trigger detects the deleted_at transition and
-- records it as action='soft_delete'.
--
-- errcode P0001 is the standard "raise_exception" SQLSTATE; tests can
-- match on the message string 'Hard delete is not permitted'.

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
