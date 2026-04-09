-- Phase 4 migration (part 4 of 4): replace is_airworthy_at body.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260408000005_phase4_replace_is_airworthy_at.sql.
--
-- SIGNATURE IS FROZEN: public.is_airworthy_at(p_aircraft_id uuid, p_at timestamptz)
-- returns boolean. Every Phase 3 caller must keep working.
--
-- Short-circuit rules, evaluated in order:
--   1. aircraft.deleted_at IS NOT NULL                         -> false
--   2. aircraft.grounded_at <= p_at                            -> false
--   3. Any aircraft_squawk with severity='grounding' open at p_at -> false
--   4. Any maintenance_item with status in ('overdue','grounding')
--      at p_at AND no active §91.409(b) overrun masking it     -> false
--   5. Any aircraft_ad_compliance with status in ('overdue','grounding')
--      AND first_due_at <= p_at                                -> false
--   6. Any aircraft_component (installed) with life remaining <= 0 -> false
--   otherwise -> true.

create or replace function public.is_airworthy_at(
  p_aircraft_id uuid,
  p_at          timestamptz
) returns boolean
language plpgsql
stable
security invoker
as $$
declare
  v_deleted    boolean;
  v_grounded   timestamptz;
  v_has_sqk    boolean;
  v_has_item   boolean;
  v_has_ad     boolean;
  v_has_cmp    boolean;
begin
  select deleted_at is not null, grounded_at
    into v_deleted, v_grounded
    from public.aircraft
   where id = p_aircraft_id;

  if v_deleted is null then
    -- no such aircraft
    return false;
  end if;

  if v_deleted then
    return false;
  end if;

  if v_grounded is not null and v_grounded <= p_at then
    return false;
  end if;

  -- Open grounding squawk
  select exists(
    select 1 from public.aircraft_squawk
     where aircraft_id = p_aircraft_id
       and severity = 'grounding'
       and opened_at <= p_at
       and (resolved_at is null or resolved_at > p_at)
  ) into v_has_sqk;
  if v_has_sqk then
    return false;
  end if;

  -- Overdue maintenance item not masked by active §91.409(b) overrun
  select exists(
    select 1
      from public.maintenance_item mi
     where mi.aircraft_id = p_aircraft_id
       and mi.deleted_at is null
       and mi.status in ('overdue','grounding')
       and (mi.last_completed_at is null or mi.last_completed_at <= p_at)
       and not (
         mi.kind = 'hundred_hour_inspection'
         and exists(
           select 1 from public.maintenance_overrun mo
            where mo.item_id = mi.id
              and mo.deleted_at is null
              and mo.granted_at <= p_at
              and (mo.revoked_at is null or mo.revoked_at > p_at)
              and mo.expires_at > p_at
              and mo.consumed_hours < mo.max_additional_hours
         )
       )
  ) into v_has_item;
  if v_has_item then
    return false;
  end if;

  -- Overdue AD compliance
  select exists(
    select 1 from public.aircraft_ad_compliance
     where aircraft_id = p_aircraft_id
       and deleted_at is null
       and status in ('overdue','grounding')
       and (first_due_at is null or first_due_at <= p_at)
  ) into v_has_ad;
  if v_has_ad then
    return false;
  end if;

  -- Any installed component with life remaining <= 0
  select exists(
    select 1
      from public.aircraft_component c
     where c.aircraft_id = p_aircraft_id
       and c.deleted_at is null
       and c.removed_at is null
       and (
         coalesce((select hours_remaining from public.component_life_remaining(c.id)), 1) <= 0
         or coalesce((select days_remaining from public.component_life_remaining(c.id)), 1) <= 0
       )
  ) into v_has_cmp;
  if v_has_cmp then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.is_airworthy_at(uuid, timestamptz) to authenticated;
