-- Phase 4 migration (part 2 of 2): CAMP tables, RLS, audit, triggers.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260408000003_phase4_camp_tables.sql.
--
-- Order of operations:
--   1. Extend existing tables (aircraft, aircraft_squawk)
--   2. Create CAMP tables (in FK-safe order)
--   3. Indexes
--   4. RLS enable + policies
--   5. Logbook seal trigger
--   6. ad_compliance_history append-only enforcement
--   7. audit.attach() + audit-only triggers
--
-- Phase 4 plan 04-02 will layer the SQL functions and bridging triggers
-- on top. This migration is schema + RLS + integrity guards only.

-- ============================================================================
-- 1. Extend existing tables
-- ============================================================================
alter table public.aircraft
  add column grounded_reason     text,
  add column grounded_by_item_id uuid;
-- grounded_by_item_id FK is added AFTER maintenance_item exists (below).

alter table public.aircraft_squawk
  add column status                              public.squawk_status not null default 'open',
  add column triaged_at                          timestamptz,
  add column triaged_by                          uuid references public.users(id),
  add column deferred_until                      date,
  add column deferral_justification              text,
  add column work_order_id                       uuid,
  add column returned_to_service_at              timestamptz,
  add column returned_to_service_signer_snapshot jsonb;
-- work_order_id FK is added AFTER work_order exists (below).

-- ============================================================================
-- 2. New tables
-- ============================================================================

-- 2a. maintenance_item (MNT-01) — unified item table for all CAMP kinds
create table public.maintenance_item (
  id                          uuid primary key default gen_random_uuid(),
  school_id                   uuid not null references public.schools(id),
  base_id                     uuid references public.bases(id),
  aircraft_id                 uuid not null references public.aircraft(id),
  engine_id                   uuid references public.aircraft_engine(id),
  component_id                uuid, -- FK added after aircraft_component exists
  ad_compliance_id            uuid, -- FK added after aircraft_ad_compliance exists
  kind                        public.maintenance_item_kind not null,
  title                       text not null,
  description                 text,
  interval_rule               jsonb not null,
  last_completed_at           timestamptz,
  last_completed_hours        jsonb,
  last_completed_by_user_id   uuid references public.users(id),
  last_work_order_id          uuid, -- FK added after work_order exists
  next_due_at                 timestamptz,
  next_due_hours              numeric,
  status                      public.maintenance_item_status not null default 'current',
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references public.users(id),
  updated_by                  uuid references public.users(id),
  deleted_at                  timestamptz
);

-- Now backfill the aircraft.grounded_by_item_id FK
alter table public.aircraft
  add constraint aircraft_grounded_by_item_id_fkey
  foreign key (grounded_by_item_id) references public.maintenance_item(id) on delete set null;

-- 2b. maintenance_item_template (catalog of reusable bundles)
create table public.maintenance_item_template (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid references public.schools(id), -- null = system template
  name                     text not null,
  aircraft_make            text,
  aircraft_model_pattern   text,
  description              text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.users(id),
  updated_by               uuid references public.users(id),
  deleted_at               timestamptz
);

-- 2c. maintenance_item_template_line
create table public.maintenance_item_template_line (
  id                    uuid primary key default gen_random_uuid(),
  template_id           uuid not null references public.maintenance_item_template(id),
  kind                  public.maintenance_item_kind not null,
  title                 text not null,
  interval_rule         jsonb not null,
  required_authority    public.mechanic_authority,
  default_warning_days  integer,
  position              integer not null default 0,
  created_at            timestamptz not null default now()
);

-- 2d. airworthiness_directive (catalog)
create table public.airworthiness_directive (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid references public.schools(id), -- null = global
  ad_number               text not null,
  title                   text not null,
  summary                 text,
  effective_date          date,
  compliance_method       text,
  applicability           jsonb,
  superseded_by_ad_id     uuid references public.airworthiness_directive(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references public.users(id),
  updated_by              uuid references public.users(id),
  deleted_at              timestamptz
);
create unique index airworthiness_directive_school_number_unique
  on public.airworthiness_directive (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), ad_number)
  where deleted_at is null;

-- 2e. aircraft_ad_compliance (per-aircraft join)
create table public.aircraft_ad_compliance (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id),
  base_id             uuid references public.bases(id),
  aircraft_id         uuid not null references public.aircraft(id),
  ad_id               uuid not null references public.airworthiness_directive(id),
  applicable          boolean not null default true,
  first_due_at        timestamptz,
  first_due_hours     numeric,
  recurrence_rule     jsonb,
  status              public.ad_compliance_status not null default 'current',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id),
  deleted_at          timestamptz
);
create unique index aircraft_ad_compliance_unique
  on public.aircraft_ad_compliance (aircraft_id, ad_id)
  where deleted_at is null;

-- Backfill maintenance_item.ad_compliance_id FK
alter table public.maintenance_item
  add constraint maintenance_item_ad_compliance_id_fkey
  foreign key (ad_compliance_id) references public.aircraft_ad_compliance(id) on delete set null;

-- 2f. ad_compliance_history (append-only)
create table public.ad_compliance_history (
  id                       uuid primary key default gen_random_uuid(),
  compliance_record_id     uuid not null references public.aircraft_ad_compliance(id),
  school_id                uuid not null references public.schools(id),
  complied_at              timestamptz not null default now(),
  complied_at_hours        jsonb,
  method_used              text,
  work_order_id            uuid, -- FK added after work_order exists
  signer_snapshot          jsonb not null,
  notes                    text,
  created_at               timestamptz not null default now()
);

-- 2g. aircraft_component
create table public.aircraft_component (
  id                          uuid primary key default gen_random_uuid(),
  school_id                   uuid not null references public.schools(id),
  base_id                     uuid references public.bases(id),
  aircraft_id                 uuid not null references public.aircraft(id),
  engine_id                   uuid references public.aircraft_engine(id),
  kind                        public.aircraft_component_kind not null,
  serial_number               text,
  part_number                 text,
  manufacturer                text,
  installed_at_hours          jsonb,
  installed_at_date           date,
  life_limit_hours            numeric,
  life_limit_months           integer,
  overhaul_interval_hours     numeric,
  last_overhaul_at_hours      jsonb,
  removed_at                  timestamptz,
  removed_reason              text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references public.users(id),
  updated_by                  uuid references public.users(id),
  deleted_at                  timestamptz
);

-- Backfill maintenance_item.component_id FK
alter table public.maintenance_item
  add constraint maintenance_item_component_id_fkey
  foreign key (component_id) references public.aircraft_component(id) on delete set null;

-- 2h. aircraft_component_overhaul (insert-only event log)
create table public.aircraft_component_overhaul (
  id                       uuid primary key default gen_random_uuid(),
  component_id             uuid not null references public.aircraft_component(id),
  school_id                uuid not null references public.schools(id),
  overhauled_at            timestamptz not null default now(),
  overhauled_at_hours      jsonb,
  work_order_id            uuid, -- FK added after work_order exists
  signer_snapshot          jsonb not null,
  notes                    text,
  created_at               timestamptz not null default now()
);

-- 2i. work_order
create table public.work_order (
  id                          uuid primary key default gen_random_uuid(),
  school_id                   uuid not null references public.schools(id),
  base_id                     uuid references public.bases(id),
  aircraft_id                 uuid not null references public.aircraft(id),
  status                      public.work_order_status not null default 'draft',
  kind                        public.work_order_kind not null,
  title                       text not null,
  description                 text,
  assigned_to_user_id         uuid references public.users(id),
  source_squawk_id            uuid references public.aircraft_squawk(id),
  source_maintenance_item_id  uuid references public.maintenance_item(id),
  started_at                  timestamptz,
  completed_at                timestamptz,
  signed_off_at               timestamptz,
  signed_off_by               uuid references public.users(id),
  signer_snapshot             jsonb,
  return_to_service_time      jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references public.users(id),
  updated_by                  uuid references public.users(id),
  deleted_at                  timestamptz
);

-- Backfill all the deferred FKs to work_order
alter table public.aircraft_squawk
  add constraint aircraft_squawk_work_order_id_fkey
  foreign key (work_order_id) references public.work_order(id);
alter table public.maintenance_item
  add constraint maintenance_item_last_work_order_id_fkey
  foreign key (last_work_order_id) references public.work_order(id);
alter table public.ad_compliance_history
  add constraint ad_compliance_history_work_order_id_fkey
  foreign key (work_order_id) references public.work_order(id);
alter table public.aircraft_component_overhaul
  add constraint aircraft_component_overhaul_work_order_id_fkey
  foreign key (work_order_id) references public.work_order(id);

-- 2j. work_order_task
create table public.work_order_task (
  id                            uuid primary key default gen_random_uuid(),
  work_order_id                 uuid not null references public.work_order(id),
  position                      integer not null default 0,
  description                   text not null,
  required_authority            public.mechanic_authority not null,
  completed_at                  timestamptz,
  completed_by_user_id          uuid references public.users(id),
  completion_signer_snapshot    jsonb,
  notes                         text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid references public.users(id),
  updated_by                    uuid references public.users(id),
  deleted_at                    timestamptz
);

-- 2k. part
create table public.part (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id),
  base_id             uuid references public.bases(id),
  part_number         text not null,
  description         text,
  manufacturer        text,
  kind                public.part_kind not null,
  unit                public.part_unit not null,
  on_hand_qty         numeric not null default 0,
  min_reorder_qty     numeric,
  preferred_supplier  text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.users(id),
  updated_by          uuid references public.users(id),
  deleted_at          timestamptz
);
create unique index part_school_part_number_unique
  on public.part (school_id, part_number)
  where deleted_at is null;

-- 2l. part_lot
create table public.part_lot (
  id              uuid primary key default gen_random_uuid(),
  part_id         uuid not null references public.part(id),
  school_id       uuid not null references public.schools(id),
  lot_number      text,
  serial_number   text,
  received_at     timestamptz not null default now(),
  received_by     uuid references public.users(id),
  received_qty    numeric not null,
  qty_remaining   numeric not null,
  expires_at      timestamptz,
  supplier        text,
  invoice_ref     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  updated_by      uuid references public.users(id),
  deleted_at      timestamptz
);

-- 2m. work_order_part_consumption
create table public.work_order_part_consumption (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid not null references public.work_order(id),
  part_id         uuid not null references public.part(id),
  part_lot_id     uuid references public.part_lot(id),
  quantity        numeric not null check (quantity > 0),
  consumed_at     timestamptz not null default now(),
  consumed_by     uuid references public.users(id),
  notes           text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- 2n. logbook_entry — append-only with seal trigger.
-- NO deleted_at — retention contract forbids soft-delete on logbook entries.
create table public.logbook_entry (
  id                      uuid primary key default gen_random_uuid(),
  school_id               uuid not null references public.schools(id),
  base_id                 uuid references public.bases(id),
  aircraft_id             uuid not null references public.aircraft(id),
  engine_id               uuid references public.aircraft_engine(id),
  book_kind               public.logbook_book_kind not null,
  entry_date              date not null,
  hobbs                   numeric,
  tach                    numeric,
  airframe_time           numeric,
  engine_time             numeric,
  description             text not null,
  work_order_id           uuid references public.work_order(id),
  maintenance_item_id     uuid references public.maintenance_item(id),
  corrects_entry_id       uuid references public.logbook_entry(id),
  signer_snapshot         jsonb,
  signed_at               timestamptz,
  sealed                  boolean not null default false,
  created_at              timestamptz not null default now(),
  created_by_user_id      uuid references public.users(id)
);

-- 2o. maintenance_overrun (§91.409 10-hour overrun)
create table public.maintenance_overrun (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references public.schools(id),
  base_id                  uuid references public.bases(id),
  aircraft_id              uuid not null references public.aircraft(id),
  item_id                  uuid not null references public.maintenance_item(id),
  authority_cfr_cite       text not null default '§91.409(b)',
  justification            text not null check (length(justification) >= 20),
  max_additional_hours     integer not null check (max_additional_hours between 1 and 10),
  granted_at               timestamptz not null default now(),
  granted_by_user_id       uuid references public.users(id),
  signer_snapshot          jsonb not null,
  consumed_hours           numeric not null default 0,
  expires_at               timestamptz not null,
  revoked_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.users(id),
  updated_by               uuid references public.users(id),
  deleted_at               timestamptz
);
-- Once-only-per-cycle invariant: one active overrun per maintenance item.
create unique index maintenance_overrun_item_active_unique
  on public.maintenance_overrun (item_id)
  where revoked_at is null and deleted_at is null;

-- 2p. aircraft_downtime_forecast (cache table)
create table public.aircraft_downtime_forecast (
  id                  uuid primary key default gen_random_uuid(),
  aircraft_id         uuid not null unique references public.aircraft(id),
  school_id           uuid not null references public.schools(id),
  next_event_at       timestamptz,
  next_event_hours    numeric,
  reason              text,
  confidence          text,
  refreshed_at        timestamptz not null default now()
);

-- ============================================================================
-- 3. Indexes
-- ============================================================================
create index maintenance_item_aircraft_status_idx
  on public.maintenance_item (aircraft_id, status)
  where deleted_at is null;
create index aircraft_ad_compliance_aircraft_idx
  on public.aircraft_ad_compliance (aircraft_id)
  where deleted_at is null;
create index aircraft_component_aircraft_idx
  on public.aircraft_component (aircraft_id)
  where deleted_at is null and removed_at is null;
create index work_order_aircraft_status_idx
  on public.work_order (aircraft_id, status)
  where deleted_at is null;
create index logbook_entry_aircraft_book_idx
  on public.logbook_entry (aircraft_id, book_kind, entry_date desc);
create index part_lot_part_idx
  on public.part_lot (part_id)
  where deleted_at is null;

-- ============================================================================
-- 4. RLS enable + policies
-- ============================================================================
alter table public.maintenance_item              enable row level security;
alter table public.maintenance_item_template     enable row level security;
alter table public.maintenance_item_template_line enable row level security;
alter table public.airworthiness_directive       enable row level security;
alter table public.aircraft_ad_compliance        enable row level security;
alter table public.ad_compliance_history         enable row level security;
alter table public.aircraft_component            enable row level security;
alter table public.aircraft_component_overhaul   enable row level security;
alter table public.work_order                    enable row level security;
alter table public.work_order_task               enable row level security;
alter table public.work_order_part_consumption   enable row level security;
alter table public.part                          enable row level security;
alter table public.part_lot                      enable row level security;
alter table public.logbook_entry                 enable row level security;
alter table public.maintenance_overrun           enable row level security;
alter table public.aircraft_downtime_forecast    enable row level security;

-- Helper: the standard "school_id + nullable base" predicate from
-- Phase 2 / Phase 3. Repeated inline because Postgres doesn't allow
-- parameterized RLS expressions.

-- maintenance_item
create policy maintenance_item_select_own_school_base on public.maintenance_item
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy maintenance_item_modify_own_school_base on public.maintenance_item
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- maintenance_item_template (school_id may be null = system catalog visible to all)
create policy maintenance_item_template_select on public.maintenance_item_template
  for select to authenticated
  using (
    school_id is null
    or school_id = (auth.jwt() ->> 'school_id')::uuid
  );
create policy maintenance_item_template_modify on public.maintenance_item_template
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- maintenance_item_template_line: inherits via template
create policy maintenance_item_template_line_select on public.maintenance_item_template_line
  for select to authenticated
  using (template_id in (select id from public.maintenance_item_template));
create policy maintenance_item_template_line_modify on public.maintenance_item_template_line
  for all to authenticated
  using (template_id in (select id from public.maintenance_item_template))
  with check (template_id in (select id from public.maintenance_item_template));

-- airworthiness_directive (catalog; null school = global readable by all)
create policy airworthiness_directive_select on public.airworthiness_directive
  for select to authenticated
  using (
    school_id is null
    or school_id = (auth.jwt() ->> 'school_id')::uuid
  );
create policy airworthiness_directive_modify on public.airworthiness_directive
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- aircraft_ad_compliance
create policy aircraft_ad_compliance_select_own_school_base on public.aircraft_ad_compliance
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy aircraft_ad_compliance_modify_own_school_base on public.aircraft_ad_compliance
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- ad_compliance_history: append-only. SELECT scoped by school; INSERT
-- with school check; UPDATE / DELETE blocked by ALL-policy returning false.
create policy ad_compliance_history_select on public.ad_compliance_history
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy ad_compliance_history_insert on public.ad_compliance_history
  for insert to authenticated
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy ad_compliance_history_no_update on public.ad_compliance_history
  for update to authenticated
  using (false);
create policy ad_compliance_history_no_delete on public.ad_compliance_history
  for delete to authenticated
  using (false);

-- aircraft_component
create policy aircraft_component_select_own_school_base on public.aircraft_component
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy aircraft_component_modify_own_school_base on public.aircraft_component
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- aircraft_component_overhaul: append-only event log
create policy aircraft_component_overhaul_select on public.aircraft_component_overhaul
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy aircraft_component_overhaul_insert on public.aircraft_component_overhaul
  for insert to authenticated
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy aircraft_component_overhaul_no_update on public.aircraft_component_overhaul
  for update to authenticated
  using (false);
create policy aircraft_component_overhaul_no_delete on public.aircraft_component_overhaul
  for delete to authenticated
  using (false);

-- work_order
create policy work_order_select_own_school_base on public.work_order
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy work_order_modify_own_school_base on public.work_order
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- work_order_task: inherits via parent work_order
create policy work_order_task_select on public.work_order_task
  for select to authenticated
  using (work_order_id in (select id from public.work_order));
create policy work_order_task_modify on public.work_order_task
  for all to authenticated
  using (work_order_id in (select id from public.work_order))
  with check (work_order_id in (select id from public.work_order));

-- work_order_part_consumption: inherits via parent work_order
create policy work_order_part_consumption_select on public.work_order_part_consumption
  for select to authenticated
  using (work_order_id in (select id from public.work_order));
create policy work_order_part_consumption_modify on public.work_order_part_consumption
  for all to authenticated
  using (work_order_id in (select id from public.work_order))
  with check (work_order_id in (select id from public.work_order));

-- part
create policy part_select_own_school_base on public.part
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy part_modify_own_school_base on public.part
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- part_lot: scoped by school_id directly (cheaper than join)
create policy part_lot_select on public.part_lot
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy part_lot_modify on public.part_lot
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- logbook_entry
create policy logbook_entry_select_own_school_base on public.logbook_entry
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy logbook_entry_modify_own_school_base on public.logbook_entry
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- maintenance_overrun
create policy maintenance_overrun_select_own_school_base on public.maintenance_overrun
  for select to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );
create policy maintenance_overrun_modify_own_school_base on public.maintenance_overrun
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (
      (auth.jwt() ->> 'active_role') = 'admin'
      or base_id::text = current_setting('app.base_id', true)
      or current_setting('app.base_id', true) is null
      or base_id is null
    )
  );

-- aircraft_downtime_forecast (cache; school-scoped)
create policy aircraft_downtime_forecast_select on public.aircraft_downtime_forecast
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy aircraft_downtime_forecast_modify on public.aircraft_downtime_forecast
  for all to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid)
  with check (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- ============================================================================
-- 5. Logbook seal trigger
-- ============================================================================
-- Once `sealed = true`, the row is immutable. The single permitted
-- transition is the sealing transition itself: sealed flips false->true
-- in the same UPDATE that sets signer_snapshot + signed_at. Any other
-- UPDATE on a sealed row raises an exception.
create or replace function public.fn_logbook_entry_block_update()
returns trigger
language plpgsql
as $$
begin
  if old.sealed = true then
    raise exception
      'logbook_entry % is sealed and cannot be modified', old.id
      using errcode = 'P0001';
  end if;

  if new.sealed = true and old.sealed = false then
    if new.signer_snapshot is null or new.signed_at is null then
      raise exception
        'sealing logbook_entry % requires signer_snapshot and signed_at', old.id
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger logbook_entry_block_update
  before update on public.logbook_entry
  for each row execute function public.fn_logbook_entry_block_update();

-- ============================================================================
-- 6. Audit + hard-delete-blocker triggers
-- ============================================================================
-- audit.attach() adds BOTH the audit trigger AND the hard-delete blocker.
select audit.attach('maintenance_item');
select audit.attach('maintenance_item_template');
select audit.attach('airworthiness_directive');
select audit.attach('aircraft_ad_compliance');
select audit.attach('aircraft_component');
select audit.attach('work_order');
select audit.attach('work_order_task');
select audit.attach('work_order_part_consumption');
select audit.attach('part');
select audit.attach('part_lot');
select audit.attach('logbook_entry');
select audit.attach('maintenance_overrun');

-- Audit-only (no hard-delete blocker) for cache + insert-only event tables
create trigger maintenance_item_template_line_audit
  after insert or update or delete on public.maintenance_item_template_line
  for each row execute function audit.fn_log_change();

create trigger ad_compliance_history_audit
  after insert or update or delete on public.ad_compliance_history
  for each row execute function audit.fn_log_change();

create trigger aircraft_component_overhaul_audit
  after insert or update or delete on public.aircraft_component_overhaul
  for each row execute function audit.fn_log_change();

create trigger aircraft_downtime_forecast_audit
  after insert or update or delete on public.aircraft_downtime_forecast
  for each row execute function audit.fn_log_change();
