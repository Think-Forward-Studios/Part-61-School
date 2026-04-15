-- Phase 8 migration (part 2): messaging + broadcast tables.
--
-- Hand-authored; Drizzle schemas in packages/db/src/schema/messaging.ts
-- mirror this for type inference only.
--
-- Tables:
--   1. public.conversation       — 1:1 canonical pair (userA_low < userB_high)
--   2. public.message            — IM rows, soft-delete only, audit-attached
--   3. public.message_read       — per-user last-read watermark
--   4. public.broadcast          — admin-originated school-wide announcements
--   5. public.broadcast_read     — per-user dismissal watermark
--
-- RLS:
--   conversation + message: participant-only SELECT/INSERT.
--   broadcast: school-scoped SELECT; admin-only INSERT/UPDATE/DELETE at
--   both RLS + tRPC layer.
--   *_read tables: own-user only.
--
-- Realtime: message + broadcast added to supabase_realtime publication.
--
-- Safety-relevance: message is safety-relevant (users rely on evidence);
-- broadcast is safety-relevant (announcements carry operational
-- information). Both get audit triggers + hard-delete blockers.

-- ============================================================================
-- 1. conversation
-- ============================================================================
create table public.conversation (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id),
  user_a_low      uuid not null references public.users(id),
  user_b_high     uuid not null references public.users(id),
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint conversation_ordered_pair_chk check (user_a_low < user_b_high)
);

create unique index conversation_pair_uq
  on public.conversation (school_id, user_a_low, user_b_high);

create index conversation_last_message_idx
  on public.conversation (school_id, last_message_at desc);

alter table public.conversation enable row level security;

create policy conversation_select_participant on public.conversation
  for select to authenticated
  using (
    (user_a_low = auth.uid() or user_b_high = auth.uid())
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy conversation_insert_participant on public.conversation
  for insert to authenticated
  with check (
    (user_a_low = auth.uid() or user_b_high = auth.uid())
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

create policy conversation_update_participant on public.conversation
  for update to authenticated
  using (
    (user_a_low = auth.uid() or user_b_high = auth.uid())
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  )
  with check (
    (user_a_low = auth.uid() or user_b_high = auth.uid())
    and school_id = (auth.jwt() ->> 'school_id')::uuid
  );

-- ============================================================================
-- 2. message — safety-relevant, soft-delete only, hard-delete blocked
-- ============================================================================
create table public.message (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversation(id),
  school_id        uuid not null references public.schools(id),
  sender_id        uuid not null references public.users(id),
  body             text not null,
  sent_at          timestamptz not null default now(),
  deleted_at       timestamptz
);

create index message_conversation_sent_idx
  on public.message (conversation_id, sent_at);

alter table public.message enable row level security;

create policy message_select_participant on public.message
  for select to authenticated
  using (
    conversation_id in (
      select id from public.conversation
       where user_a_low = auth.uid() or user_b_high = auth.uid()
    )
  );

create policy message_insert_sender on public.message
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and conversation_id in (
      select id from public.conversation
       where user_a_low = auth.uid() or user_b_high = auth.uid()
    )
  );

create policy message_update_sender on public.message
  for update to authenticated
  using (
    sender_id = auth.uid()
    and conversation_id in (
      select id from public.conversation
       where user_a_low = auth.uid() or user_b_high = auth.uid()
    )
  )
  with check (
    sender_id = auth.uid()
  );

select audit.attach('message');

-- ============================================================================
-- 3. message_read
-- ============================================================================
create table public.message_read (
  conversation_id uuid not null references public.conversation(id),
  user_id         uuid not null references public.users(id),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.message_read enable row level security;

create policy message_read_own on public.message_read
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 4. broadcast
-- ============================================================================
create table public.broadcast (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id),
  base_id       uuid references public.bases(id),
  sender_id     uuid not null references public.users(id),
  target_roles  text[] not null,
  title         text not null,
  body          text not null,
  urgency       text not null default 'normal',
  is_recalled   boolean not null default false,
  sent_at       timestamptz not null default now(),
  expires_at    timestamptz,
  deleted_at    timestamptz,
  constraint broadcast_urgency_chk check (urgency in ('normal', 'urgent'))
);

create index broadcast_school_sent_idx
  on public.broadcast (school_id, sent_at);

alter table public.broadcast enable row level security;

-- Anyone in the school can read broadcasts (recipients need visibility).
create policy broadcast_select_own_school on public.broadcast
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- Only admins can create/update/delete.
create policy broadcast_admin_write on public.broadcast
  for all to authenticated
  using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'active_role') = 'admin'
  )
  with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'active_role') = 'admin'
  );

select audit.attach('broadcast');

-- ============================================================================
-- 5. broadcast_read
-- ============================================================================
create table public.broadcast_read (
  broadcast_id  uuid not null references public.broadcast(id),
  user_id       uuid not null references public.users(id),
  dismissed_at  timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);

alter table public.broadcast_read enable row level security;

create policy broadcast_read_own on public.broadcast_read
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 6. Realtime publication registration
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.message;
  alter table public.message replica identity default;

  alter publication supabase_realtime add table public.broadcast;
  alter table public.broadcast replica identity default;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication not found — skipping realtime registration';
  when others then
    raise notice 'realtime publication registration skipped: %', sqlerrm;
end;
$$;
