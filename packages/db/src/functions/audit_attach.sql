-- audit.attach: helper that attaches the audit + block-hard-delete
-- triggers to a table by name. Used by future migrations so each new
-- safety-relevant table only needs one line:
--
--   select audit.attach('aircraft');
--
-- The Phase 1 migration calls this for each Phase 1 protected table.

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
