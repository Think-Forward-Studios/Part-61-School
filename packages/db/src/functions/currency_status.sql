-- Canonical reference copy of public.currency_status. The migration
-- 0002_phase2_personnel_aircraft.sql inlines this body verbatim.
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
