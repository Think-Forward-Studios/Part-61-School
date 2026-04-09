-- 0013_phase4_seed_templates.sql
-- Phase 4 Plan 05 — seed system maintenance_item_templates for common
-- Part 61 fleet types. school_id IS NULL means "system template" —
-- visible to all schools via the maintenance_item_template_select RLS
-- policy (`school_id is null or school_id = ...`).
--
-- No banned terms. Titles use "annual inspection / 100-hour inspection /
-- ELT 91.207 / transponder 91.413 / pitot-static 91.411 / oil change /
-- VOR check" vocabulary.

begin;

-- =============================================================
-- 1. Cessna 172 for-hire standard
-- =============================================================
with t as (
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  )
  values (
    null,
    'Cessna 172 for-hire standard',
    'Cessna',
    '172%',
    'Standard CAMP bundle for a Cessna 172 used in dual instruction / rental. Covers annual, 100-hour, ELT, transponder, pitot-static (IFR), VOR (IFR), and oil change.'
  )
  returning id
)
insert into public.maintenance_item_template_line
  (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
select
  t.id, v.kind::public.maintenance_item_kind, v.title, v.interval_rule::jsonb,
  v.required_authority::public.mechanic_authority, v.warning_days, v.position
from t,
(values
  ('annual_inspection',       'Annual inspection',                       '{"clock":"calendar","months":12}'::text, 'ia',    30, 0),
  ('hundred_hour_inspection', '100-hour inspection',                     '{"clock":"tach","hours":100}'::text,      'a_and_p',10, 1),
  ('elt_91_207',              'ELT §91.207 inspection',                  '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 2),
  ('elt_battery',             'ELT battery replacement',                 '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 3),
  ('transponder_91_413',      'Transponder §91.413 certification',       '{"clock":"calendar","months":24}'::text,  'a_and_p',30, 4),
  ('pitot_static_91_411',     'Pitot-static §91.411 certification (IFR)','{"clock":"calendar","months":24}'::text,  'a_and_p',30, 5),
  ('vor_check',               'VOR check (IFR, §91.171)',                '{"clock":"calendar","months":1}'::text,   'a_and_p', 7, 6),
  ('oil_change',              'Oil change',                              '{"clock":"tach","hours":50}'::text,       'a_and_p', 5, 7)
) as v(kind, title, interval_rule, required_authority, warning_days, position);

-- =============================================================
-- 2. Cessna 152 standard
-- =============================================================
with t as (
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  )
  values (
    null,
    'Cessna 152 standard',
    'Cessna',
    '152%',
    'Standard CAMP bundle for a Cessna 152 trainer. Annual, 100-hour, ELT, transponder, and oil. No pitot-static (VFR-only common config).'
  )
  returning id
)
insert into public.maintenance_item_template_line
  (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
select
  t.id, v.kind::public.maintenance_item_kind, v.title, v.interval_rule::jsonb,
  v.required_authority::public.mechanic_authority, v.warning_days, v.position
from t,
(values
  ('annual_inspection',       'Annual inspection',                 '{"clock":"calendar","months":12}'::text, 'ia',    30, 0),
  ('hundred_hour_inspection', '100-hour inspection',               '{"clock":"tach","hours":100}'::text,      'a_and_p',10, 1),
  ('elt_91_207',              'ELT §91.207 inspection',            '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 2),
  ('elt_battery',             'ELT battery replacement',           '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 3),
  ('transponder_91_413',      'Transponder §91.413 certification', '{"clock":"calendar","months":24}'::text,  'a_and_p',30, 4),
  ('oil_change',              'Oil change',                        '{"clock":"tach","hours":50}'::text,       'a_and_p', 5, 5)
) as v(kind, title, interval_rule, required_authority, warning_days, position);

-- =============================================================
-- 3. Piper PA-28 standard
-- =============================================================
with t as (
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  )
  values (
    null,
    'Piper PA-28 standard',
    'Piper',
    'PA-28%',
    'Standard CAMP bundle for a Piper PA-28 (Cherokee / Warrior / Archer). Annual, 100-hour, ELT, transponder, oil.'
  )
  returning id
)
insert into public.maintenance_item_template_line
  (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
select
  t.id, v.kind::public.maintenance_item_kind, v.title, v.interval_rule::jsonb,
  v.required_authority::public.mechanic_authority, v.warning_days, v.position
from t,
(values
  ('annual_inspection',       'Annual inspection',                 '{"clock":"calendar","months":12}'::text, 'ia',    30, 0),
  ('hundred_hour_inspection', '100-hour inspection',               '{"clock":"tach","hours":100}'::text,      'a_and_p',10, 1),
  ('elt_91_207',              'ELT §91.207 inspection',            '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 2),
  ('elt_battery',             'ELT battery replacement',           '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 3),
  ('transponder_91_413',      'Transponder §91.413 certification', '{"clock":"calendar","months":24}'::text,  'a_and_p',30, 4),
  ('oil_change',              'Oil change',                        '{"clock":"tach","hours":50}'::text,       'a_and_p', 5, 5)
) as v(kind, title, interval_rule, required_authority, warning_days, position);

-- =============================================================
-- 4. Generic single-engine (minimal)
-- =============================================================
with t as (
  insert into public.maintenance_item_template (
    school_id, name, aircraft_make, aircraft_model_pattern, description
  )
  values (
    null,
    'Generic single-engine',
    null,
    null,
    'Minimal CAMP bundle for any single-engine aircraft: annual + ELT. Admins should add type-specific items (100-hour, transponder, etc.) as needed.'
  )
  returning id
)
insert into public.maintenance_item_template_line
  (template_id, kind, title, interval_rule, required_authority, default_warning_days, position)
select
  t.id, v.kind::public.maintenance_item_kind, v.title, v.interval_rule::jsonb,
  v.required_authority::public.mechanic_authority, v.warning_days, v.position
from t,
(values
  ('annual_inspection', 'Annual inspection',      '{"clock":"calendar","months":12}'::text, 'ia',    30, 0),
  ('elt_91_207',        'ELT §91.207 inspection', '{"clock":"calendar","months":12}'::text,  'a_and_p',30, 1)
) as v(kind, title, interval_rule, required_authority, warning_days, position);

commit;
