-- Local development seed.
--
-- Idempotent: TRUNCATEs the relevant tables and reinserts two test
-- schools + one user per school. Used by `supabase db reset` and by
-- the cross-tenant RLS harness in tests/rls.
--
-- Order matters because of FKs and the audit triggers. We disable
-- session_replication_role temporarily so the audit trigger doesn't
-- record the seed inserts in audit_log (otherwise every test run
-- would accumulate rows).

set session_replication_role = replica;

truncate table
  public.audit_log,
  public.documents,
  public.user_roles,
  public.users,
  public.bases,
  public.schools
restart identity cascade;

-- Two schools in different timezones to exercise FND-06.
insert into public.schools (id, name, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'Alpha Flight Academy', 'America/Chicago'),
  ('22222222-2222-2222-2222-222222222222', 'Bravo Aviation School', 'America/Los_Angeles');

insert into public.bases (id, school_id, name, timezone) values
  ('1a111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Alpha Main', 'America/Chicago'),
  ('2b222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Bravo Main', 'America/Los_Angeles');

-- One admin user per school. The id values match what tests/rls/harness.ts
-- uses for synthetic JWT claims (sub).
insert into public.users (id, school_id, email, full_name, timezone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin-a@alpha.test', 'Alpha Admin', 'America/Chicago'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'admin-b@bravo.test', 'Bravo Admin', 'America/Los_Angeles');

insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'none', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', 'none', true);

set session_replication_role = origin;
