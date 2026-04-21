-- =============================================================================
-- Migration: 20260418000002_phase2_seed_courses.sql
-- Phase   : Phase 2 — seed 7 Private-Pilot-family reference courses
-- Author  : Phase 2 syllabus team
-- Date    : 2026-04-18
-- Depends : 20260418000001_phase2_rating_sought_additions.sql MUST run first
--           (otherwise the 'rating_sought' INSERTs fail on invalid enum).
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
-- -------------------------------------------------------------------
-- Seeds the course catalog with 7 system-template courses (school_id IS NULL):
--
--   PPL-ASEL     Private Pilot — Airplane Single-Engine Land      §61.109(a)
--   PPL-AMEL     Private Pilot — Airplane Multi-Engine Land       §61.109(b) initial
--   PPL-AMEL-AO  Private Pilot — AMEL Add-On Rating               §61.63(c)
--   PPL-H        Private Pilot — Rotorcraft Helicopter            §61.109(c)
--   PPL-G        Private Pilot — Glider (aerotow primary)         §61.109(f)
--   SP-A         Sport Pilot — Airplane (post-MOSAIC)             §61.313
--   REC-A        Recreational Pilot — Airplane                    §61.99
--
-- Each course gets one published course_version, stages, lessons, and
-- line_items. Schools fork via clone_course_version(cv_id, school_id)
-- and customize before using in live training.
--
-- WHY SEED THESE AS SYSTEM TEMPLATES (school_id = NULL)
-- -------------------------------------------------------------------
-- The platform distinguishes "catalog" courses (school_id IS NULL) from
-- "school-owned" courses (school_id = X). Catalog courses are:
--   * Read-only to schools (cannot be edited or deleted by a school)
--   * Always visible in the course picker
--   * The starting point for any school's own syllabus
-- This gives every school a tested, regulation-anchored baseline for
-- each PPL family without each school having to re-derive §61.109(a)
-- from scratch.
--
-- SOURCE OF TRUTH
-- -------------------------------------------------------------------
-- Derived from the Phase 2 filled syllabi (.docx) and research briefs.
-- Structural reference only — NOT verbatim of any commercial publisher.
-- Each course.description cites its regulatory basis (14 CFR §61.x,
-- Part 141 Appx B) and the applicable ACS/PTS. Every course instructs
-- schools to fork and customize before live use.
--
-- SCHEMA TOUCHPOINTS
-- -------------------------------------------------------------------
-- Tables written to (INSERTs only; no UPDATE/DELETE):
--   public.course            — 7 rows (one per course family)
--   public.course_version    — 7 rows (one v1.0 per course)
--   public.stage             — 18 rows (PPL-ASEL ×3, PPL-AMEL ×3,
--                              PPL-AMEL-AO ×1, PPL-H ×3, PPL-G ×3,
--                              SP-A ×2, REC-A ×2)
--   public.lesson            — ~90 rows total
--   public.line_item         — ~95 rows total
-- Enums referenced:
--   public.course_rating_sought   (the 7 new values from migration 000001)
--   public.line_item_classification  (values: 'required','must_pass')
-- NOT touched: course_phase, unit. We deliberately use a 3-level depth
-- (stage → lesson → line_item). Schools can introduce course_phase and
-- unit rows when they fork — the platform supports them but the seed
-- does not prescribe them.
--
-- UUID NAMESPACE
-- -------------------------------------------------------------------
-- Fixed UUIDs live under the prefix   aa2aaaaa-aaaa-aaaa-aaaa-*
-- (the '2' in the 3rd octet is mnemonic for "Phase 2").
--
--   Course family      course UUID ends ...  course_version UUID ends ...
--   -----------------  --------------------  --------------------------
--   PPL-ASEL           000000000001          0000000000a1
--   PPL-AMEL           000000000002          0000000000a2
--   PPL-AMEL-AO        000000000003          0000000000a3
--   PPL-H              000000000004          0000000000a4
--   PPL-G              000000000005          0000000000a5
--   SP-A               000000000006          0000000000a6
--   REC-A              000000000007          0000000000a7
--
-- Stage / lesson / line_item rows use gen_random_uuid() because they are
-- never referenced externally — only the course and course_version IDs
-- need to be stable across re-runs for idempotency and for references in
-- later phases (e.g., Phase 9 MCN mappings).
--
-- IDEMPOTENCY
-- -------------------------------------------------------------------
-- Strategy: "all-or-nothing" short-circuit, re-seed-safe on course level.
--   1. SELECT count(*) on the 7 fixed course UUIDs. If 7, RETURN
--      immediately — nothing to do.
--   2. Otherwise run every INSERT with ON CONFLICT (id) DO NOTHING on
--      course and course_version (they have fixed UUIDs).
--   3. stage/lesson/line_item rows use gen_random_uuid() and so will NOT
--      be deduped by ID. This is deliberate: on a partial run they would
--      create duplicates. The short-circuit in step 1 prevents that in
--      the normal case (either all 7 courses exist → skip entirely, or
--      zero exist → seed everything). The only failure mode that would
--      cause duplicates is a re-run that starts after SOME of the 7
--      courses exist — e.g., the migration crashed halfway. Operational
--      remedy: DELETE the partial rows and re-run, or fork → customize
--      and leave the partial seed alone.
--
-- TRANSACTION SEMANTICS
-- -------------------------------------------------------------------
-- This file is wrapped in a BEGIN/COMMIT so all 7 seeds are atomic.
-- The inner `begin ... end;` inside $fn$ ... $fn$ is the PL/pgSQL
-- function body, NOT a nested transaction (PL/pgSQL doesn't support
-- nested tx without savepoints).
--
-- PUBLICATION
-- -------------------------------------------------------------------
-- published_at = now() on every course_version so they are immediately
-- forkable. clone_course_version() accepts any course_version regardless
-- of publication state, but the UI filters unpublished catalog versions
-- out of the course picker — setting published_at makes them visible.
--
-- GRADING + min_levels
-- -------------------------------------------------------------------
-- grading_scale = 'absolute_ipm' and min_levels = 3 across all 7 courses.
-- This matches Phase 5/6 catalog defaults. Schools can override both
-- on their fork. absolute_ipm means line_item scoring on an absolute
-- scale (not relative); 3 levels = basic / competent / proficient.
--
-- default_plan_cadence_hours_per_week
-- -------------------------------------------------------------------
-- Set per-course based on the typical syllabus pace:
--   * 4 hrs/wk for airplane/helicopter initial (PPL-ASEL, PPL-AMEL,
--     PPL-AMEL-AO, PPL-H, SP-A, REC-A) — standard full-time civilian pace.
--   * 2 hrs/wk for PPL-G — glider operations are weather-gated; two
--     weekend-pace hours is realistic.
-- Schools override on their fork.
--
-- line_item CLASSIFICATIONS
-- -------------------------------------------------------------------
-- 'must_pass' — the student MUST satisfy this item before stage/course
--   completion. Used for safety-critical items (stall recovery, engine-out,
--   identify-verify-feather in MEL, hovering auto in helicopter, etc.).
-- 'required' — the student MUST attempt this item; a partial pass is
--   acceptable for stage closure. Most content items are 'required'.
-- Additional classifications exist in the enum (e.g., 'optional',
-- 'progressive') but are not used in Phase 2 seed.
--
-- "cross join lateral" BULK-INSERT IDIOM
-- -------------------------------------------------------------------
-- For each stage we insert ~3-6 line_items spread across that stage's
-- lessons. Rather than a separate INSERT per line_item, we:
--   INSERT INTO line_item (...)
--   SELECT ... FROM lesson l
--   CROSS JOIN LATERAL (VALUES (...), (...), ...) AS li(pos, code, ...)
--   WHERE l.course_version_id = cv_X and l.stage_id = st_id;
-- This joins each lesson to every row in the VALUES clause, giving us a
-- "broadcast" of the same line_items across every lesson in the stage.
-- If a line_item is truly lesson-specific, we use an inline WHERE on
-- lesson.code (see PPL-G where rope-break items target specific lessons).
-- Pattern is borrowed from Phase 5 seed (20260409000007).
--
-- "NO BANNED TERMS"
-- -------------------------------------------------------------------
-- No verbatim text from commercial publishers (Jeppesen, ASA, King,
-- Gleim, etc.). References are regulation citations and ACS/PTS task
-- codes only. Safe to publish as catalog.
--
-- REVIEW CHECKLIST (for team reviewers)
-- -------------------------------------------------------------------
-- [ ] Regulatory citations match 14 CFR Part 61 (as of 2026-04-18):
--     §61.109(a) ASEL, §61.109(b) AMEL, §61.109(c) PPL-H, §61.109(f) PPL-G,
--     §61.313 SP-A, §61.99 REC-A, §61.63(c) add-on.
-- [ ] ACS/PTS references:
--     FAA-S-ACS-6C  (PPL ASEL/AMEL, May 2024)
--     FAA-S-ACS-15  (PPL Rotorcraft-Helicopter, May 2024 C1)
--     FAA-S-8081-22A (PTS — Glider, not yet an ACS)
--     FAA-S-8081-29A (PTS — Sport Pilot, Nov 2023)
--     FAA-S-8081-3B  (PTS — Recreational Pilot, Nov 2023)
-- [ ] UUID collisions: none of the 7 fixed UUIDs collide with Phase 5
--     seed UUIDs (different mnemonic prefix).
-- [ ] line_item.code values are unique within a stage but NOT globally
--     (re-used 'LI-A' / 'LI-B' / etc. across stages is intentional).
--     Any global uniqueness constraint added later will require a
--     rename pass.
-- [ ] minimum_hours JSON keys match what the planner expects; new keys
--     introduced here (multi_engine_focus, rotorcraft_helicopter,
--     add_on_proficiency_based, total_flights, solo_launches_landings,
--     pre_test_training_flights, cross_country_dual, solo_cross_country_flight,
--     solo_to_ldg_non_towered, pre_test_prep, dual_to_airport_over_25NM,
--     solo_to_ldgs_other_airport) should be documented centrally.
-- [ ] min_hours on each lesson is an INSTRUCTIONAL baseline, not a
--     regulatory minimum. §61/§141 minimums are enforced at the course
--     and stage level via minimum_hours and must-pass line_items.
-- [ ] "Fork before use" appears in every course.description.
-- =============================================================================

-- The outer BEGIN / COMMIT makes the entire 7-course seed atomic.
-- If any INSERT fails, the transaction rolls back and the catalog is
-- left in its prior state.
begin;

-- ============================================================================
-- fn_phase2_seed_courses — one-shot seeder
-- ============================================================================
-- Wrapped in a CREATE OR REPLACE FUNCTION so the logic can be re-invoked
-- out-of-band if needed (e.g., on a freshly-restored database that missed
-- the migration). Function is intentionally VOID / side-effect only.
-- The `as $fn$ ... $fn$` dollar-tag pair is standard PL/pgSQL quoting.
-- ============================================================================
create or replace function public.fn_phase2_seed_courses()
returns void
language plpgsql
as $fn$
declare
  -- Fixed catalog UUIDs. See UUID NAMESPACE in header for rationale.
  -- Convention: c_<family>_id = course UUID, cv_<family>_id = v1.0 course_version UUID.
  c_asel_id      constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000001';
  cv_asel_id     constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a1';
  c_amel_id      constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000002';
  cv_amel_id     constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a2';
  c_amelao_id    constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000003';
  cv_amelao_id   constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a3';
  c_pplh_id      constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000004';
  cv_pplh_id     constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a4';
  c_pplg_id      constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000005';
  cv_pplg_id     constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a5';
  c_spa_id       constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000006';
  cv_spa_id      constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a6';
  c_reca_id      constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-000000000007';
  cv_reca_id     constant uuid := 'aa2aaaaa-aaaa-aaaa-aaaa-0000000000a7';
  st_id          uuid;
  exists_count   integer;
begin
  -- ------------------------------------------------------------------
  -- Idempotency short-circuit.
  -- ------------------------------------------------------------------
  -- If all 7 seed courses are already present, the seed is a no-op.
  -- This avoids re-inserting stage/lesson/line_item rows (which use
  -- gen_random_uuid() and would therefore NOT be deduped by ON CONFLICT).
  -- See IDEMPOTENCY section in header for the partial-run failure mode.
  -- ------------------------------------------------------------------
  select count(*) into exists_count
    from public.course
   where id in (c_asel_id, c_amel_id, c_amelao_id,
                c_pplh_id, c_pplg_id, c_spa_id, c_reca_id);
  if exists_count = 7 then
    return;
  end if;

  -- ============================================================================
  -- 1. PPL-ASEL — Private Pilot, Airplane Single-Engine Land (§61.109(a))
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.109(a), Part 141 Appendix B (airplane).
  -- ACS              : FAA-S-ACS-6C (PPL Airplane ACS, May 2024).
  -- Stages           : S1 Pre-Solo, S2 XC & Night, S3 Checkride Prep.
  -- Hours floor      : 40 total / 20 dual / 10 solo / 3 XC / 3 night / 3 instr.
  -- Notable gates    : §61.87(n) first solo, §61.109(a)(2) night XC >100 NM,
  --                    §61.109(a)(5)(ii) long solo XC >150 NM.
  -- Design notes     : Chosen as the canonical PPL-family reference — the
  --                    other airplane families (AMEL, REC, SP) share the
  --                    same three-stage spine with variations.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_asel_id, null, 'PPL-ASEL',
    'Private Pilot — Airplane Single-Engine Land',
    'private_pilot_asel',
    E'Reference Private Pilot syllabus for airplane single-engine-land. Derived from 14 CFR §61.109(a), 14 CFR Part 141 Appendix B, and FAA-S-ACS-6C (Private Pilot Airplane ACS, May 2024). Three stages: Pre-Solo, XC & Night, Checkride Prep. Minimum-viable starting point — fork via clone_course_version and customize every lesson and line item before using in training.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at
  ) values (
    cv_asel_id, c_asel_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":40,"dual":20,"solo":10,"cross_country":3,"night":3,"instrument":3,"solo_cross_country":5,"landings_day":10,"landings_night":10}'::jsonb,
    4,
    'Seeded reference version from Phase 2 PPL-ASEL syllabus.', now()
  ) on conflict (id) do nothing;

  -- Stage 1: Pre-Solo
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_asel_id, 1, 'S1', 'Pre-Solo',
    'Establish core aircraft control, normal and emergency procedures, and traffic-pattern operations required for first solo per §61.87.',
    'Student demonstrates safe solo flight in the local traffic pattern; pre-solo knowledge test passed per §61.87(b); pre-solo flight check satisfactory.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_asel_id, st_id, 1, 'L1-G-01', 'Course Orientation & Preflight', 'ground',
     'Training course overview, documents (ARROW), preflight inspection fundamentals, airworthiness.', 'Student can conduct a full preflight unassisted.', 2.0),
    (gen_random_uuid(), null, cv_asel_id, st_id, 2, 'L1-F-01', 'Four Fundamentals', 'flight',
     'Straight-and-level, climbs, descents, turns (PA.IV.A, B, C).', 'Maintain altitude ±150 ft and heading ±15°.', 1.3),
    (gen_random_uuid(), null, cv_asel_id, st_id, 3, 'L1-F-02', 'Slow Flight & Stalls', 'flight',
     'Slow flight at 1.1 VS1; power-on and power-off stalls (PA.VII.A, B).', 'Recover with minimum altitude loss; maintain coordination.', 1.3),
    (gen_random_uuid(), null, cv_asel_id, st_id, 4, 'L1-F-03', 'Ground Reference Maneuvers', 'flight',
     'Rectangular course, S-turns, turns around a point (PA.V.B, C, D).', 'Maintain ground track with wind correction.', 1.2),
    (gen_random_uuid(), null, cv_asel_id, st_id, 5, 'L1-F-04', 'Emergency Procedures', 'flight',
     'Simulated engine failure, systems malfunctions (PA.IX.A-C).', 'Glide to field selection, checklist discipline.', 1.3),
    (gen_random_uuid(), null, cv_asel_id, st_id, 6, 'L1-F-05', 'Traffic Pattern & Landings', 'flight',
     'Normal and crosswind takeoffs and landings (PA.IV.A, B, D).', 'Consistent pattern altitude, stabilized approach.', 1.4),
    (gen_random_uuid(), null, cv_asel_id, st_id, 7, 'L1-F-06', 'Pre-Solo Review', 'flight',
     'Comprehensive review of maneuvers and emergency procedures per §61.87.', 'Ready for pre-solo knowledge test.', 1.5),
    (gen_random_uuid(), null, cv_asel_id, st_id, 8, 'L1-SC-01', 'Pre-Solo Stage Check', 'flight',
     'Chief-CFI stage check; oral + flight; A.1/A.2/A.3 endorsements issued on pass.', 'Satisfactory oral and flight.', 1.5),
    (gen_random_uuid(), null, cv_asel_id, st_id, 9, 'L1-F-07', 'First Solo', 'flight',
     'First supervised solo per §61.87(n) — three takeoffs and full-stop landings.', 'Three safe takeoffs and full-stop landings.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_asel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Aircraft documents & airworthiness check', 'Identify ARROW documents and airworthiness status.', 'Verbal walkthrough correct.', 'required'),
    (2, 'LI-B', 'Preflight inspection', 'Complete checklist-driven preflight.', 'No missed items.', 'required'),
    (3, 'LI-C', 'Stall recovery', 'Recover from power-off and power-on stalls.', 'Minimum altitude loss.', 'must_pass'),
    (4, 'LI-D', 'Emergency engine-out', 'Glide to best field, complete checklist.', 'Reasonable field selected.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_asel_id and l.stage_id = st_id;

  -- Stage 2: XC & Night
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_asel_id, 2, 'S2', 'Cross-Country & Night',
    'Navigation by pilotage, dead reckoning, and radio navigation; night operations; solo cross-country training required by §61.109(a)(2)-(5) and §61.93.',
    'Student completes §61.109(a) night XC, long solo XC, and 3 hrs simulated instrument. Sound flight planning and decision making.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_asel_id, st_id, 1, 'L2-F-01', 'Dual Cross-Country Introduction', 'flight',
     'First dual XC by pilotage and DR (PA.VI.A, B).', 'Accurate navlog and ETE.', 2.0),
    (gen_random_uuid(), null, cv_asel_id, st_id, 2, 'L2-F-02', 'Radio Navigation (VOR/GPS)', 'flight',
     'VOR intercepts and GPS direct (PA.VI.C).', 'Track and intercept correctly.', 1.5),
    (gen_random_uuid(), null, cv_asel_id, st_id, 3, 'L2-F-03', 'Night Introduction', 'flight',
     'Night T/O, landings, local ops (PA.III.C).', 'Safe night pattern ops.', 1.4),
    (gen_random_uuid(), null, cv_asel_id, st_id, 4, 'L2-F-04', 'Night Cross-Country (§61.109(a)(2))', 'flight',
     'Dual night XC >100 NM total with 10 T/O-Ldg; §61.109(a)(2).', 'Meets distance and landing requirement.', 2.5),
    (gen_random_uuid(), null, cv_asel_id, st_id, 5, 'L2-F-05', 'Simulated Instrument (§61.109(a)(3))', 'flight',
     '3 hrs simulated instrument; unusual-attitude recoveries.', 'Control by reference to instruments.', 1.5),
    (gen_random_uuid(), null, cv_asel_id, st_id, 6, 'L2-F-06', 'Solo Cross-Country (Short)', 'flight',
     'Solo XC per §61.93 endorsement.', 'Completed per plan.', 2.0),
    (gen_random_uuid(), null, cv_asel_id, st_id, 7, 'L2-F-07', 'Solo Cross-Country (Long) (§61.109(a)(5))', 'flight',
     'Solo XC >150 NM total with landings at 3 points, one leg ≥50 NM.', 'Meets §61.109(a)(5)(ii) requirement.', 4.0),
    (gen_random_uuid(), null, cv_asel_id, st_id, 8, 'L2-SC-01', 'Stage 2 Check', 'flight',
     'End-of-stage progress check.', 'Pass Stage 2 standards.', 1.3);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_asel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Flight planning & weight/balance', 'Create navlog and W&B.', 'Accurate.', 'required'),
    (2, 'LI-B', 'Weather briefing & go/no-go', 'Brief and document decision.', 'Documented.', 'required'),
    (3, 'LI-C', 'In-flight diversion', 'Execute diversion to alternate.', 'Within 5 NM.', 'must_pass'),
    (4, 'LI-D', 'Lost procedures', 'Four Cs for lost procedure.', 'Correct actions.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_asel_id and l.stage_id = st_id;

  -- Stage 3: Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_asel_id, 3, 'S3', 'Checkride Prep',
    'Polish all FAA-S-ACS-6C tasks to ACS standard; complete §61.39 endorsements and end-of-course test.',
    'Student passes mock checkride; §61.39 recommending endorsement issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_asel_id, st_id, 1, 'L3-F-01', 'Short & Soft Field Operations', 'flight',
     'Short and soft T/O and landings (PA.IV.E, F, G, H).', 'ACS tolerances.', 1.4),
    (gen_random_uuid(), null, cv_asel_id, st_id, 2, 'L3-F-02', 'Power-Off 180 & Precision Approaches', 'flight',
     'Power-off 180 accuracy landing.', 'Touchdown within designated area.', 1.3),
    (gen_random_uuid(), null, cv_asel_id, st_id, 3, 'L3-F-03', 'Steep Turns & Performance', 'flight',
     'Steep turns to ACS (PA.V.A).', 'Bank ±5°, altitude ±100 ft.', 1.3),
    (gen_random_uuid(), null, cv_asel_id, st_id, 4, 'L3-G-01', 'ACS Oral Review', 'oral',
     'Full oral review of all ACS areas.', 'Ready for checkride oral.', 2.0),
    (gen_random_uuid(), null, cv_asel_id, st_id, 5, 'L3-F-04', 'Mock Checkride', 'flight',
     'Full simulated practical test under §61.39.', 'Pass at ACS standard.', 2.0),
    (gen_random_uuid(), null, cv_asel_id, st_id, 6, 'L3-F-05', 'End-of-Course Check', 'flight',
     'Final end-of-course check; §61.39 sign-off.', 'Recommended for practical test.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_asel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Preflight preparation & aeromedical', 'ACS Area I.', 'Correct.', 'required'),
    (2, 'LI-B', 'Short-field landing', 'Land within 200 ft of target.', 'Within tol.', 'must_pass'),
    (3, 'LI-C', 'Performance and limitations', 'ACS Area II.', 'Calculations correct.', 'must_pass'),
    (4, 'LI-D', 'Aeronautical decision making', 'ADM scenario.', 'Sound judgment.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_asel_id and l.stage_id = st_id;

  -- ============================================================================
  -- 2. PPL-AMEL — Private Pilot, AMEL, Initial (§61.109(b))
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.109(b), Part 141 Appendix B.
  -- ACS              : FAA-S-ACS-6C (Area X — Multiengine Operations).
  -- Stages           : A_S1 Pre-Solo MEL, A_S2 XC/Night/Instrument,
  --                    A_S3 OEI & Checkride Prep.
  -- Hours floor      : 40 total / 20 dual / 10 solo (same §61.109 floor as ASEL,
  --                    but ALL performed in a multi-engine airplane).
  -- Notable gates    : Vmc demo (PA.X.B), identify-verify-feather flow,
  --                    OEI by reference to instruments (PA.X.C).
  -- Design notes     : "Initial" means first Private Pilot certificate
  --                    earned in a twin. This is rare in civilian training
  --                    (most pilots earn ASEL first and add AMEL via §61.63(c))
  --                    but the pathway exists — this course models it.
  --                    minimum_hours includes "multi_engine_focus":true so
  --                    the planner and reporting UI can distinguish it from
  --                    ASEL without parsing the rating_sought enum.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_amel_id, null, 'PPL-AMEL',
    'Private Pilot — Airplane Multi-Engine Land (Initial)',
    'private_pilot_amel',
    E'Reference Private Pilot AMEL (initial, not add-on) syllabus under §61.109(b). Derived from FAA-S-ACS-6C (Area X — AMEL Multiengine Operations) and Part 141 Appendix B. Three stages: Pre-Solo MEL, XC/Night/Instrument, OEI & Checkride Prep. Emphasizes Vmc-demo, identify-verify-feather flow, drag hierarchy, OEI maneuvering, and §61.31(g)(3) centerline thrust endorsement handling. Fork before use.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at
  ) values (
    cv_amel_id, c_amel_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":40,"dual":20,"solo":10,"cross_country":3,"night":3,"instrument":3,"solo_cross_country":5,"landings_day":10,"landings_night":10,"multi_engine_focus":true}'::jsonb,
    4,
    'Seeded reference version from Phase 2 PPL-AMEL syllabus (Pathway A, Initial).', now()
  ) on conflict (id) do nothing;

  -- Stage 1: Pre-Solo MEL
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_amel_id, 1, 'A_S1', 'Pre-Solo MEL',
    'Establish multi-engine aircraft control, normal procedures, systems understanding (constant-speed props, retractable gear, crossfeed fuel), and pre-solo maneuvering in a twin.',
    'Pre-solo knowledge test and flight check satisfactory. Student can safely operate both engines through all normal flight regimes.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_amel_id, st_id, 1, 'A1-G-01', 'Twin Systems & Preflight', 'ground',
     'MEL systems: independent fuel systems, crossfeed, constant-speed propellers (feathering), retractable gear, counter-rotating props if so equipped, asymmetric-thrust principles, Vmc / blueline / red radial.',
     'Explain systems and V-speeds from memory.', 2.5),
    (gen_random_uuid(), null, cv_amel_id, st_id, 2, 'A1-F-01', 'Introductory MEL Flight', 'flight',
     'Familiarization in a twin: taxi, run-up, takeoff, cruise, normal landings; both-engine operations only.',
     'Basic aircraft control.', 1.5),
    (gen_random_uuid(), null, cv_amel_id, st_id, 3, 'A1-F-02', 'Slow Flight & Stalls in MEL', 'flight',
     'Slow flight, approach-configuration stall, and recovery in the twin.',
     'Recovery with minimum altitude loss.', 1.3),
    (gen_random_uuid(), null, cv_amel_id, st_id, 4, 'A1-F-03', 'Traffic Pattern in MEL', 'flight',
     'Normal and crosswind T/O and landings in twin; emphasis on trim and coordination.',
     'Consistent pattern altitude and stabilized approach.', 1.4),
    (gen_random_uuid(), null, cv_amel_id, st_id, 5, 'A1-SC-01', 'Pre-Solo Stage Check (MEL)', 'flight',
     'Chief-CFI stage check oral + flight; A.1/A.2/A.3 endorsements issued on pass.',
     'Satisfactory oral and flight.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_amel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Vmc and V-speed recall', 'Recite Vmc, Vy, Vyse/blueline, Vxse, Vsse.', 'Correct.', 'must_pass'),
    (2, 'LI-B', 'Crossfeed operation', 'Demonstrate crossfeed selection.', 'Correct steps.', 'required'),
    (3, 'LI-C', 'Constant-speed prop management', 'Manage MP/RPM relationship; explain feathering.', 'Correct Q&A.', 'required'),
    (4, 'LI-D', 'Both-engine emergency', 'Respond to simulated two-engine failure (glide, restart).', 'Reasonable response.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_amel_id and l.stage_id = st_id;

  -- Stage 2: MEL XC/Night/Instrument
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_amel_id, 2, 'A_S2', 'Cross-Country, Night & Simulated Instrument in MEL',
    'Satisfy §61.109(b)(2)-(5) XC and night and simulated instrument experience in a multi-engine airplane.',
    'Night XC >100 NM with 10 T/O-Ldg logged; 3 hrs simulated instrument logged; solo XC per §61.93 complete.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_amel_id, st_id, 1, 'A2-F-01', 'MEL Cross-Country Introduction', 'flight',
     'Dual XC in a twin; use of both engines; fuel management across long legs.',
     'Accurate navlog.', 2.0),
    (gen_random_uuid(), null, cv_amel_id, st_id, 2, 'A2-F-02', 'Night MEL Introduction', 'flight',
     'Night pattern work in the twin.', 'Safe night ops.', 1.4),
    (gen_random_uuid(), null, cv_amel_id, st_id, 3, 'A2-F-03', 'Night Cross-Country (§61.109(b)(2))', 'flight',
     'Dual night XC >100 NM; 10 T/O-Ldg as builder.',
     'Meets §61.109(b)(2).', 2.5),
    (gen_random_uuid(), null, cv_amel_id, st_id, 4, 'A2-F-04', 'MEL Simulated Instrument', 'flight',
     '3 hrs simulated instrument in the twin.',
     'Control by reference to instruments.', 1.5),
    (gen_random_uuid(), null, cv_amel_id, st_id, 5, 'A2-F-05', 'Solo Cross-Country (MEL)', 'flight',
     'Solo MEL XC per §61.93.', 'Completed per plan.', 2.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_amel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Fuel management across legs', 'Plan and monitor fuel crossfeed as needed.', 'Accurate.', 'required'),
    (2, 'LI-B', 'MEL weather decision', 'Brief and decide weather for twin cruise.', 'Documented.', 'required'),
    (3, 'LI-C', 'MEL instrument reference', 'Hold altitude ±100 ft under hood.', 'Demonstrated.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_amel_id and l.stage_id = st_id;

  -- Stage 3: OEI & Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_amel_id, 3, 'A_S3', 'OEI Operations & Checkride Prep',
    'Master one-engine-inoperative maneuvering, Vmc demonstration, OEI by reference to instruments, and the full FAA-S-ACS-6C Area X Multiengine Operations task set.',
    'Student passes mock checkride to ACS Area X standards; §61.39 recommendation issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_amel_id, st_id, 1, 'A3-G-01', 'OEI Theory: Vmc, Drag Hierarchy, Identify-Verify-Feather', 'ground',
     'Vmc conditions; asymmetric drag; critical engine (Left for conventional twins); identify/verify/feather flow; drag hierarchy (gear, flaps, windmilling prop).',
     'Explain Vmc factors and complete the identify-verify-feather flow from memory.', 2.0),
    (gen_random_uuid(), null, cv_amel_id, st_id, 2, 'A3-F-01', 'Vmc Demo (PA.X.B)', 'flight',
     'Vmc demonstration at ≥3000 AGL; terminate at first stall warning or loss of directional control.',
     'Execute Vmc demo to ACS tolerances; recover with minimum altitude loss.', 1.3),
    (gen_random_uuid(), null, cv_amel_id, st_id, 3, 'A3-F-02', 'OEI Maneuvering (PA.X.A)', 'flight',
     'OEI straight-and-level, climbs, descents, turns; drag-hierarchy cleanup; blueline speed discipline.',
     'Fly OEI at blueline ±5 kts.', 1.4),
    (gen_random_uuid(), null, cv_amel_id, st_id, 4, 'A3-F-03', 'OEI by Reference to Instruments (PA.X.C)', 'flight',
     'OEI under the hood: identify, verify, feather, maintain blueline, navigate to alternate.',
     'Instrument discipline maintained.', 1.4),
    (gen_random_uuid(), null, cv_amel_id, st_id, 5, 'A3-F-04', 'Engine Failure on Takeoff — Briefing & Response', 'flight',
     'Pre-TO briefing (below rotation / above blueline below 400 AGL / above blueline 400+ AGL); simulated engine failure after rotation.',
     'Decisive, correct response with appropriate pitch and identify-verify-feather as called.', 1.3),
    (gen_random_uuid(), null, cv_amel_id, st_id, 6, 'A3-F-05', 'Mock Checkride (Area X)', 'flight',
     'Full simulated practical test of Area X tasks.',
     'Pass at ACS Area X standards.', 2.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_amel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Identify-verify-feather flow', 'Dead foot, dead engine; verify with throttle; feather.', 'Correct sequence.', 'must_pass'),
    (2, 'LI-B', 'Vmc demo terminates correctly', 'Terminate at first stall warning or loss of control.', 'Correct.', 'must_pass'),
    (3, 'LI-C', 'Blueline speed discipline', 'Hold blueline ±5 kts OEI.', 'Demonstrated.', 'must_pass'),
    (4, 'LI-D', 'OEI instrument approach', 'Fly instrument approach OEI to minimums.', 'Within tol.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_amel_id and l.stage_id = st_id;

  -- ============================================================================
  -- 3. PPL-AMEL-AO — AMEL Add-On (§61.63(c))
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.63(c) — adding a class rating.
  -- ACS              : FAA-S-ACS-6C, Area X (AMEL tasks only).
  -- Stages           : Single stage (B_S1 Multiengine Operations).
  -- Hours floor      : NONE — proficiency-based. §61.63(c) requires
  --                    satisfactory completion of training in the AMEL
  --                    tasks in the ACS; no numeric hour minimum applies.
  --                    Typical real-world: 10–20 hrs.
  -- Design notes     : minimum_hours is populated but every numeric
  --                    field is null — we represent the add-on pathway
  --                    with "add_on_proficiency_based":true. Any planner
  --                    code that treats null hours as "unset" and
  --                    refuses to plan the course must check the flag
  --                    first and fall back to proficiency milestones.
  --                    Why a separate course (rather than a stage of PPL-AMEL)?
  --                    Because students enrolling in it already hold PPL-ASEL;
  --                    they don't need stages 1–2 of PPL-AMEL. Modeling as a
  --                    separate course also gives them their own checkride,
  --                    gradebook, and endorsement track, and the enum value
  --                    'private_pilot_amel_addon' makes reporting clean.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_amelao_id, null, 'PPL-AMEL-AO',
    'Private Pilot — AMEL Add-On Rating (§61.63(c))',
    'private_pilot_amel_addon',
    E'Add-on AMEL rating for a pilot who already holds Private Pilot ASEL (or higher) under §61.63(c). No hour floor; proficiency-based training focused on Area X (Multiengine Operations), with a practical test against the AMEL tasks in FAA-S-ACS-6C. Single stage: Multiengine Operations. Emphasizes Vmc demo, identify-verify-feather, OEI flow, drag hierarchy. Typically 10–20 hours of training depending on prior experience.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at
  ) values (
    cv_amelao_id, c_amelao_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":null,"dual":null,"solo":0,"cross_country":0,"night":0,"instrument":0,"solo_cross_country":0,"add_on_proficiency_based":true}'::jsonb,
    4,
    'Seeded reference version — AMEL add-on pathway (§61.63(c), proficiency-based, no numeric hour floor).', now()
  ) on conflict (id) do nothing;

  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_amelao_id, 1, 'B_S1', 'Multiengine Operations',
    'Develop MEL proficiency in Area X — Multiengine Operations — to add the AMEL class rating to an existing airplane certificate.',
    'Student passes AMEL practical test against FAA-S-ACS-6C Area X tasks; §61.63(c) practical-test recommendation issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_amelao_id, st_id, 1, 'B1-G-01', 'Twin Systems & MEL Theory', 'ground',
     'Twin systems review, Vmc conditions, drag hierarchy, critical-engine theory, V-speeds.',
     'Explain systems and V-speeds from memory.', 3.0),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 2, 'B1-F-01', 'Twin Familiarization', 'flight',
     'Taxi, run-up, T/O, cruise, landing on both engines.',
     'Basic MEL control.', 1.5),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 3, 'B1-F-02', 'Slow Flight, Stalls, Steep Turns in MEL', 'flight',
     'Performance maneuvers in the twin.',
     'ACS tolerances.', 1.3),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 4, 'B1-F-03', 'OEI Introduction & Identify-Verify-Feather', 'flight',
     'Single-engine introduction at altitude; identify-verify-feather flow with simulated failure.',
     'Correct sequence.', 1.4),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 5, 'B1-F-04', 'Vmc Demo', 'flight',
     'Vmc demonstration at ≥3000 AGL; terminate at first stall warning or directional-control loss.',
     'Demo to ACS standard.', 1.3),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 6, 'B1-F-05', 'OEI Maneuvering (PA.X.A, C)', 'flight',
     'OEI straight-and-level, turns, climbs, descents; OEI by reference to instruments.',
     'Hold blueline ±5 kts.', 1.4),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 7, 'B1-F-06', 'Engine Failure on Takeoff', 'flight',
     'Decision criteria and recovery below and above blueline.',
     'Correct response.', 1.3),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 8, 'B1-F-07', 'MEL Traffic Pattern & Landings', 'flight',
     'Normal, crosswind, short-field, soft-field in the twin.',
     'ACS tolerances.', 1.4),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 9, 'B1-F-08', 'Mock AMEL Checkride', 'flight',
     'Full simulated practical covering Area X.',
     'Pass at ACS standards.', 2.0),
    (gen_random_uuid(), null, cv_amelao_id, st_id, 10, 'B1-F-09', 'End-of-Course Check', 'flight',
     'Final end-of-course check; §61.39 recommendation.',
     'Recommended for practical test.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_amelao_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Identify-verify-feather flow', 'Dead foot, dead engine; verify with throttle; feather.', 'Correct sequence.', 'must_pass'),
    (2, 'LI-B', 'Vmc demo terminates correctly', 'Terminate at first stall warning or loss of control.', 'Correct.', 'must_pass'),
    (3, 'LI-C', 'Blueline speed discipline', 'Hold blueline ±5 kts OEI.', 'Demonstrated.', 'must_pass'),
    (4, 'LI-D', 'OEI go-around discipline', 'Reject early if not established OEI climb.', 'Decisive.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_amelao_id and l.stage_id = st_id;

  -- ============================================================================
  -- 4. PPL-H — Private Pilot, Rotorcraft Helicopter (§61.109(c))
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.109(c), Part 141 Appendix B (helicopter).
  -- ACS              : FAA-S-ACS-15 (PPL Rotorcraft-Helicopter, May 2024 C1).
  -- Stages           : S1 Pre-Solo, S2 XC/Night/Advanced, S3 Checkride Prep.
  -- Hours floor      : 40 total / 20 dual / 10 solo / 3 XC / 3 night
  --                    (no instrument floor for helicopter PPL).
  -- Notable gates    : §61.87(j)(10) hovering autorotation REQUIRED
  --                    pre-solo. This is a rotorcraft-specific gate that
  --                    does NOT exist for airplane PPL — fixed-wing
  --                    consumers of this schema should NOT expect a
  --                    pre-solo hovering auto task on airplane courses.
  --                    §61.109(c)(3)(i) night XC >50 NM (NOT 100 NM like
  --                    airplane — helicopter night XC minimum is different).
  --                    §61.109(c)(5) solo XC ≥100 NM total with 3 points.
  -- Design notes     : Includes SFAR 73 R22/R44 awareness lesson as a
  --                    ground item — required if training in a Robinson
  --                    R22 or R44, optional otherwise. Line-item LI-SFAR73
  --                    flags this to the gradebook.
  --                    Advanced rotorcraft maneuvers (confined area, pinnacle,
  --                    180-auto, running landing, slope) live in S2; S3 is
  --                    polish + mock checkride.
  --                    minimum_hours carries "rotorcraft_helicopter":true so
  --                    planner/UI can branch category-specific behavior.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_pplh_id, null, 'PPL-H',
    'Private Pilot — Rotorcraft Helicopter',
    'private_pilot_rotorcraft_helicopter',
    E'Reference Private Pilot Rotorcraft-Helicopter syllabus under §61.109(c) and Part 141 Appendix B (helicopter variant). Derived from FAA-S-ACS-15 (PPL Rotorcraft Helicopter ACS, May 2024 Change 1) and community references (Greenspun, Hillsboro, Quantum, Guidance). Three stages: Pre-Solo (including hovering autorotation per §61.87(j)(10)), XC/Night/Advanced (confined area, pinnacle, autorotations with turns), Checkride Prep. Includes SFAR 73 R22/R44 awareness.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at
  ) values (
    cv_pplh_id, c_pplh_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":40,"dual":20,"solo":10,"cross_country":3,"night":3,"instrument":0,"solo_cross_country":3,"landings_day":10,"landings_night":10,"rotorcraft_helicopter":true}'::jsonb,
    4,
    'Seeded reference version from Phase 2 PPL-H syllabus.', now()
  ) on conflict (id) do nothing;

  -- S1 Pre-Solo
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_pplh_id, 1, 'S1', 'Pre-Solo',
    'Develop helicopter control from hover through normal flight; introduce autorotation, vortex-ring-state / settling-with-power (SWP), slope and pinnacle awareness, running landings, and the §61.87(j)(10) hovering autorotation gate for pre-solo.',
    'Pre-solo knowledge test and flight check satisfactory; §61.87(j)(10) hovering autorotation demonstrated pre-solo; SFAR 73 awareness if applicable make/model.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_pplh_id, st_id, 1, 'S1-G-01', 'Rotorcraft Aerodynamics & Systems', 'ground',
     'Main-rotor/tail-rotor aerodynamics, translating tendency, translational lift, dissymmetry of lift, retreating-blade stall, autorotation, VRS/SWP conditions.',
     'Explain aerodynamics from memory.', 3.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 2, 'S1-G-02', 'SFAR 73 Awareness (R22/R44)', 'ground',
     'SFAR 73 awareness training if training in R22 or R44 make/model: low-G conditions, energy management, mast bumping.',
     'SFAR 73 awareness endorsement if applicable.', 1.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 3, 'S1-F-01', 'Introductory Hover', 'flight',
     'Hover controls: collective, cyclic, anti-torque pedals. Hovering station-keeping, slow taxi.',
     'Stabilize hover with minimal drift.', 1.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 4, 'S1-F-02', 'Hover Taxi, Takeoff to Hover, Landing from Hover', 'flight',
     'Hover taxi, hover turns, T/O to hover, landing from hover.',
     'Consistent hover discipline.', 1.2),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 5, 'S1-F-03', 'Normal Takeoff & Traffic Pattern', 'flight',
     'Normal T/O from hover, pattern, approach to hover, landing.',
     'Safe pattern ops.', 1.4),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 6, 'S1-F-04', 'Straight-In Autorotation — Demonstration', 'flight',
     'Dual demonstration of straight-in autorotation from altitude. Instructor-on-controls.',
     'Student recognizes entry and recovery sequence.', 1.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 7, 'S1-F-05', 'VRS / Settling-With-Power Awareness', 'flight',
     'Recognize and recover from incipient VRS/SWP at altitude.',
     'Recover before full VRS.', 1.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 8, 'S1-F-06', 'Slope Operations', 'flight',
     'Slope landings and takeoffs up to moderate angle.',
     'Stable slope set-down.', 1.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 9, 'S1-F-07', 'Running Landing', 'flight',
     'Power-off or reduced-power running landing.',
     'Straight track along intended line.', 0.8),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 10, 'S1-F-08', 'Hovering Autorotation Pre-Solo Gate (§61.87(j)(10))', 'flight',
     'Hovering autorotation — mandatory pre-solo for helicopter per §61.87(j)(10).',
     'Hovering auto demonstrated to §61.87(j)(10) standard.', 1.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 11, 'S1-SC-01', 'Pre-Solo Stage Check', 'flight',
     'Chief-CFI stage check oral + flight; hovering auto included.',
     'Satisfactory oral and flight; endorsements A.1/A.2/A.3 issued.', 1.5),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 12, 'S1-F-09', 'First Solo', 'flight',
     'First supervised solo per §61.87(n).',
     'Three safe hover T/O and full-stop landings.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_pplh_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-AUTO-STRAIGHT-DEMO', 'Straight-in autorotation demo', 'Observe and explain sequence.', 'Recognizes entry/flare/ground cushion.', 'required'),
    (2, 'LI-AUTO-HOVER', 'Hovering autorotation (pre-solo gate)', 'Execute hovering autorotation per §61.87(j)(10).', 'Correct sequence.', 'must_pass'),
    (3, 'LI-SWP-VRS', 'VRS/SWP recognition & recovery', 'Identify and recover before full VRS.', 'Recovery before envelope loss.', 'must_pass'),
    (4, 'LI-SLOPE', 'Slope landing', 'Slope T/O and landing at moderate angle.', 'Stable set-down.', 'required'),
    (5, 'LI-RUN-LAND', 'Running landing', 'Power-reduced running landing.', 'Straight track.', 'required'),
    (6, 'LI-SFAR73', 'SFAR 73 R22/R44 awareness', 'Completed SFAR 73 training for applicable make/model.', 'Endorsement issued if applicable.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_pplh_id and l.stage_id = st_id;

  -- S2 XC/Night/Advanced
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_pplh_id, 2, 'S2', 'Cross-Country, Night, and Advanced Rotorcraft Operations',
    'Develop XC and night navigation per §61.109(c)(2) and (3), advanced maneuvers (confined area, pinnacle, 180 autorotation), and solo XC per §61.93.',
    'Night XC >50 NM per §61.109(c)(3)(i); solo XC ≥100 NM total with 3 points per §61.109(c)(5); 180 autorotation demonstrated; confined area and pinnacle ops satisfactory.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_pplh_id, st_id, 1, 'S2-F-01', 'Dual XC Introduction (Rotorcraft)', 'flight',
     'First dual XC; pilotage and DR in the local area.',
     'Accurate navlog.', 2.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 2, 'S2-F-02', 'Confined Area Operations', 'flight',
     'High/Low reconnaissance, confined area landing.',
     'Recce and set-down performed to standard.', 1.3),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 3, 'S2-F-03', 'Pinnacle / Ridgeline Operations', 'flight',
     'Pinnacle landing and takeoff.',
     'Safe approach and departure.', 1.3),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 4, 'S2-F-04', 'Autorotation with 180° Turn', 'flight',
     '180-degree autorotation from downwind abeam to touchdown.',
     'ACS-standard touchdown.', 1.2),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 5, 'S2-F-05', 'Night Operations in Helicopter', 'flight',
     'Night pattern, hover, approach.',
     'Safe night ops.', 1.4),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 6, 'S2-F-06', 'Night XC (§61.109(c)(3)(i))', 'flight',
     'Dual night XC >50 NM total.',
     'Meets §61.109(c)(3)(i).', 2.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 7, 'S2-F-07', 'Solo XC — 100 NM (§61.109(c)(5))', 'flight',
     'Solo helicopter XC ≥100 NM total with 3 points.',
     'Meets §61.109(c)(5).', 3.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_pplh_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-AUTO-180', '180° autorotation to touchdown or PL', 'Execute 180 auto to touchdown or power recovery as set.', 'ACS standard.', 'must_pass'),
    (2, 'LI-CONFINED', 'Confined area landing', 'High/low recce, approach, set-down.', 'Safe.', 'required'),
    (3, 'LI-PINNACLE', 'Pinnacle approach and landing', 'Safe pinnacle ops.', 'Standard set-down.', 'required'),
    (4, 'LI-MAX-PERF-TO', 'Max performance takeoff', 'Execute max-performance takeoff.', 'ACS standard.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_pplh_id and l.stage_id = st_id;

  -- S3 Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_pplh_id, 3, 'S3', 'Checkride Prep',
    'Polish all FAA-S-ACS-15 tasks to ACS standard; complete §61.39 endorsements and end-of-course test.',
    'Student passes mock checkride; §61.39 recommendation issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_pplh_id, st_id, 1, 'S3-G-01', 'ACS Oral Review (Rotorcraft)', 'oral',
     'Full oral review covering FAA-S-ACS-15 areas.', 'Ready for checkride oral.', 2.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 2, 'S3-F-01', 'Autorotations — Full Proficiency', 'flight',
     'Straight-in, 180, hovering autorotations to ACS.', 'ACS standard.', 1.3),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 3, 'S3-F-02', 'Advanced Maneuvers Review', 'flight',
     'Confined area, pinnacle, max-perf T/O, running landing.', 'ACS standard.', 1.3),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 4, 'S3-F-03', 'Mock Checkride', 'flight',
     'Full simulated practical test.', 'Pass at ACS standard.', 2.0),
    (gen_random_uuid(), null, cv_pplh_id, st_id, 5, 'S3-F-04', 'End-of-Course Check', 'flight',
     'Final end-of-course check; §61.39 sign-off.', 'Recommended for practical test.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_pplh_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-LOW-RPM', 'Low-rotor-RPM recovery', 'Recognize and recover from low Nr.', 'Immediate response.', 'must_pass'),
    (2, 'LI-TRF-AWARE', 'Tail-rotor failure awareness', 'Recognize LTE vs. full TR failure; response talked through.', 'Correct response.', 'required'),
    (3, 'LI-AUTO-HOVER', 'Hovering autorotation proficiency', 'Demonstrate hovering auto.', 'ACS standard.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_pplh_id and l.stage_id = st_id;

  -- ============================================================================
  -- 5. PPL-G — Private Pilot, Glider (§61.109(f); aerotow primary)
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.109(f) (standard pathway — student already
  --                    holds a powered-aircraft PPL uses §61.109(g) instead),
  --                    Part 141 Appendix B (glider variant).
  -- PTS              : FAA-S-8081-22A (Glider — not yet an ACS as of 2026-04-18).
  -- Stages           : S1 Pre-Solo (aerotow), S2 Post-Solo Proficiency,
  --                    S3 XC & Pre-Checkride.
  -- Hours floor      : 10 total / 3 dual / 2 solo (glider hours) OR 20
  --                    total flights in gliders; pathway details in §61.109(f).
  --                    Also: 20 total flights, 10 solo T/O-Ldg, 3 pre-test
  --                    training flights in the preceding 60 days (§61.109(f)(3)).
  -- Notable gates    : §61.31(j) LAUNCH METHOD endorsement. A glider pilot
  --                    is certificated in ONE launch method (aerotow,
  --                    ground-launch, or self-launch) and must obtain a
  --                    separate logbook endorsement to use another.
  -- Design notes     : This course models the AEROTOW pathway. Ground-launch
  --                    (winch / auto-tow) and self-launch (motor-glider)
  --                    pathways are delivered as SEPARATE FORK COURSES
  --                    (PPL-G-GL and PPL-G-SL respectively — not seeded here;
  --                    added in a later phase if launch-method-specific
  --                    catalog courses are desired). This keeps the enum
  --                    clean (single 'private_pilot_glider' value) while
  --                    still capturing primary launch method via the new
  --                    course_version.launch_method_primary column.
  --                    default_plan_cadence_hours_per_week = 2 (not 4) —
  --                    glider ops are weather-gated and typically taught
  --                    at a weekend pace.
  --                    Pre-solo stage includes explicit rope-break drills
  --                    at two altitude bands (LI-ROPE-BREAK-LOW <200 AGL,
  --                    LI-ROPE-BREAK-MID 200–500 AGL) — both 'must_pass'.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_pplg_id, null, 'PPL-G',
    'Private Pilot — Glider (Aerotow)',
    'private_pilot_glider',
    E'Reference Private Pilot Glider syllabus under §61.109(f) (standard pathway), Part 141 Appendix B (glider variant), and FAA-S-8081-22A (PTS — glider not yet ACS as of 2026-04-18). Three stages: Pre-Solo (aerotow), Post-Solo Proficiency (thermaling, precision), Cross-Country & Pre-Checkride. Aerotow is the default primary launch method; ground-launch and self-launch are delivered as separate fork courses (PPL-G-GL, PPL-G-SL). Fork before use.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at,
    launch_method_primary
  ) values (
    cv_pplg_id, c_pplg_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":10,"dual":3,"solo":2,"cross_country":null,"solo_cross_country":null,"total_flights":20,"solo_launches_landings":10,"pre_test_training_flights":3}'::jsonb,
    2,
    'Seeded reference version from Phase 2 PPL-G syllabus (aerotow primary).', now(),
    'aerotow'
  ) on conflict (id) do nothing;

  -- S1 Pre-Solo
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_pplg_id, 1, 'S1', 'Pre-Solo',
    'Glider systems, assembly, aerotow procedures, pattern, normal landing, slack-line recovery, boxing the wake, stalls, spin awareness, rope-break scenarios.',
    'Pre-solo knowledge test passed; pre-solo flight check satisfactory; §61.31(j)(1)(ii) aerotow launch endorsement in progress for solo.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_pplg_id, st_id, 1, 'G1-G-01', 'Glider Orientation & Systems', 'ground',
     'Glider anatomy, instruments (total-energy vario, yaw string), aerodynamics, speed-to-fly primer.',
     'Identify systems and controls.', 2.0),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 2, 'G1-G-02', 'Assembly, Positive Control Check, Preflight', 'ground',
     'Rig the glider; positive control check; weight-and-balance; preflight.',
     'Complete PCC without prompting.', 2.0),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 3, 'G1-F-01', 'Introductory Aerotow & Release', 'flight',
     'Station-keeping on tow, release at altitude, normal pattern.',
     'Recognize tow position.', 0.5),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 4, 'G1-F-02', 'Slack-Line Recovery & Boxing the Wake', 'flight',
     'Develop and recover slack; box the wake.',
     'Recover slack without yaw excursion >15°.', 0.7),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 5, 'G1-F-03', 'Normal Patterns & Landings', 'flight',
     'Standard glider pattern with spoiler modulation to touchdown zone.',
     'Land within ±100 ft of target in calm winds.', 0.5),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 6, 'G1-F-04', 'Stalls & Spin Awareness', 'flight',
     'Stalls, incipient spin entry/recovery.',
     'Recover with <200 ft altitude loss.', 0.7),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 7, 'G1-F-05', 'Rope Break — Low & Mid Altitude', 'flight',
     'Simulated rope break at <200 AGL (straight ahead) and 200–500 AGL (return).',
     'Decisive, correct response.', 0.5),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 8, 'G1-SC-01', 'Pre-Solo Stage Check', 'flight',
     'Chief-CFIG stage check oral + flight.',
     'Satisfactory; pre-solo + aerotow endorsements issued.', 0.8);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_pplg_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-ROPE-BREAK-LOW', 'Rope break <200 AGL', 'Land straight ahead.', 'Within runway tolerance.', 'must_pass'),
    (2, 'LI-ROPE-BREAK-MID', 'Rope break 200–500 AGL', 'Abbreviated pattern to runway.', 'Safe landing.', 'must_pass'),
    (3, 'LI-SLACK-REC', 'Slack-line recovery', 'Recover without rope break.', 'No excursion.', 'must_pass'),
    (4, 'LI-SPIN-AWARE', 'Incipient spin recovery', 'Recover incipient spin.', '<200 ft loss.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_pplg_id and l.stage_id = st_id;

  -- S2 Post-Solo Proficiency
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_pplg_id, 2, 'S2', 'Post-Solo Proficiency',
    'Solo consolidation, thermaling, precision landings, off-field landing selection.',
    '10+ solo launches/landings logged; thermaling demonstrated; off-field selection from altitude satisfactory.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_pplg_id, st_id, 1, 'G2-F-01', 'First Solo (Aerotow)', 'flight',
     'Supervised solo aerotow, release, pattern, landing.', 'Safe flight.', 0.3),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 2, 'G2-F-02', 'Solo Pattern Consolidation', 'flight',
     'Additional solo launches and landings.', 'Building toward 10-L&L minimum.', 0.3),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 3, 'G2-F-03', 'Thermaling Introduction', 'flight',
     'Core centering technique; sustain climb.', 'Sustain ≥3 min climb.', 1.0),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 4, 'G2-F-04', 'Precision Landings', 'flight',
     'Land within ±25 ft of target.', '5 consecutive within tol.', 0.6),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 5, 'G2-F-05', 'Off-Field Selection from Altitude', 'flight',
     'Simulated off-field scenario from 3000 AGL.', 'Defensible selection.', 0.8),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 6, 'G2-SC-01', 'Stage 2 Check', 'flight',
     'Oral + flight; thermaling + off-field selection demonstrated.', 'Satisfactory.', 0.8);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_pplg_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-PRECISION-LAND', 'Precision landing', 'Land within ±25 ft of target.', 'Consistent.', 'must_pass'),
    (2, 'LI-THERMAL-SUSTAIN', 'Thermal sustain', 'Sustain climb ≥3 min.', 'Demonstrated.', 'must_pass'),
    (3, 'LI-OFF-FIELD-SEL', 'Off-field selection from altitude', 'Plan approach to simulated off-field.', 'Plan defensible.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_pplg_id and l.stage_id = st_id;

  -- S3 XC & Pre-Checkride
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_pplg_id, 3, 'S3', 'Cross-Country & Pre-Checkride',
    'Dual XC under §61.93, three pre-test training flights in the preceding 60 days, full ACS/PTS coverage.',
    '3 pre-test flights within preceding 60 days complete; §61.39 recommendation issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_pplg_id, st_id, 1, 'G3-G-01', 'Soaring XC Planning', 'ground',
     'Task planning, final-glide, soaring flight computer.', 'Student plans a 50-NM task.', 2.0),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 2, 'G3-F-01', 'Dual Cross-Country', 'flight',
     '50+ NM dual task.', 'Complete or defensible early return.', 2.0),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 3, 'G3-F-02', 'Pre-Checkride Flight 1', 'flight',
     'Mock checkride — AO I-IV.', 'PTS standard.', 0.8),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 4, 'G3-F-03', 'Pre-Checkride Flight 2', 'flight',
     'Mock checkride — AO V-VII.', 'PTS standard.', 0.8),
    (gen_random_uuid(), null, cv_pplg_id, st_id, 5, 'G3-F-04', 'Pre-Checkride Flight 3 & End-of-Course', 'flight',
     'Mock checkride — AO VIII-IX; §61.39 endorsement.', 'Recommended for practical test.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_pplg_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-PRE-TEST-3FLTS', '3 pre-test flights within 60 days', 'Three training flights within 60 days of practical.', 'Logged and endorsed.', 'must_pass'),
    (2, 'LI-DUAL-XC', 'Dual XC ≥50 NM', 'Complete dual XC or defensible return.', 'Task plan executed.', 'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_pplg_id and l.stage_id = st_id;

  -- ============================================================================
  -- 6. SP-A — Sport Pilot, Airplane (§61.313, post-MOSAIC)
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.301–§61.327 Subpart J; §61.23(c)(2)
  --                    driver's-license medical rule; §61.313 aeronautical
  --                    experience for SP-Airplane.
  -- PTS              : FAA-S-8081-29A (Sport Pilot, Nov 2023). MOSAIC PTS
  --                    alignment is pending — as of 2026-04-18 the PTS has
  --                    NOT been re-issued for MOSAIC. Expect tolerances to
  --                    align with PPL ACS tolerances once updated.
  -- Stages           : S1 Pre-Solo through First Solo & Consolidation,
  --                    S2 XC & Checkride Prep.
  -- Hours floor      : 20 total / 15 dual / 5 solo; plus 2 hrs dual XC,
  --                    solo XC ≥75 NM (2+ points, one seg ≥25 NM),
  --                    10 solo T/O-Ldg at non-towered airport (≥3 full-stop),
  --                    2 hrs pre-test training in preceding 2 cal months.
  -- MOSAIC STATUS    : Pilot privileges effective 2025-10-22.
  --                    Airworthiness provisions effective 2026-07-24.
  --                    Post-MOSAIC LSA definition: VS1 ≤59 KCAS, up to 4
  --                    seats physically (still 1 passenger carried),
  --                    RG and CS-prop allowed, electric/hybrid/rotorcraft/
  --                    powered-lift LSA-eligible. This course is flagged
  --                    mosaic_aligned = true so the planner/UI knows it
  --                    reflects the post-MOSAIC rules.
  -- Design notes     : Single 'sport_pilot' enum covers all SP categories
  --                    (see migration 000001 comment). This is the AIRPLANE
  --                    variant. SP-Rotorcraft-H, SP-Powered-Lift, SP-Glider
  --                    etc. would be separate courses sharing the same enum.
  --                    LI-SOLO-TO-LDG-NT codifies the §61.313(a)(4) non-
  --                    towered airport requirement explicitly — importantly,
  --                    SP solo at non-towered airports is a regulatory
  --                    requirement, not an operational preference.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_spa_id, null, 'SP-A',
    'Sport Pilot — Airplane (Post-MOSAIC)',
    'sport_pilot',
    E'Reference Sport Pilot Airplane syllabus aligned to post-MOSAIC rules (effective 2025-10-22 for pilot privileges). Regulatory basis: 14 CFR §61.301–§61.327 Subpart J, §61.23(c)(2) driver''s-license medical rule. Practical-test standard FAA-S-8081-29A (Nov 2023) pending MOSAIC PTS alignment. Two stages: Pre-Solo through First Solo & Consolidation, and Cross-Country & Checkride Prep. Total minimum 20 hours per §61.313. Fork before use.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at,
    mosaic_aligned
  ) values (
    cv_spa_id, c_spa_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":20,"dual":15,"solo":5,"cross_country_dual":2,"solo_cross_country_flight":"≥75NM, 2 points, one seg ≥25NM","solo_to_ldg_non_towered":10,"pre_test_prep":2,"ground":null}'::jsonb,
    4,
    'Seeded reference version from Phase 2 SP-A syllabus (post-MOSAIC).', now(),
    true
  ) on conflict (id) do nothing;

  -- S1 Pre-Solo
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_spa_id, 1, 'S1', 'Pre-Solo through First Solo',
    'LSA systems, four fundamentals, takeoffs and landings, slow flight, stalls, ground reference, emergencies, pre-solo knowledge test, first solo, pattern consolidation.',
    'Pre-solo knowledge test passed; first solo complete; solo T/O-Ldgs building toward 10 at a non-towered airport (§61.313(a)(4)).')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_spa_id, st_id, 1, 'SP1-G-01', 'Sport Pilot Rules & Post-MOSAIC LSA', 'ground',
     'SP privileges and limits (§61.315); LSA post-MOSAIC definition (§61.316, VS1 ≤59 KCAS); DL medical rule (§61.23(c)(2)).',
     'State rules correctly; identify SP-eligible aircraft.', 2.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 2, 'SP1-F-01', 'Introductory Flight / Four Fundamentals', 'flight',
     'Straight-and-level, turns, climbs, descents.', 'Altitude ±150 ft.', 1.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 3, 'SP1-F-02', 'Traffic Pattern Operations', 'flight',
     'Normal pattern T/O and landings.', 'Pattern altitude ±100 ft.', 1.2),
    (gen_random_uuid(), null, cv_spa_id, st_id, 4, 'SP1-F-03', 'Slow Flight & Stalls', 'flight',
     'Slow flight, power-off and power-on stalls.', 'Recover with <100 ft loss.', 1.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 5, 'SP1-F-04', 'Emergency Procedures', 'flight',
     'Simulated engine failure; field selection.', 'Reasonable field; best glide <5 s.', 1.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 6, 'SP1-SC-01', 'Pre-Solo Stage Check', 'flight',
     'Chief-CFI stage check; A.1/A.2/A.3 issued.', 'Satisfactory.', 1.2),
    (gen_random_uuid(), null, cv_spa_id, st_id, 7, 'SP1-F-05', 'First Solo', 'flight',
     'Three T/O and full-stop landings solo.', 'Safe.', 0.3),
    (gen_random_uuid(), null, cv_spa_id, st_id, 8, 'SP1-F-06', 'Solo Consolidation', 'flight',
     'Additional solo patterns toward §61.313(a)(4).', 'Logged safely.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_spa_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-PRE-SOLO-TEST', 'Pre-solo knowledge test', 'Pass the pre-solo written.', 'Passed.', 'must_pass'),
    (2, 'LI-STALL-REC', 'Stall recovery', 'Power-off and power-on stall recovery.', 'Minimum altitude loss.', 'must_pass'),
    (3, 'LI-EMERG-ENGOUT', 'Emergency engine-out', 'Field selection and glide approach.', 'Reasonable.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_spa_id and l.stage_id = st_id;

  -- S2 XC & Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_spa_id, 2, 'S2', 'Cross-Country & Checkride Prep',
    'Complete 2 hrs dual XC, the 75-NM solo XC, and 2 hrs pre-test training within the preceding 2 cal months.',
    '§61.313(a)(3)-(6) satisfied; §61.39 recommendation issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_spa_id, st_id, 1, 'SP2-G-01', 'XC Planning', 'ground',
     'Navlog, weather, diversion.', 'Plans 75-NM route.', 2.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 2, 'SP2-F-01', 'Dual XC #1', 'flight',
     'Dual XC >25 NM with pilotage/DR and EFB.', 'Arrive ±5 min ETA.', 1.2),
    (gen_random_uuid(), null, cv_spa_id, st_id, 3, 'SP2-F-02', 'Dual XC #2 + Diversion Drill', 'flight',
     'Triangular dual XC with diversion.', 'Diversion <3 min.', 1.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 4, 'SP2-F-03', 'Solo XC — 75 NM (§61.313(a)(5))', 'flight',
     'Solo XC ≥75 NM total, 2+ landing points, one seg ≥25 NM.', 'Meets §61.313(a)(5).', 1.5),
    (gen_random_uuid(), null, cv_spa_id, st_id, 5, 'SP2-F-04', 'Solo T/O-Ldg Build (Non-Towered)', 'flight',
     'Additional solo T/O-Ldgs at non-towered airport; ≥3 full-stop.', '10+ solo at NT airport, ≥3 full-stop.', 1.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 6, 'SP2-F-05', 'Pre-Test Training Flight 1 (§61.313(a)(6))', 'flight',
     'Mock checkride — AO I-IV.', 'PTS standard.', 1.0),
    (gen_random_uuid(), null, cv_spa_id, st_id, 7, 'SP2-F-06', 'Pre-Test Training Flight 2 + End-of-Course', 'flight',
     'Mock checkride — AO V-X; §61.39 endorsement.', 'Recommended for practical test.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_spa_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-SOLO-TO-LDG-NT', '10 solo T/O-Ldg at non-towered airport, ≥3 full-stop', 'Meet §61.313(a)(4).', 'Logged.', 'must_pass'),
    (2, 'LI-SOLO-XC-75NM', 'Solo XC ≥75 NM, 2 points, 25-NM seg', 'Meet §61.313(a)(5).', 'Logged.', 'must_pass'),
    (3, 'LI-DUAL-XC-2HR', '2 hrs dual XC', 'Meet §61.313(a)(3).', 'Logged.', 'must_pass'),
    (4, 'LI-PRE-TEST-2HR', '2 hrs pre-test training in 2 cal months', 'Meet §61.313(a)(6).', 'Logged.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_spa_id and l.stage_id = st_id;

  -- ============================================================================
  -- 7. REC-A — Recreational Pilot, Airplane (§61.99)
  -- ============================================================================
  -- Regulatory basis : 14 CFR §61.96–§61.101.
  -- PTS              : FAA-S-8081-3B (Recreational Pilot, Nov 2023).
  -- Stages           : S1 Pre-Solo through First Solo,
  --                    S2 Local Ops & Checkride Prep.
  -- Hours floor      : 30 total / 15 dual / 3 solo; 2 hrs dual to airport >25 NM;
  --                    1 hr solo T/O-Ldg at airport other than departure;
  --                    3 hrs pre-test training in preceding 2 cal months.
  -- Privilege limits (§61.101) applied throughout:
  --   * ≤50 NM from departure airport (without §61.101(c) XC endorsement)
  --   * ≤10,000 MSL
  --   * Day VFR only
  --   * 1 passenger max
  --   * ≤180 HP single-engine airplane
  --   * No retractable gear, no constant-speed prop, no flaps-not-
  --     adjustable-in-flight UNLESS specifically endorsed
  --   * No airspace requiring ATC communication (§61.101(d) endorsement
  --     removes this restriction)
  -- Design notes     : Post-certification privilege expansions are NOT
  --                    modeled as optional stages within REC-A. They are
  --                    separate ADD-ON COURSES:
  --                      REC-XC-ADDON   §61.101(c) XC privileges
  --                      REC-CB-ADDON   §61.101(d) controlled-airspace
  --                    Why? Because each has its own checkride-equivalent
  --                    endorsement sign-off, its own hour floor, and its
  --                    own gradebook track. Modeling them as separate
  --                    courses keeps the REC-A certification clean and
  --                    gives the post-cert work first-class treatment.
  --                    The add-on courses are NOT seeded by this migration;
  --                    they'll come in a later phase as demand warrants.
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    c_reca_id, null, 'REC-A',
    'Recreational Pilot — Airplane',
    'recreational_pilot',
    E'Reference Recreational Pilot Airplane syllabus under 14 CFR §61.96–§61.101. Practical-test standard FAA-S-8081-3B (Nov 2023). Two stages: Pre-Solo through First Solo, and Local Operations & Checkride Prep. Total minimum 30 hours per §61.99. Derived from a truncation of the PPL-A approach to the §61.101 privilege set (≤50 NM, ≤180 HP, day VFR, non-controlled airspace). Post-cert §61.101(c) XC and §61.101(d) airspace endorsements are delivered as separate add-on courses (REC-XC-ADDON, REC-CB-ADDON). Fork before use.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels,
    minimum_hours, default_plan_cadence_hours_per_week, notes, published_at
  ) values (
    cv_reca_id, c_reca_id, null, 'v1.0 (Reference)', 'absolute_ipm', 3,
    '{"total":30,"dual":15,"solo":3,"dual_to_airport_over_25NM":2,"solo_to_ldgs_other_airport":1,"pre_test_prep":3,"ground":null}'::jsonb,
    4,
    'Seeded reference version from Phase 2 REC-A syllabus.', now()
  ) on conflict (id) do nothing;

  -- S1 Pre-Solo
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_reca_id, 1, 'S1', 'Pre-Solo through First Solo',
    'Airplane systems, four fundamentals, T/O and landings, slow flight, stalls, ground reference, emergencies, pre-solo knowledge test, first solo, pattern consolidation.',
    'Pre-solo knowledge test passed; first solo complete.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_reca_id, st_id, 1, 'REC1-G-01', 'REC Rules & §61.101 Limits', 'ground',
     'Recreational Pilot privileges and §61.101 limitations (50 NM, 1 passenger, day VFR, ≤10,000 MSL, no controlled airspace, ≤180 HP, no RG/CS-prop/flaps without endorsement).',
     'State rules correctly.', 2.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 2, 'REC1-F-01', 'Introductory Flight / Four Fundamentals', 'flight',
     'Straight-and-level, turns, climbs, descents.', 'Altitude ±150 ft.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 3, 'REC1-F-02', 'Traffic Pattern Operations', 'flight',
     'Normal pattern T/O and landings.', 'Pattern altitude ±100 ft.', 1.2),
    (gen_random_uuid(), null, cv_reca_id, st_id, 4, 'REC1-F-03', 'Slow Flight & Stalls', 'flight',
     'Slow flight, power-off and power-on stalls.', 'Recover with <100 ft loss.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 5, 'REC1-F-04', 'Emergency Procedures', 'flight',
     'Simulated engine failure, field selection.', 'Reasonable field.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 6, 'REC1-SC-01', 'Pre-Solo Stage Check', 'flight',
     'Chief-CFI stage check; A.1/A.2/A.3 issued.', 'Satisfactory.', 1.2),
    (gen_random_uuid(), null, cv_reca_id, st_id, 7, 'REC1-F-05', 'First Solo', 'flight',
     'Three T/O and full-stop landings solo.', 'Safe.', 0.3),
    (gen_random_uuid(), null, cv_reca_id, st_id, 8, 'REC1-F-06', 'Solo Pattern Consolidation', 'flight',
     'Additional solo pattern flights.', 'Logged safely.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_reca_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-PRE-SOLO-TEST', 'Pre-solo knowledge test', 'Pass the pre-solo written.', 'Passed.', 'must_pass'),
    (2, 'LI-STALL-REC', 'Stall recovery', 'Power-off and power-on stalls.', 'Minimum altitude loss.', 'must_pass'),
    (3, 'LI-EMERG-ENGOUT', 'Emergency engine-out', 'Glide and field selection.', 'Reasonable.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_reca_id and l.stage_id = st_id;

  -- S2 Local Ops & Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_reca_id, 2, 'S2', 'Local Operations & Checkride Prep',
    'Complete §61.99 aeronautical experience including 2 hrs dual to airport >25 NM, 1 hr solo T/O-Ldg at airport other than departure, 3 hrs pre-test training in preceding 2 cal months.',
    '§61.99(b)(1)-(4) satisfied; §61.39 recommendation issued.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_reca_id, st_id, 1, 'REC2-G-01', 'Local Navigation Planning', 'ground',
     'Sectional use, pilotage/DR, weather, fuel reserves within 50-NM op area.', 'Plans 30-NM route.', 1.5),
    (gen_random_uuid(), null, cv_reca_id, st_id, 2, 'REC2-F-01', 'Dual to Airport >25 NM #1', 'flight',
     'Dual en-route >25 NM.', 'Arrive ±5 min ETA.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 3, 'REC2-F-02', 'Dual to Airport >25 NM #2 + Diversion', 'flight',
     'Second en-route training flight; diversion drill. Completes §61.99(b)(2).', 'Diversion <3 min.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 4, 'REC2-F-03', 'Solo T/O-Ldg at Other Airport (§61.99(b)(3))', 'flight',
     '1 hr solo T/O-Ldg at an airport other than departure.', 'Logged.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 5, 'REC2-F-04', 'Solo in §61.98 AOs', 'flight',
     'Additional solo — maneuvers and pattern within 50-NM area.', 'Cumulative solo ≥3 hrs.', 2.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 6, 'REC2-F-05', 'Pre-Test Flight 1 (§61.99(b)(4))', 'flight',
     'Mock checkride — AO I-IV.', 'PTS standard.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 7, 'REC2-F-06', 'Pre-Test Flight 2 (§61.99(b)(4))', 'flight',
     'Mock checkride — AO V-VII.', 'PTS standard.', 1.0),
    (gen_random_uuid(), null, cv_reca_id, st_id, 8, 'REC2-F-07', 'Pre-Test Flight 3 + End-of-Course', 'flight',
     'Full oral + flight; §61.39 endorsement.', 'Recommended for practical test.', 1.0);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_reca_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-DUAL-25NM-2HR', '2 hrs dual >25 NM', 'Meet §61.99(b)(2).', 'Logged.', 'must_pass'),
    (2, 'LI-SOLO-OTHER-AP-1HR', '1 hr solo T/O-Ldg other airport', 'Meet §61.99(b)(3).', 'Logged.', 'must_pass'),
    (3, 'LI-SOLO-3HR', '3 hrs solo in §61.98 AOs', 'Meet §61.99(b)(3).', 'Logged.', 'must_pass'),
    (4, 'LI-PRE-TEST-3HR', '3 hrs pre-test training in 2 cal months', 'Meet §61.99(b)(4).', 'Logged.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_reca_id and l.stage_id = st_id;

end;
$fn$;

-- ============================================================================
-- Execute the seed.
-- ----------------------------------------------------------------------------
-- The function is idempotent (see IDEMPOTENCY in header) so this SELECT is
-- safe to run whether this migration is applied for the first time or
-- re-applied on a database that already contains the seed.
-- ============================================================================
select public.fn_phase2_seed_courses();

-- Atomic commit — if any INSERT above failed, the transaction rolled back
-- and none of the 7 courses were created.
commit;
