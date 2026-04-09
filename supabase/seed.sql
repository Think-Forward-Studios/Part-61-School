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

-- Phase 4 Plan 05: re-seed system maintenance_item_templates.
--
-- The TRUNCATE ... schools CASCADE above wipes every FK-descendant table,
-- including public.maintenance_item_template (template.school_id is a
-- nullable FK to public.schools; TRUNCATE CASCADE does NOT respect the
-- NULL — the whole child table is truncated). The canonical seed lives
-- in migrations/0013_phase4_seed_templates.sql so production and
-- migration-only flows still get it; this block restores the same rows
-- after `supabase db reset` so local dev stays in sync.
do $seed_templates$
declare
  tmpl_id uuid;
begin
  -- Cessna 172 for-hire standard
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  ) values (
    null, 'Cessna 172 for-hire standard', 'Cessna', '172%',
    'Standard CAMP bundle for a Cessna 172 used in dual instruction / rental. Covers annual, 100-hour, ELT, transponder, pitot-static (IFR), VOR (IFR), and oil change.'
  ) returning id into tmpl_id;
  insert into public.maintenance_item_template_line
    (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
  values
    (tmpl_id, 'annual_inspection',       'Annual inspection',                        '{"clock":"calendar","months":12}'::jsonb, 'ia',     30, 0),
    (tmpl_id, 'hundred_hour_inspection', '100-hour inspection',                      '{"clock":"tach","hours":100}'::jsonb,      'a_and_p',10, 1),
    (tmpl_id, 'elt_91_207',              'ELT §91.207 inspection',                   '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 2),
    (tmpl_id, 'elt_battery',             'ELT battery replacement',                  '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 3),
    (tmpl_id, 'transponder_91_413',      'Transponder §91.413 certification',        '{"clock":"calendar","months":24}'::jsonb,  'a_and_p',30, 4),
    (tmpl_id, 'pitot_static_91_411',     'Pitot-static §91.411 certification (IFR)', '{"clock":"calendar","months":24}'::jsonb,  'a_and_p',30, 5),
    (tmpl_id, 'vor_check',               'VOR check (IFR, §91.171)',                 '{"clock":"calendar","months":1}'::jsonb,   'a_and_p', 7, 6),
    (tmpl_id, 'oil_change',              'Oil change',                               '{"clock":"tach","hours":50}'::jsonb,       'a_and_p', 5, 7);

  -- Cessna 152 standard
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  ) values (
    null, 'Cessna 152 standard', 'Cessna', '152%',
    'Standard CAMP bundle for a Cessna 152 trainer. Annual, 100-hour, ELT, transponder, and oil. No pitot-static (VFR-only common config).'
  ) returning id into tmpl_id;
  insert into public.maintenance_item_template_line
    (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
  values
    (tmpl_id, 'annual_inspection',       'Annual inspection',                 '{"clock":"calendar","months":12}'::jsonb, 'ia',     30, 0),
    (tmpl_id, 'hundred_hour_inspection', '100-hour inspection',               '{"clock":"tach","hours":100}'::jsonb,      'a_and_p',10, 1),
    (tmpl_id, 'elt_91_207',              'ELT §91.207 inspection',            '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 2),
    (tmpl_id, 'elt_battery',             'ELT battery replacement',           '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 3),
    (tmpl_id, 'transponder_91_413',      'Transponder §91.413 certification', '{"clock":"calendar","months":24}'::jsonb,  'a_and_p',30, 4),
    (tmpl_id, 'oil_change',              'Oil change',                        '{"clock":"tach","hours":50}'::jsonb,       'a_and_p', 5, 5);

  -- Piper PA-28 standard
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  ) values (
    null, 'Piper PA-28 standard', 'Piper', 'PA-28%',
    'Standard CAMP bundle for a Piper PA-28 (Cherokee / Warrior / Archer). Annual, 100-hour, ELT, transponder, oil.'
  ) returning id into tmpl_id;
  insert into public.maintenance_item_template_line
    (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
  values
    (tmpl_id, 'annual_inspection',       'Annual inspection',                 '{"clock":"calendar","months":12}'::jsonb, 'ia',     30, 0),
    (tmpl_id, 'hundred_hour_inspection', '100-hour inspection',               '{"clock":"tach","hours":100}'::jsonb,      'a_and_p',10, 1),
    (tmpl_id, 'elt_91_207',              'ELT §91.207 inspection',            '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 2),
    (tmpl_id, 'elt_battery',             'ELT battery replacement',           '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 3),
    (tmpl_id, 'transponder_91_413',      'Transponder §91.413 certification', '{"clock":"calendar","months":24}'::jsonb,  'a_and_p',30, 4),
    (tmpl_id, 'oil_change',              'Oil change',                        '{"clock":"tach","hours":50}'::jsonb,       'a_and_p', 5, 5);

  -- Generic single-engine (minimal)
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  ) values (
    null, 'Generic single-engine', null, null,
    'Minimal CAMP bundle for any single-engine aircraft: annual + ELT. Admins should add type-specific items (100-hour, transponder, etc.) as needed.'
  ) returning id into tmpl_id;
  insert into public.maintenance_item_template_line
    (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
  values
    (tmpl_id, 'annual_inspection', 'Annual inspection',      '{"clock":"calendar","months":12}'::jsonb, 'ia',     30, 0),
    (tmpl_id, 'elt_91_207',        'ELT §91.207 inspection', '{"clock":"calendar","months":12}'::jsonb,  'a_and_p',30, 1);
end
$seed_templates$;

-- Phase 5 Plan 02: endorsement_template catalog.
--
-- endorsement_template has NO FK to public.schools, so the TRUNCATE
-- schools CASCADE above does not touch it. The rows seeded by
-- migrations/0019_phase5_seed_endorsements.sql survive `supabase db reset`
-- without any re-insert block here. Do not add one — duplicate inserts
-- would violate the endorsement_template_code_unique index.

set session_replication_role = origin;
