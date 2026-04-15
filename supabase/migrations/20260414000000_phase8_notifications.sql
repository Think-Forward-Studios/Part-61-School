-- Phase 8 migration (part 1): notifications + user_notification_pref +
-- notification_default_by_role + email_outbox.
--
-- Hand-authored; the Drizzle schemas in packages/db/src/schema/notification.ts
-- mirror this for type inference only.
--
-- Tables:
--   1. public.notifications               — one row per (user, channel) per event
--   2. public.user_notification_pref      — per-user override of role defaults
--   3. public.notification_default_by_role— seeded role-curated defaults
--   4. public.email_outbox                — transactional-outbox queue
--
-- Patterns:
--   • notifications is school-scoped AND user-scoped (RLS: select/update own
--     rows only). INSERT allowed for same-school rows so tRPC-called
--     createNotification() can fan out to other users in the same school.
--   • user_notification_pref is strictly own-user.
--   • notification_default_by_role is readable by any authenticated user
--     (prefs are not sensitive); seeded per CONTEXT §Role-based defaults.
--   • email_outbox has RLS enabled with NO permissive policies for
--     authenticated — only the service-role worker reads/writes via the
--     non-pooled DIRECT_DATABASE_URL. Grants are revoked explicitly.
--
-- Realtime: alter publication supabase_realtime add table public.notifications;
--           alter table public.notifications replica identity default;

-- ============================================================================
-- 1. Enums
-- ============================================================================
create type public.notification_event_kind as enum (
  'reservation_requested',
  'reservation_approved',
  'reservation_changed',
  'reservation_cancelled',
  'reservation_reminder_24h',
  'grading_complete',
  'squawk_opened',
  'squawk_grounding',
  'squawk_returned_to_service',
  'document_expiring',
  'currency_expiring',
  'overdue_aircraft',
  'grounded_aircraft_attempted_use',
  'admin_broadcast',
  'duty_hour_warning'
);

create type public.notification_channel as enum (
  'in_app',
  'email',
  'dispatch'
);

-- ============================================================================
-- 2. notifications
-- ============================================================================
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id),
  base_id             uuid references public.bases(id),
  user_id             uuid not null references public.users(id),
  kind                public.notification_event_kind not null,
  channel             public.notification_channel not null default 'in_app',
  title               text not null,
  body                text not null,
  link_url            text,
  source_table        text,
  source_record_id    uuid,
  severity            text not null default 'info',
  is_safety_critical  boolean not null default false,
  created_at          timestamptz not null default now(),
  read_at             timestamptz,
  dismissed_at        timestamptz
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at)
  where read_at is null;

create index notifications_school_created_idx
  on public.notifications (school_id, created_at);

create index notifications_source_idx
  on public.notifications (source_table, source_record_id);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy notifications_insert_own_school on public.notifications
  for insert to authenticated
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Audit trigger (transient data — audit attach still useful to track
-- mark-read activity and defend against unexpected writes).
select audit.attach('notifications');

-- ============================================================================
-- 3. user_notification_pref
-- ============================================================================
create table public.user_notification_pref (
  user_id     uuid not null references public.users(id),
  kind        public.notification_event_kind not null,
  channel     public.notification_channel not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind, channel)
);

create index user_notification_pref_user_idx
  on public.user_notification_pref (user_id);

alter table public.user_notification_pref enable row level security;

create policy user_notification_pref_own on public.user_notification_pref
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

select audit.attach('user_notification_pref');

-- ============================================================================
-- 4. notification_default_by_role (seeded per CONTEXT)
-- ============================================================================
create table public.notification_default_by_role (
  role                text not null,
  kind                public.notification_event_kind not null,
  channel             public.notification_channel not null,
  enabled             boolean not null default true,
  is_safety_critical  boolean not null default false,
  primary key (role, kind, channel)
);

alter table public.notification_default_by_role enable row level security;

create policy notification_default_by_role_select_all
  on public.notification_default_by_role
  for select to authenticated
  using (true);

-- Mark safety-critical kinds once in this table so createNotification()
-- can derive is_safety_critical without the caller having to pass it.
-- Safety-critical = overdue_aircraft, grounded_aircraft_attempted_use,
-- squawk_grounding (CONTEXT §Safety-critical + RESEARCH Q6).

-- Seed helper: student role.
insert into public.notification_default_by_role (role, kind, channel, enabled, is_safety_critical) values
  ('student', 'reservation_requested',       'in_app', true, false),
  ('student', 'reservation_requested',       'email',  true, false),
  ('student', 'reservation_approved',        'in_app', true, false),
  ('student', 'reservation_approved',        'email',  true, false),
  ('student', 'reservation_changed',         'in_app', true, false),
  ('student', 'reservation_changed',         'email',  true, false),
  ('student', 'reservation_cancelled',       'in_app', true, false),
  ('student', 'reservation_cancelled',       'email',  true, false),
  ('student', 'reservation_reminder_24h',    'in_app', true, false),
  ('student', 'reservation_reminder_24h',    'email',  true, false),
  ('student', 'grading_complete',            'in_app', true, false),
  ('student', 'grading_complete',            'email',  true, false),
  ('student', 'squawk_opened',               'in_app', true, false),
  ('student', 'squawk_opened',               'email',  false, false),
  ('student', 'squawk_grounding',            'in_app', true, true),
  ('student', 'squawk_grounding',            'email',  true, true),
  ('student', 'document_expiring',           'in_app', true, false),
  ('student', 'document_expiring',           'email',  true, false),
  ('student', 'currency_expiring',           'in_app', true, false),
  ('student', 'currency_expiring',           'email',  true, false),
  ('student', 'admin_broadcast',             'in_app', true, false),
  ('student', 'admin_broadcast',             'email',  true, false);

-- Instructor role.
insert into public.notification_default_by_role (role, kind, channel, enabled, is_safety_critical) values
  ('instructor', 'reservation_requested',     'in_app', true, false),
  ('instructor', 'reservation_requested',     'email',  true, false),
  ('instructor', 'reservation_approved',      'in_app', true, false),
  ('instructor', 'reservation_approved',      'email',  true, false),
  ('instructor', 'reservation_changed',       'in_app', true, false),
  ('instructor', 'reservation_changed',       'email',  true, false),
  ('instructor', 'reservation_cancelled',     'in_app', true, false),
  ('instructor', 'reservation_cancelled',     'email',  true, false),
  ('instructor', 'reservation_reminder_24h',  'in_app', true, false),
  ('instructor', 'reservation_reminder_24h',  'email',  true, false),
  ('instructor', 'grading_complete',          'in_app', true, false),
  ('instructor', 'grading_complete',          'email',  false, false),
  ('instructor', 'squawk_opened',             'in_app', true, false),
  ('instructor', 'squawk_opened',             'email',  true, false),
  ('instructor', 'squawk_grounding',          'in_app', true, true),
  ('instructor', 'squawk_grounding',          'email',  true, true),
  ('instructor', 'squawk_returned_to_service','in_app', true, false),
  ('instructor', 'squawk_returned_to_service','email',  false, false),
  ('instructor', 'duty_hour_warning',         'in_app', true, false),
  ('instructor', 'duty_hour_warning',         'email',  true, false),
  ('instructor', 'admin_broadcast',           'in_app', true, false),
  ('instructor', 'admin_broadcast',           'email',  true, false);

-- Mechanic role.
insert into public.notification_default_by_role (role, kind, channel, enabled, is_safety_critical) values
  ('mechanic', 'squawk_opened',               'in_app', true, false),
  ('mechanic', 'squawk_opened',               'email',  true, false),
  ('mechanic', 'squawk_grounding',            'in_app', true, true),
  ('mechanic', 'squawk_grounding',            'email',  true, true),
  ('mechanic', 'squawk_returned_to_service',  'in_app', true, false),
  ('mechanic', 'squawk_returned_to_service',  'email',  false, false),
  ('mechanic', 'admin_broadcast',             'in_app', true, false),
  ('mechanic', 'admin_broadcast',             'email',  true, false);

-- Admin role (everything).
insert into public.notification_default_by_role (role, kind, channel, enabled, is_safety_critical) values
  ('admin', 'reservation_requested',          'in_app', true, false),
  ('admin', 'reservation_requested',          'email',  false, false),
  ('admin', 'reservation_approved',           'in_app', true, false),
  ('admin', 'reservation_approved',           'email',  false, false),
  ('admin', 'reservation_changed',            'in_app', true, false),
  ('admin', 'reservation_changed',            'email',  false, false),
  ('admin', 'reservation_cancelled',          'in_app', true, false),
  ('admin', 'reservation_cancelled',          'email',  false, false),
  ('admin', 'reservation_reminder_24h',       'in_app', false, false),
  ('admin', 'reservation_reminder_24h',       'email',  false, false),
  ('admin', 'grading_complete',               'in_app', false, false),
  ('admin', 'grading_complete',               'email',  false, false),
  ('admin', 'squawk_opened',                  'in_app', true, false),
  ('admin', 'squawk_opened',                  'email',  false, false),
  ('admin', 'squawk_grounding',               'in_app', true, true),
  ('admin', 'squawk_grounding',               'email',  true, true),
  ('admin', 'squawk_returned_to_service',     'in_app', true, false),
  ('admin', 'squawk_returned_to_service',     'email',  false, false),
  ('admin', 'document_expiring',              'in_app', false, false),
  ('admin', 'document_expiring',              'email',  false, false),
  ('admin', 'currency_expiring',              'in_app', false, false),
  ('admin', 'currency_expiring',              'email',  false, false),
  ('admin', 'overdue_aircraft',               'in_app', true, true),
  ('admin', 'overdue_aircraft',               'email',  true, true),
  ('admin', 'overdue_aircraft',               'dispatch', true, true),
  ('admin', 'grounded_aircraft_attempted_use','in_app', true, true),
  ('admin', 'grounded_aircraft_attempted_use','email',  true, true),
  ('admin', 'grounded_aircraft_attempted_use','dispatch', true, true),
  ('admin', 'admin_broadcast',                'in_app', true, false),
  ('admin', 'admin_broadcast',                'email',  true, false),
  ('admin', 'duty_hour_warning',              'in_app', true, false),
  ('admin', 'duty_hour_warning',              'email',  false, false);

-- ============================================================================
-- 5. email_outbox
-- ============================================================================
create table public.email_outbox (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id),
  notification_id  uuid references public.notifications(id),
  to_email         text not null,
  subject          text not null,
  template_key     text not null,
  template_props   jsonb not null,
  idempotency_key  text not null,
  status           text not null default 'pending',
  sent_at          timestamptz,
  failed_at        timestamptz,
  error_message    text,
  attempts         integer not null default 0,
  created_at       timestamptz not null default now(),
  constraint email_outbox_idempotency_uq unique (idempotency_key),
  constraint email_outbox_status_chk check (status in ('pending', 'sending', 'sent', 'failed'))
);

create index email_outbox_status_created_idx
  on public.email_outbox (status, created_at);

alter table public.email_outbox enable row level security;

-- Intentionally no permissive policies for authenticated/anon.
-- Only the service-role worker (DIRECT_DATABASE_URL) reads/writes.
-- Revoke grants to be explicit — RLS alone would block authenticated
-- reads since no policy is defined.
revoke all on public.email_outbox from authenticated, anon, public;

-- ============================================================================
-- 6. Realtime publication registration
-- ============================================================================
-- supabase_realtime publication exists on Supabase hosted; it may or
-- may not exist in local dev. Wrap in DO/EXCEPTION so local migrations
-- do not fail if the publication is absent.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
  alter table public.notifications replica identity default;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication not found — skipping realtime registration';
  when others then
    raise notice 'realtime publication registration skipped: %', sqlerrm;
end;
$$;
