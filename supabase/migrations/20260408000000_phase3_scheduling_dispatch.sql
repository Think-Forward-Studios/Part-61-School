-- Phase 3 migration (part 1 of 2): scheduling + dispatch schema.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260408000000_phase3_scheduling_dispatch.sql.
--
-- This file creates everything EXCEPT the aircraft_current_totals view
-- update (which references the new flight_log_entry_kind values
-- 'flight_out' / 'flight_in'). Postgres' ALTER TYPE ADD VALUE has a
-- "cannot use new value in same transaction" caveat, so the view
-- replacement lives in 0008_phase3_view_update.sql which runs in its
-- own transaction after this one commits.
--
-- Order of operations:
--   1. btree_gist extension
--   2. New enums (Phase 3)
--   3. ALTER TYPE flight_log_entry_kind ADD VALUE flight_out / flight_in
--   4. ALTER TABLE aircraft ADD grounded_at; flight_log_entry ADD paired_entry_id
--   5. New tables (room, aircraft_squawk, schedule_block(+instance),
--      fif_notice, fif_acknowledgement, passenger_manifest,
--      person_unavailability, reservation)
--   6. Four partial EXCLUDE USING gist constraints on reservation
--   7. Functions: is_airworthy_at(), free_busy()
--   8. RLS enable + policies
--   9. Shadow-row trigger on person_unavailability
--  10. Block-inflate trigger on reservation
--  11. audit.attach() + audit-only triggers

-- ============================================================================
-- 1. btree_gist (required for `=` operator on uuid in gist exclusion)
-- ============================================================================
create extension if not exists btree_gist;

-- ============================================================================
-- 2. New Phase 3 enums
-- ============================================================================
create type public.reservation_activity_type as enum
  ('flight','simulator','oral','academic','misc');

create type public.reservation_status as enum
  ('requested','approved','dispatched','flown','pending_sign_off',
   'closed','cancelled','no_show','scrubbed');

create type public.close_out_reason as enum
  ('cancelled_free','cancelled_late','no_show',
   'scrubbed_weather','scrubbed_maintenance','scrubbed_other');

create type public.squawk_severity as enum ('info','watch','grounding');

create type public.fif_severity as enum ('info','important','critical');

create type public.manifest_position as enum ('pic','sic','passenger');

create type public.block_kind as enum
  ('instructor_block','aircraft_block','room_block','combo');

create type public.unavailability_kind as enum
  ('vacation','sick','personal','training','other');

-- ============================================================================
-- 3. Extend Phase 2 flight_log_entry_kind enum
-- ============================================================================
-- These values cannot be REFERENCED in the same transaction (PG caveat),
-- but they can be ADDED here and used in 0008_phase3_view_update.sql.
alter type public.flight_log_entry_kind add value if not exists 'flight_out';
alter type public.flight_log_entry_kind add value if not exists 'flight_in';

-- ============================================================================
-- 4. Extend existing tables
-- ============================================================================
alter table public.aircraft
  add column grounded_at timestamptz;

alter table public.flight_log_entry
  add column paired_entry_id uuid references public.flight_log_entry(id);

-- ============================================================================
-- 5. New tables
-- ============================================================================

-- 5a. room (SCH-18)
create table public.room (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id),
  base_id     uuid not null references public.bases(id),
  name        text not null,
  capacity    integer,
  features    text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 5b. aircraft_squawk (FLT-04)
create table public.aircraft_squawk (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id),
  base_id           uuid not null references public.bases(id),
  aircraft_id       uuid not null references public.aircraft(id),
  severity          public.squawk_severity not null,
  title             text not null,
  description       text,
  opened_at         timestamptz not null default now(),
  opened_by         uuid references public.users(id),
  resolved_at       timestamptz,
  resolved_by       uuid references public.users(id),
  resolution_notes  text,
  deleted_at        timestamptz
);
create index aircraft_squawk_open_grounding_idx
  on public.aircraft_squawk (aircraft_id)
  where severity = 'grounding' and resolved_at is null;

-- 5c. schedule_block + schedule_block_instance (SCH-16)
create table public.schedule_block (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id),
  base_id         uuid not null references public.bases(id),
  kind            public.block_kind not null,
  instructor_id   uuid references public.users(id),
  aircraft_id     uuid references public.aircraft(id),
  room_id         uuid references public.room(id),
  recurrence_rule jsonb,
  valid_from      timestamptz,
  valid_until     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  deleted_at      timestamptz
);

create table public.schedule_block_instance (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.schedule_block(id),
  school_id   uuid not null references public.schools(id),
  base_id     uuid not null references public.bases(id),
  time_range  tstzrange not null,
  created_at  timestamptz not null default now()
);

-- 5d. FIF (FTR-07)
create table public.fif_notice (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id),
  base_id      uuid references public.bases(id),
  title        text not null,
  body         text not null,
  severity     public.fif_severity not null default 'info',
  posted_at    timestamptz not null default now(),
  posted_by    uuid references public.users(id),
  effective_at timestamptz not null default now(),
  expires_at   timestamptz,
  deleted_at   timestamptz
);

create table public.fif_acknowledgement (
  id              uuid primary key default gen_random_uuid(),
  notice_id       uuid not null references public.fif_notice(id),
  user_id         uuid not null references public.users(id),
  school_id       uuid not null references public.schools(id),
  acknowledged_at timestamptz not null default now()
);
create unique index fif_ack_notice_user_unique
  on public.fif_acknowledgement (notice_id, user_id);

-- 5e. person_unavailability (SCH-15)
create table public.person_unavailability (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id),
  user_id                uuid not null references public.users(id),
  time_range             tstzrange not null,
  kind                   public.unavailability_kind not null,
  reason                 text,
  shadow_reservation_id  uuid,
  created_at             timestamptz not null default now(),
  created_by             uuid references public.users(id)
);

-- 5f. reservation (SCH-01) — must come AFTER room because of room_id FK
create table public.reservation (
  id                        uuid primary key default gen_random_uuid(),
  school_id                 uuid not null references public.schools(id),
  base_id                   uuid not null references public.bases(id),
  activity_type             public.reservation_activity_type not null,
  time_range                tstzrange not null,
  status                    public.reservation_status not null default 'requested',
  aircraft_id               uuid references public.aircraft(id),
  instructor_id             uuid references public.users(id),
  student_id                uuid references public.users(id),
  room_id                   uuid references public.room(id),
  series_id                 uuid,
  parent_block_id           uuid references public.schedule_block_instance(id),
  notes                     text,
  requested_at              timestamptz not null default now(),
  requested_by              uuid references public.users(id),
  approved_at               timestamptz,
  approved_by               uuid references public.users(id),
  dispatched_at             timestamptz,
  dispatched_by             uuid references public.users(id),
  closed_at                 timestamptz,
  closed_by                 uuid references public.users(id),
  close_out_reason          public.close_out_reason,
  student_checked_in_at     timestamptz,
  student_checked_in_by     uuid references public.users(id),
  instructor_authorized_at  timestamptz,
  instructor_authorized_by  uuid references public.users(id),
  route_string              text,
  ete_minutes               integer,
  stops                     text[],
  fuel_stops                text[],
  alternate                 text,
  deleted_at                timestamptz,
  -- Half-open bound enforcement: lower inclusive, upper exclusive.
  constraint reservation_time_range_half_open
    check (lower_inc(time_range) and not upper_inc(time_range))
);
create index reservation_school_status_idx
  on public.reservation (school_id, status)
  where deleted_at is null;
create index reservation_aircraft_idx
  on public.reservation (aircraft_id)
  where aircraft_id is not null;

-- 5g. passenger_manifest (FTR-06) — references reservation
create table public.passenger_manifest (
  id                       uuid primary key default gen_random_uuid(),
  reservation_id           uuid not null references public.reservation(id),
  position                 public.manifest_position not null,
  name                     text not null,
  weight_lbs               numeric(6,1),
  emergency_contact_name   text,
  emergency_contact_phone  text,
  notes                    text,
  created_at               timestamptz not null default now()
);

-- ============================================================================
-- 6. Four partial EXCLUDE USING gist constraints (SCH-02)
-- ============================================================================
-- These prevent overlapping `time_range` values for the same resource
-- when the reservation is in an active state. Pending requests and
-- cancelled rows are excluded by the WHERE so they can overlap freely.
alter table public.reservation
  add constraint reservation_aircraft_no_overlap
  exclude using gist (
    aircraft_id with =,
    time_range with &&
  ) where (aircraft_id is not null and status in ('approved','dispatched','flown'));

alter table public.reservation
  add constraint reservation_instructor_no_overlap
  exclude using gist (
    instructor_id with =,
    time_range with &&
  ) where (instructor_id is not null and status in ('approved','dispatched','flown'));

alter table public.reservation
  add constraint reservation_student_no_overlap
  exclude using gist (
    student_id with =,
    time_range with &&
  ) where (student_id is not null and status in ('approved','dispatched','flown'));

alter table public.reservation
  add constraint reservation_room_no_overlap
  exclude using gist (
    room_id with =,
    time_range with &&
  ) where (room_id is not null and status in ('approved','dispatched','flown'));

-- ============================================================================
-- 7. SQL functions
-- ============================================================================

-- 7a. is_airworthy_at (SCH-04, FLT-04) — Phase 3 stub. Phase 4 replaces
-- the body without changing the signature.
create or replace function public.is_airworthy_at(
  p_aircraft_id uuid,
  p_at          timestamptz
) returns boolean
language sql
stable
security invoker
as $$
  select
    case
      when (select deleted_at is not null
              from public.aircraft
             where id = p_aircraft_id) then false
      when (select grounded_at is not null and grounded_at <= p_at
              from public.aircraft
             where id = p_aircraft_id) then false
      when exists (
        select 1
          from public.aircraft_squawk
         where aircraft_id = p_aircraft_id
           and severity = 'grounding'
           and opened_at <= p_at
           and (resolved_at is null or resolved_at > p_at)
      ) then false
      else true
    end
$$;

grant execute on function public.is_airworthy_at(uuid, timestamptz)
  to authenticated;

-- 7b. free_busy (privacy-first student schedule view)
create or replace function public.free_busy(
  p_resource_type text,
  p_resource_id   uuid,
  p_from          timestamptz,
  p_to            timestamptz
) returns setof tstzrange
language sql
stable
security invoker
as $$
  select r.time_range
    from public.reservation r
   where r.status in ('approved','dispatched','flown')
     and r.deleted_at is null
     and r.time_range && tstzrange(p_from, p_to, '[)')
     and case p_resource_type
           when 'aircraft'   then r.aircraft_id   = p_resource_id
           when 'instructor' then r.instructor_id = p_resource_id
           when 'student'    then r.student_id    = p_resource_id
           when 'room'       then r.room_id       = p_resource_id
           else false
         end
$$;

grant execute on function public.free_busy(text, uuid, timestamptz, timestamptz)
  to authenticated;

-- ============================================================================
-- 8. RLS enable + policies
-- ============================================================================
alter table public.room                    enable row level security;
alter table public.aircraft_squawk         enable row level security;
alter table public.schedule_block          enable row level security;
alter table public.schedule_block_instance enable row level security;
alter table public.fif_notice              enable row level security;
alter table public.fif_acknowledgement     enable row level security;
alter table public.person_unavailability   enable row level security;
alter table public.reservation             enable row level security;
alter table public.passenger_manifest      enable row level security;

-- room: base-scoped with admin cross-base branch
create policy room_select_own_school_base on public.room
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy room_modify_own_school_base on public.room
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- aircraft_squawk: same base-scoped pattern
create policy aircraft_squawk_select_own_school_base on public.aircraft_squawk
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy aircraft_squawk_modify_own_school_base on public.aircraft_squawk
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- schedule_block
create policy schedule_block_select_own_school_base on public.schedule_block
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy schedule_block_modify_own_school_base on public.schedule_block
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- schedule_block_instance: inherits via parent block
create policy schedule_block_instance_select_own_school
  on public.schedule_block_instance
  for select to authenticated
  using (block_id in (select id from public.schedule_block));
create policy schedule_block_instance_modify_own_school
  on public.schedule_block_instance
  for all to authenticated
  using (block_id in (select id from public.schedule_block))
  with check (block_id in (select id from public.schedule_block));

-- fif_notice
create policy fif_notice_select_own_school on public.fif_notice
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy fif_notice_modify_own_school on public.fif_notice
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- fif_acknowledgement
create policy fif_ack_select_own_school on public.fif_acknowledgement
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy fif_ack_modify_own_school on public.fif_acknowledgement
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- person_unavailability
create policy person_unavailability_select_own_school
  on public.person_unavailability
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy person_unavailability_modify_own_school
  on public.person_unavailability
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- reservation
create policy reservation_select_own_school_base on public.reservation
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );
create policy reservation_modify_own_school_base on public.reservation
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
    )
  );

-- passenger_manifest: inherits via reservation
create policy passenger_manifest_select_own_school on public.passenger_manifest
  for select to authenticated
  using (reservation_id in (select id from public.reservation));
create policy passenger_manifest_modify_own_school on public.passenger_manifest
  for all to authenticated
  using (reservation_id in (select id from public.reservation))
  with check (reservation_id in (select id from public.reservation));

-- ============================================================================
-- 9. Shadow-row trigger on person_unavailability (SCH-15)
-- ============================================================================
-- Materializes a corresponding reservation row so the same exclusion
-- constraint that prevents double-booking also blocks scheduling against
-- the unavailability window.
--
-- Bypasses RLS by being SECURITY DEFINER — the trigger is part of the
-- system, not the calling user. We still pin search_path for safety.
create or replace function public.fn_person_unavailability_shadow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_role text;
  v_base_id     uuid;
  v_shadow_id   uuid;
begin
  if (tg_op = 'INSERT') then
    select ur.role::text
      into v_active_role
      from public.user_roles ur
     where ur.user_id = new.user_id
       and ur.is_default = true
     limit 1;

    -- Pick any base belonging to the school for the shadow row.
    select b.id
      into v_base_id
      from public.bases b
     where b.school_id = new.school_id
     order by b.created_at
     limit 1;

    insert into public.reservation
      (school_id, base_id, activity_type, time_range, status,
       instructor_id, student_id, notes, requested_by, requested_at,
       approved_at, approved_by)
    values
      (new.school_id, v_base_id, 'misc', new.time_range, 'approved',
       case when v_active_role = 'instructor' then new.user_id else null end,
       case when v_active_role in ('student','rental_customer')
            then new.user_id else null end,
       'unavailable: ' || coalesce(new.reason, new.kind::text),
       new.created_by, now(),
       now(), new.created_by)
    returning id into v_shadow_id;

    new.shadow_reservation_id := v_shadow_id;
    return new;

  elsif (tg_op = 'UPDATE') then
    if old.shadow_reservation_id is not null then
      update public.reservation
         set time_range = new.time_range,
             notes      = 'unavailable: ' || coalesce(new.reason, new.kind::text)
       where id = old.shadow_reservation_id;
    end if;
    new.shadow_reservation_id := old.shadow_reservation_id;
    return new;

  elsif (tg_op = 'DELETE') then
    if old.shadow_reservation_id is not null then
      update public.reservation
         set status     = 'cancelled',
             deleted_at = now()
       where id = old.shadow_reservation_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

create trigger person_unavailability_shadow_ins
  before insert on public.person_unavailability
  for each row execute function public.fn_person_unavailability_shadow();

create trigger person_unavailability_shadow_upd
  before update on public.person_unavailability
  for each row execute function public.fn_person_unavailability_shadow();

create trigger person_unavailability_shadow_del
  before delete on public.person_unavailability
  for each row execute function public.fn_person_unavailability_shadow();

-- ============================================================================
-- 10. Block-inflate trigger on reservation (SCH-16)
-- ============================================================================
create or replace function public.fn_reservation_block_inflate()
returns trigger
language plpgsql
as $$
declare
  v_block_id uuid;
begin
  if new.parent_block_id is null then
    return new;
  end if;

  select sbi.block_id into v_block_id
    from public.schedule_block_instance sbi
   where sbi.id = new.parent_block_id;

  if v_block_id is null then
    return new;
  end if;

  if new.instructor_id is null then
    select sb.instructor_id into new.instructor_id
      from public.schedule_block sb where sb.id = v_block_id;
  end if;
  if new.aircraft_id is null then
    select sb.aircraft_id into new.aircraft_id
      from public.schedule_block sb where sb.id = v_block_id;
  end if;
  if new.room_id is null then
    select sb.room_id into new.room_id
      from public.schedule_block sb where sb.id = v_block_id;
  end if;

  return new;
end;
$$;

create trigger reservation_block_inflate
  before insert on public.reservation
  for each row execute function public.fn_reservation_block_inflate();

-- ============================================================================
-- 11. Audit + hard-delete-blocker triggers
-- ============================================================================
-- audit.attach() adds BOTH audit logging AND a hard-delete blocker.
-- Use it on every safety-relevant table.
select audit.attach('reservation');
select audit.attach('aircraft_squawk');
select audit.attach('fif_notice');
select audit.attach('schedule_block');
select audit.attach('person_unavailability');
select audit.attach('passenger_manifest');

-- room: audit-only (rooms aren't training-record-relevant; admin may
-- hard-delete a misnamed room).
create trigger room_audit
  after insert or update or delete on public.room
  for each row execute function audit.fn_log_change();

-- fif_acknowledgement: audit-only (acks are immutable insert-only data;
-- no need to block hard-delete because they're never deleted in normal
-- flow, but we don't want a P0001 surprise either).
create trigger fif_acknowledgement_audit
  after insert or update or delete on public.fif_acknowledgement
  for each row execute function audit.fn_log_change();

-- schedule_block_instance: audit-only.
create trigger schedule_block_instance_audit
  after insert or update or delete on public.schedule_block_instance
  for each row execute function audit.fn_log_change();
