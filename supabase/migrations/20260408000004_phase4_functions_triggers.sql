-- Phase 4 migration (part 3 of 4): CAMP SQL functions + business-logic triggers.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260408000004_phase4_functions_triggers.sql.
--
-- Layers on top of 0010 tables. Provides:
--   1. maintenance_next_due(item_id)         — status + next due (time/hours)
--   2. component_life_remaining(component_id) — hours/days remaining
--   3. recompute_maintenance_status(aircraft_id) — refresh every item,
--      auto-ground aircraft if anything overdue, auto-unground when clear
--   4. apply_ads_to_aircraft(aircraft_id)    — match AD catalog applicability
--   5. aircraft_next_grounding_forecast(aircraft_id) — soonest event
--   6. refresh_aircraft_downtime_forecast(aircraft_id) — upserts cache
--   7. Bridge triggers: aircraft_component / aircraft_ad_compliance →
--      maintenance_item (kind='component_life' / 'airworthiness_directive')
--   8. Flight log trigger: refresh maintenance status + consume overruns
--   9. Squawk RTS trigger: maybe clear grounded_at
--  10. maintenance_item refresh forecast trigger
--  11. maintenance_overrun kind CHECK trigger (§91.409(b): 100-hr only)
--
-- The real `is_airworthy_at` body replacement lives in 0012 so that file
-- can be rolled forward / back independently of these function + trigger
-- creations.

-- ============================================================================
-- 1. maintenance_next_due(p_item_id)
-- ============================================================================
-- Returns (next_due_at, next_due_hours, status). Reads the item row, the
-- aircraft_current_totals view, and computes next-due per clock type.
-- Status warn window: 10 hours OR 30 days (whichever is soonest).
--
-- Supports interval_rule shapes:
--   { "clock":"hobbs|tach|airframe", "hours": N }
--   { "clock":"calendar", "months": N }
--   { "clock":"combined", "hours": N, "months": N, "mode":"whichever_first" }
--   { "clock":"engine", "hours": N }  -- resolved via current_airframe as
--                                        approximation (no per-engine view)

create or replace function public.maintenance_next_due(
  p_item_id uuid
) returns table (
  next_due_at    timestamptz,
  next_due_hours numeric,
  status         public.maintenance_item_status
)
language plpgsql
stable
security invoker
as $$
declare
  v_item            public.maintenance_item%rowtype;
  v_clock           text;
  v_hours_rule      numeric;
  v_months_rule     integer;
  v_current_hours   numeric;
  v_last_hours      numeric;
  v_last_at         timestamptz;
  v_next_hours      numeric;
  v_next_at         timestamptz;
  v_hrs_status      public.maintenance_item_status;
  v_cal_status      public.maintenance_item_status;
  v_final_status    public.maintenance_item_status;
  v_airframe        numeric;
  v_hobbs           numeric;
  v_tach            numeric;
begin
  select * into v_item from public.maintenance_item where id = p_item_id;
  if not found then
    return;
  end if;

  v_clock       := coalesce(v_item.interval_rule ->> 'clock', 'calendar');
  v_hours_rule  := nullif(v_item.interval_rule ->> 'hours', '')::numeric;
  v_months_rule := nullif(v_item.interval_rule ->> 'months', '')::integer;

  select current_hobbs, current_tach, current_airframe
    into v_hobbs, v_tach, v_airframe
    from public.aircraft_current_totals
   where aircraft_id = v_item.aircraft_id;

  v_hobbs    := coalesce(v_hobbs, 0);
  v_tach     := coalesce(v_tach, 0);
  v_airframe := coalesce(v_airframe, 0);

  v_last_at := v_item.last_completed_at;

  -- Helper: pick current-hours by clock
  v_current_hours := case v_clock
    when 'hobbs'    then v_hobbs
    when 'tach'     then v_tach
    when 'airframe' then v_airframe
    when 'engine'   then v_airframe
    when 'combined' then v_hobbs
    else null
  end;

  -- Helper: pick last-completed hours by clock from snapshot jsonb
  if v_item.last_completed_hours is not null then
    v_last_hours := nullif(
      v_item.last_completed_hours ->> (
        case v_clock
          when 'combined' then 'hobbs'
          else v_clock
        end),
      '')::numeric;
  end if;
  v_last_hours := coalesce(v_last_hours, 0);

  -- Hours leg
  if v_hours_rule is not null and v_current_hours is not null then
    v_next_hours := v_last_hours + v_hours_rule;
    if v_current_hours >= v_next_hours then
      v_hrs_status := 'overdue';
    elsif v_current_hours >= v_next_hours - 10 then
      v_hrs_status := 'due_soon';
    else
      v_hrs_status := 'current';
    end if;
  end if;

  -- Calendar leg
  if v_months_rule is not null then
    v_next_at := coalesce(v_last_at, v_item.created_at) + (v_months_rule || ' months')::interval;
    if now() >= v_next_at then
      v_cal_status := 'overdue';
    elsif now() >= v_next_at - interval '30 days' then
      v_cal_status := 'due_soon';
    else
      v_cal_status := 'current';
    end if;
  end if;

  -- Combine: worst (most-due) wins
  v_final_status := case
    when v_hrs_status = 'overdue' or v_cal_status = 'overdue' then 'overdue'::public.maintenance_item_status
    when v_hrs_status = 'due_soon' or v_cal_status = 'due_soon' then 'due_soon'::public.maintenance_item_status
    when v_hrs_status is null and v_cal_status is null then 'current'::public.maintenance_item_status
    else 'current'::public.maintenance_item_status
  end;

  next_due_at    := v_next_at;
  next_due_hours := v_next_hours;
  status         := v_final_status;
  return next;
end;
$$;

grant execute on function public.maintenance_next_due(uuid) to authenticated;

-- ============================================================================
-- 2. component_life_remaining(p_component_id)
-- ============================================================================
create or replace function public.component_life_remaining(
  p_component_id uuid
) returns table (
  hours_remaining numeric,
  days_remaining  integer,
  status          public.component_status
)
language plpgsql
stable
security invoker
as $$
declare
  v_cmp             public.aircraft_component%rowtype;
  v_current_airframe numeric;
  v_installed_af    numeric;
  v_hrs_rem         numeric;
  v_days_rem        integer;
  v_status          public.component_status;
begin
  select * into v_cmp from public.aircraft_component where id = p_component_id;
  if not found then
    return;
  end if;

  -- Closed component: return null/-1 and status overdue-equivalent
  if v_cmp.removed_at is not null then
    hours_remaining := null;
    days_remaining  := null;
    status          := 'current'::public.component_status;
    return next;
    return;
  end if;

  select current_airframe into v_current_airframe
    from public.aircraft_current_totals
   where aircraft_id = v_cmp.aircraft_id;
  v_current_airframe := coalesce(v_current_airframe, 0);

  if v_cmp.installed_at_hours is not null then
    v_installed_af := nullif(v_cmp.installed_at_hours ->> 'airframe', '')::numeric;
  end if;
  v_installed_af := coalesce(v_installed_af, 0);

  if v_cmp.life_limit_hours is not null then
    v_hrs_rem := v_cmp.life_limit_hours - (v_current_airframe - v_installed_af);
  end if;

  if v_cmp.life_limit_months is not null and v_cmp.installed_at_date is not null then
    v_days_rem := (
      (v_cmp.installed_at_date + (v_cmp.life_limit_months || ' months')::interval)::date
      - current_date
    );
  end if;

  v_status := case
    when (v_hrs_rem is not null and v_hrs_rem <= 0)
      or (v_days_rem is not null and v_days_rem <= 0)
      then 'overdue'::public.component_status
    when (v_hrs_rem is not null and v_hrs_rem <= 10)
      or (v_days_rem is not null and v_days_rem <= 30)
      then 'due_soon'::public.component_status
    else 'current'::public.component_status
  end;

  hours_remaining := v_hrs_rem;
  days_remaining  := v_days_rem;
  status          := v_status;
  return next;
end;
$$;

grant execute on function public.component_life_remaining(uuid) to authenticated;

-- ============================================================================
-- 3. recompute_maintenance_status(p_aircraft_id)
-- ============================================================================
-- Serializes on the aircraft row (FOR UPDATE), refreshes every
-- non-deleted maintenance_item, updates aircraft.grounded_at as needed.
-- Also (re)computes component_life_remaining for every bridged component
-- item so the item status tracks the component.
create or replace function public.recompute_maintenance_status(
  p_aircraft_id uuid
) returns void
language plpgsql
security invoker
as $$
declare
  v_item       record;
  v_next       record;
  v_cmp_stat   record;
  v_any_ground boolean := false;
  v_cause_id   uuid;
  v_cause_ttl  text;
  v_active_overrun boolean;
begin
  -- Serializer: prevents concurrent recompute from two flight_log_entry inserts
  perform 1 from public.aircraft where id = p_aircraft_id for update;

  for v_item in
    select * from public.maintenance_item
     where aircraft_id = p_aircraft_id and deleted_at is null
  loop
    -- component-life items: derive status from component_life_remaining
    if v_item.kind = 'component_life' and v_item.component_id is not null then
      select * into v_cmp_stat
        from public.component_life_remaining(v_item.component_id);
      update public.maintenance_item
         set status         = coalesce(v_cmp_stat.status::text, 'current')::public.maintenance_item_status,
             next_due_hours = v_item.next_due_hours,
             updated_at     = now()
       where id = v_item.id;
    else
      select * into v_next from public.maintenance_next_due(v_item.id);
      update public.maintenance_item
         set status         = coalesce(v_next.status, 'current'::public.maintenance_item_status),
             next_due_at    = v_next.next_due_at,
             next_due_hours = v_next.next_due_hours,
             updated_at     = now()
       where id = v_item.id;
    end if;
  end loop;

  -- Find any overdue item that isn't masked by an active overrun
  for v_item in
    select mi.id, mi.title, mi.kind
      from public.maintenance_item mi
     where mi.aircraft_id = p_aircraft_id
       and mi.deleted_at is null
       and mi.status in ('overdue','grounding')
  loop
    v_active_overrun := false;
    if v_item.kind = 'hundred_hour_inspection' then
      select exists(
        select 1 from public.maintenance_overrun mo
         where mo.item_id = v_item.id
           and mo.revoked_at is null
           and mo.deleted_at is null
           and mo.expires_at > now()
           and mo.consumed_hours < mo.max_additional_hours
      ) into v_active_overrun;
    end if;

    if not v_active_overrun then
      v_any_ground := true;
      v_cause_id   := v_item.id;
      v_cause_ttl  := v_item.title;
      exit;
    end if;
  end loop;

  -- Any overdue AD compliance also grounds
  if not v_any_ground then
    if exists(
      select 1 from public.aircraft_ad_compliance
       where aircraft_id = p_aircraft_id
         and deleted_at is null
         and status in ('overdue','grounding')
    ) then
      v_any_ground := true;
      v_cause_ttl  := 'Airworthiness directive overdue';
    end if;
  end if;

  -- Apply / clear ground
  if v_any_ground then
    update public.aircraft
       set grounded_at         = coalesce(grounded_at, now()),
           grounded_reason     = coalesce(grounded_reason,
                                          'Maintenance: ' || v_cause_ttl || ' overdue'),
           grounded_by_item_id = coalesce(grounded_by_item_id, v_cause_id)
     where id = p_aircraft_id;
  else
    -- Clear only if the existing ground was caused by maintenance AND
    -- no open grounding squawk remains.
    update public.aircraft
       set grounded_at         = null,
           grounded_reason     = null,
           grounded_by_item_id = null
     where id = p_aircraft_id
       and grounded_by_item_id is not null
       and not exists(
         select 1 from public.aircraft_squawk
          where aircraft_id = p_aircraft_id
            and severity = 'grounding'
            and resolved_at is null
       );
  end if;
end;
$$;

grant execute on function public.recompute_maintenance_status(uuid) to authenticated;

-- ============================================================================
-- 4. apply_ads_to_aircraft(p_aircraft_id)
-- ============================================================================
create or replace function public.apply_ads_to_aircraft(
  p_aircraft_id uuid
) returns integer
language plpgsql
security invoker
as $$
declare
  v_ac   public.aircraft%rowtype;
  v_ad   record;
  v_count integer := 0;
  v_app  jsonb;
  v_match boolean;
begin
  select * into v_ac from public.aircraft where id = p_aircraft_id;
  if not found then
    return 0;
  end if;

  for v_ad in
    select * from public.airworthiness_directive
     where deleted_at is null
       and (school_id is null or school_id = v_ac.school_id)
  loop
    v_app := coalesce(v_ad.applicability, '{}'::jsonb);
    v_match := true;
    if v_app ? 'aircraft_make' and v_ac.make is distinct from (v_app ->> 'aircraft_make') then
      v_match := false;
    end if;
    if v_match and v_app ? 'aircraft_model' and v_ac.model is distinct from (v_app ->> 'aircraft_model') then
      v_match := false;
    end if;
    if v_match and v_app ? 'year_range' then
      if v_ac.year is null
         or v_ac.year < ((v_app -> 'year_range' ->> 0)::integer)
         or v_ac.year > ((v_app -> 'year_range' ->> 1)::integer) then
        v_match := false;
      end if;
    end if;

    if v_match then
      insert into public.aircraft_ad_compliance
        (school_id, base_id, aircraft_id, ad_id, applicable, status)
      values
        (v_ac.school_id, v_ac.base_id, v_ac.id, v_ad.id, true, 'current')
      on conflict do nothing;
      if found then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.apply_ads_to_aircraft(uuid) to authenticated;

-- ============================================================================
-- 5. aircraft_next_grounding_forecast(p_aircraft_id)
-- ============================================================================
create or replace function public.aircraft_next_grounding_forecast(
  p_aircraft_id uuid
) returns table (
  next_event_at    timestamptz,
  next_event_hours numeric,
  reason           text,
  confidence       text
)
language plpgsql
stable
security invoker
as $$
declare
  v_row record;
begin
  select mi.next_due_at, mi.next_due_hours, mi.title, 'high' as confidence
    into v_row
    from public.maintenance_item mi
   where mi.aircraft_id = p_aircraft_id
     and mi.deleted_at is null
     and mi.status in ('current','due_soon','overdue')
     and (mi.next_due_at is not null or mi.next_due_hours is not null)
   order by
     coalesce(mi.next_due_at, 'infinity'::timestamptz) asc,
     coalesce(mi.next_due_hours, 'infinity'::numeric) asc
   limit 1;

  if found then
    next_event_at    := v_row.next_due_at;
    next_event_hours := v_row.next_due_hours;
    reason           := v_row.title;
    confidence       := v_row.confidence;
    return next;
  end if;
end;
$$;

grant execute on function public.aircraft_next_grounding_forecast(uuid) to authenticated;

-- ============================================================================
-- 6. refresh_aircraft_downtime_forecast(p_aircraft_id)
-- ============================================================================
create or replace function public.refresh_aircraft_downtime_forecast(
  p_aircraft_id uuid
) returns void
language plpgsql
security invoker
as $$
declare
  v_row      record;
  v_school   uuid;
begin
  select school_id into v_school from public.aircraft where id = p_aircraft_id;
  if v_school is null then
    return;
  end if;

  select * into v_row from public.aircraft_next_grounding_forecast(p_aircraft_id);

  insert into public.aircraft_downtime_forecast
    (aircraft_id, school_id, next_event_at, next_event_hours, reason, confidence, refreshed_at)
  values
    (p_aircraft_id, v_school, v_row.next_event_at, v_row.next_event_hours,
     v_row.reason, v_row.confidence, now())
  on conflict (aircraft_id) do update
    set next_event_at    = excluded.next_event_at,
        next_event_hours = excluded.next_event_hours,
        reason           = excluded.reason,
        confidence       = excluded.confidence,
        refreshed_at     = now();
end;
$$;

grant execute on function public.refresh_aircraft_downtime_forecast(uuid) to authenticated;

-- ============================================================================
-- 7. Bridge triggers
-- ============================================================================

-- 7a. aircraft_component → maintenance_item (kind='component_life')
create or replace function public.fn_component_bridge_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_rule  jsonb;
begin
  if new.life_limit_hours is null and new.life_limit_months is null then
    return new;
  end if;

  v_title := coalesce(new.kind::text, 'component') || ' life limit';
  v_rule := jsonb_build_object('clock','airframe');
  if new.life_limit_hours is not null then
    v_rule := v_rule || jsonb_build_object('hours', new.life_limit_hours);
  end if;
  if new.life_limit_months is not null then
    v_rule := v_rule || jsonb_build_object('months', new.life_limit_months);
  end if;

  insert into public.maintenance_item
    (school_id, base_id, aircraft_id, component_id, kind, title, interval_rule,
     status, created_by)
  values
    (new.school_id, new.base_id, new.aircraft_id, new.id,
     'component_life', v_title, v_rule, 'current', new.created_by);

  return new;
end;
$$;

create trigger trg_component_bridge_maintenance
  after insert on public.aircraft_component
  for each row execute function public.fn_component_bridge_maintenance();

-- 7b. aircraft_component soft-close → soft-delete bridged item
create or replace function public.fn_component_soft_close_bridge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.removed_at is null and new.removed_at is not null then
    update public.maintenance_item
       set deleted_at = now()
     where component_id = new.id
       and deleted_at is null;
  end if;
  return new;
end;
$$;

create trigger trg_component_soft_close_bridge
  after update on public.aircraft_component
  for each row execute function public.fn_component_soft_close_bridge();

-- 7c. aircraft_ad_compliance → maintenance_item (kind='airworthiness_directive')
create or replace function public.fn_ad_bridge_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad_title text;
  v_rule     jsonb;
begin
  select 'AD ' || ad_number || ' ' || title into v_ad_title
    from public.airworthiness_directive where id = new.ad_id;

  v_rule := coalesce(new.recurrence_rule, jsonb_build_object('clock','calendar'));

  insert into public.maintenance_item
    (school_id, base_id, aircraft_id, ad_compliance_id, kind, title,
     interval_rule, status, next_due_at, next_due_hours, created_by)
  values
    (new.school_id, new.base_id, new.aircraft_id, new.id,
     'airworthiness_directive', coalesce(v_ad_title, 'Airworthiness Directive'),
     v_rule,
     case new.status
       when 'overdue' then 'overdue'::public.maintenance_item_status
       when 'grounding' then 'grounding'::public.maintenance_item_status
       when 'due_soon' then 'due_soon'::public.maintenance_item_status
       else 'current'::public.maintenance_item_status
     end,
     new.first_due_at, new.first_due_hours, new.created_by);

  return new;
end;
$$;

create trigger trg_ad_bridge_maintenance
  after insert on public.aircraft_ad_compliance
  for each row execute function public.fn_ad_bridge_maintenance();

-- 7d. ad compliance status update → refresh bridged item + recompute
create or replace function public.fn_ad_status_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.maintenance_item
     set status = case new.status
       when 'overdue' then 'overdue'::public.maintenance_item_status
       when 'grounding' then 'grounding'::public.maintenance_item_status
       when 'due_soon' then 'due_soon'::public.maintenance_item_status
       when 'not_applicable' then 'current'::public.maintenance_item_status
       else 'current'::public.maintenance_item_status
     end,
         updated_at = now()
   where ad_compliance_id = new.id
     and deleted_at is null;

  perform public.recompute_maintenance_status(new.aircraft_id);
  return new;
end;
$$;

create trigger trg_ad_status_refresh
  after update on public.aircraft_ad_compliance
  for each row execute function public.fn_ad_status_refresh();

-- ============================================================================
-- 8. Flight log refresh + overrun consume trigger
-- ============================================================================
create or replace function public.fn_flightlog_refresh_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overrun record;
  v_consumed numeric;
begin
  -- Recompute maintenance status (FOR UPDATE serializer inside)
  perform public.recompute_maintenance_status(new.aircraft_id);

  -- Recompute consumed_hours for every active overrun on this aircraft
  for v_overrun in
    select * from public.maintenance_overrun
     where aircraft_id = new.aircraft_id
       and revoked_at is null
       and deleted_at is null
  loop
    select coalesce(sum(coalesce(fl_in.hobbs_in, 0) - coalesce(fl_out.hobbs_out, 0)), 0)
      into v_consumed
      from public.flight_log_entry fl_in
      left join public.flight_log_entry fl_out on fl_out.id = fl_in.paired_entry_id
     where fl_in.aircraft_id = new.aircraft_id
       and fl_in.kind = 'flight_in'
       and fl_in.flown_at >= v_overrun.granted_at;

    update public.maintenance_overrun
       set consumed_hours = v_consumed,
           revoked_at     = case when v_consumed >= max_additional_hours then now() else null end,
           updated_at     = now()
     where id = v_overrun.id;
  end loop;

  -- Refresh downtime forecast cache
  perform public.refresh_aircraft_downtime_forecast(new.aircraft_id);

  return new;
end;
$$;

create trigger trg_flightlog_refresh_maintenance
  after insert or update on public.flight_log_entry
  for each row execute function public.fn_flightlog_refresh_maintenance();

-- ============================================================================
-- 9. Squawk RTS un-ground trigger
-- ============================================================================
create or replace function public.fn_squawk_rts_maybe_unground()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.resolved_at is null and new.resolved_at is not null)
     or (old.status is distinct from new.status and new.status = 'returned_to_service') then
    perform public.recompute_maintenance_status(new.aircraft_id);
  end if;
  return new;
end;
$$;

create trigger trg_squawk_rts_maybe_unground
  after update on public.aircraft_squawk
  for each row execute function public.fn_squawk_rts_maybe_unground();

-- ============================================================================
-- 10. maintenance_item → refresh forecast cache (NO cascade back to item)
-- ============================================================================
create or replace function public.fn_mi_refresh_forecast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_aircraft_downtime_forecast(new.aircraft_id);
  return new;
end;
$$;

create trigger trg_mi_refresh_forecast
  after insert or update on public.maintenance_item
  for each row execute function public.fn_mi_refresh_forecast();

-- ============================================================================
-- 11. maintenance_overrun kind CHECK trigger (§91.409(b): 100-hour only)
-- ============================================================================
create or replace function public.fn_maintenance_overrun_validate_kind()
returns trigger
language plpgsql
as $$
declare
  v_kind public.maintenance_item_kind;
begin
  select kind into v_kind from public.maintenance_item where id = new.item_id;
  if v_kind is null or v_kind <> 'hundred_hour_inspection' then
    raise exception
      '§91.409(b) overrun only applies to 100-hour inspections (got kind=%)', v_kind
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_maintenance_overrun_validate_kind
  before insert on public.maintenance_overrun
  for each row execute function public.fn_maintenance_overrun_validate_kind();
