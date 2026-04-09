-- 0020_phase5_seed_courses.sql
-- Phase 5 Plan 02 — seed 3 system courses as school_id=null catalog
-- entries: Private Pilot, Instrument Rating, Commercial Single-Engine.
--
-- Derived from publicly-available Louisiana Tech University / Auburn
-- University School of Aviation / University of Alabama aviation
-- program TCOs and the FAA Airman Certification Standards
-- (PPL-A FAA-S-ACS-6B, IR-A FAA-S-ACS-8C, Comm-A FAA-S-ACS-7A).
-- Structural reference only — not verbatim copies. Each course
-- description cites the source and tells schools to fork + customize.
--
-- Quality bar: minimum-viable starting point for a school to fork via
-- clone_course_version and edit, not a comprehensive course. Partner
-- schools are expected to customize every line item before using in
-- production training.
--
-- Grading scale: absolute_ipm (Introduce / Practice / Perform / Mastered)
-- on all three courses — most common Part 61 scale.
--
-- Depth: 3-level (Stage -> Lesson -> LineItem). No course_phase or unit
-- rows for the seeds — schools can add them when they fork.
--
-- published_at = now() so the seed versions are immediately forkable
-- (clone_course_version works against any course_version regardless of
-- published state; it creates drafts).
--
-- Because course.school_id is a nullable FK to public.schools, the
-- TRUNCATE schools CASCADE at the top of supabase/seed.sql WILL wipe
-- these rows on `supabase db reset`. We encapsulate the entire seed
-- operation inside a reusable function public.fn_phase5_seed_courses()
-- which both this migration and supabase/seed.sql call. Idempotent
-- via ON CONFLICT (id) DO NOTHING on course (fixed UUIDs).
--
-- No banned terms in user-facing text. Use "required / recommended /
-- authorized / sanctioned" rather than "approved". CFR section
-- citations (e.g. §61.109) are citations, not banned terms.

begin;

create or replace function public.fn_phase5_seed_courses()
returns void
language plpgsql
as $fn$
declare
  -- Fixed catalog UUIDs so seed.sql can re-insert idempotently.
  cv_ppl_id  uuid;
  cv_ir_id   uuid;
  cv_csel_id uuid;
  st_id      uuid;
  le_id      uuid;
  exists_count integer;
begin
  -- Short-circuit if seed already present (idempotent).
  select count(*) into exists_count
    from public.course
   where id in ('55555555-5555-5555-5555-555555555551'::uuid,
                '55555555-5555-5555-5555-555555555552'::uuid,
                '55555555-5555-5555-5555-555555555553'::uuid);
  if exists_count = 3 then
    return;
  end if;

  -- ============================================================================
  -- Course 1: Private Pilot (PPL-SE)
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    '55555555-5555-5555-5555-555555555551'::uuid,
    null,
    'PPL-SE',
    'Private Pilot — Airplane Single-Engine Land',
    'private_pilot',
    E'Reference Private Pilot syllabus for single-engine land. Derived from publicly-available Louisiana Tech / Auburn University / University of Alabama TCO materials and the FAA Private Pilot — Airplane ACS (FAA-S-ACS-6B). Structured as a minimum-viable starting point: schools should fork and customize every lesson and line item before using in training. Three stages: Pre-Solo, Cross-Country & Night, Checkride Prep.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels, notes, published_at
  ) values (
    '55555555-5555-5555-5555-55555555551a'::uuid,
    '55555555-5555-5555-5555-555555555551'::uuid,
    null,
    'v1.0 (Reference)',
    'absolute_ipm',
    3,
    'Seeded reference version. Fork via clone_course_version to customize.',
    now()
  )
  on conflict (id) do nothing
  returning id into cv_ppl_id;

  if cv_ppl_id is null then
    select id into cv_ppl_id from public.course_version
      where id = '55555555-5555-5555-5555-55555555551a'::uuid;
  end if;

  -- Stage 1: Pre-Solo
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_ppl_id, 1, 'S1', 'Pre-Solo',
    'Develop core aircraft control, normal & emergency procedures, and traffic pattern operations required to fly the aircraft solo.',
    'Student demonstrates safe solo flight in the local traffic pattern with consistent airspeed control, stabilized approaches, and sound judgment on go/no-go decisions.')
  returning id into st_id;

  -- Stage 1 lessons (9)
  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_ppl_id, st_id, 1, 'L1-01', 'Introduction & Preflight', 'ground',
     'Introduce the training course, documents, preflight inspection and aircraft systems overview.', 'Student can conduct a full preflight unassisted.', 1.5),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 2, 'L1-02', 'Ground Operations & Taxiing', 'flight',
     'Taxi, run-up, radio communications at an untowered field.', 'Safe taxi and clear radio calls.', 1.2),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 3, 'L1-03', 'Four Fundamentals', 'flight',
     'Straight-and-level, climbs, descents, turns (PA.IV.A, B, C).', 'Maintain assigned altitude ±150 ft and heading ±15°.', 1.3),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 4, 'L1-04', 'Slow Flight & Stall Awareness', 'flight',
     'Slow flight, power-on and power-off stalls (PA.VII.A, B).', 'Recognize stall cues and recover with minimum altitude loss.', 1.3),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 5, 'L1-05', 'Ground Reference Maneuvers', 'flight',
     'Rectangular course, S-turns, turns around a point (PA.V.B, C, D).', 'Maintain ground track with wind correction.', 1.2),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 6, 'L1-06', 'Emergency Procedures', 'flight',
     'Simulated engine failure, emergency descents, systems malfunctions (PA.IX.A-C).', 'Demonstrate glide to field selection and checklist use.', 1.3),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 7, 'L1-07', 'Traffic Pattern Operations', 'flight',
     'Normal & crosswind takeoffs and landings (PA.IV.A, B).', 'Consistent pattern altitude and stabilized approach.', 1.4),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 8, 'L1-08', 'Pre-Solo Review', 'flight',
     'Comprehensive review of maneuvers and emergency procedures required for solo per §61.87.', 'Ready for pre-solo knowledge test and solo endorsement.', 1.5),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 9, 'L1-09', 'First Solo', 'flight',
     'First supervised solo in the local traffic pattern per §61.87(n).', 'Three safe takeoffs and full-stop landings solo.', 1.0);

  -- Add 4-5 line items to each lesson in Stage 1
  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_ppl_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Aircraft documents & airworthiness check', 'Identify ARROW documents and airworthiness status.', 'Verbal walkthrough correct.', 'required'),
    (2, 'LI-B', 'Preflight inspection',                     'Complete checklist-driven preflight.',             'No missed items.',      'required'),
    (3, 'LI-C', 'Engine start & run-up',                    'Start and run-up per POH.',                        'Checklist discipline.', 'required'),
    (4, 'LI-D', 'Radio communications',                     'Untowered and towered radio calls.',               'Clear and concise.',    'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_ppl_id and l.stage_id = st_id;

  -- Stage 2: Cross-Country & Night
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_ppl_id, 2, 'S2', 'Cross-Country & Night',
    'Develop navigation by pilotage / dead reckoning / radio nav, night operations, and solo cross-country skills required by §61.109(a).',
    'Student completes required solo cross-country hours and night training with sound flight planning and in-flight decision making.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_ppl_id, st_id, 1, 'L2-01', 'Dual Cross-Country Introduction', 'flight',
     'First dual XC by pilotage and dead reckoning (PA.VI.A, B).', 'Accurate navigation log and ETE.', 2.0),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 2, 'L2-02', 'Radio Navigation (VOR / GPS)', 'flight',
     'VOR intercepts and GPS direct navigation (PA.VI.C).', 'Correctly track and intercept courses.', 1.5),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 3, 'L2-03', 'Night Introduction', 'flight',
     'Night takeoffs, landings and local operations (PA.III.C).', 'Safe pattern operations after dark.', 1.4),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 4, 'L2-04', 'Night Cross-Country', 'flight',
     'Required dual night XC >100 NM per §61.109(a)(2).', 'Meets hour and distance requirements.', 2.5),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 5, 'L2-05', 'Hood Work — Basic Instruments', 'flight',
     '3 hours of simulated instrument training required by §61.109(a)(3).', 'Maintain altitude and heading by reference to instruments.', 1.5),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 6, 'L2-06', 'Solo Cross-Country (Short)', 'flight',
     'Solo XC within 50 NM per §61.93.', 'Completed per plan, no safety issues.', 2.0),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 7, 'L2-07', 'Solo Cross-Country (Long)', 'flight',
     'Solo XC >150 NM with landings at 3 points per §61.109(a)(5).', 'Meets distance requirement.', 4.0),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 8, 'L2-08', 'Cross-Country Review', 'flight',
     'Review weather decision-making and XC procedures.', 'Sound go/no-go rationale.', 1.5),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 9, 'L2-09', 'Stage 2 Progress Check', 'flight',
     'End-of-stage progress check.', 'Pass stage 2 standards.', 1.3);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_ppl_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Flight planning & weight/balance', 'Create navlog and W&B.',      'Accurate.',        'required'),
    (2, 'LI-B', 'Weather briefing & decision',      'Brief and document go/no-go.', 'Documented.',     'required'),
    (3, 'LI-C', 'In-flight diversion',              'Execute diversion to alternate.','Within 5 NM.',  'must_pass'),
    (4, 'LI-D', 'Lost procedures',                  'Four Cs for lost procedure.',  'Correct actions.','required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_ppl_id and l.stage_id = st_id;

  -- Stage 3: Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_ppl_id, 3, 'S3', 'Checkride Prep',
    'Polish all ACS tasks to practical test standard and complete the §61.39 endorsements required for the practical test.',
    'Student passes an end-of-course mock checkride to ACS standards and is recommended for the practical test.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_ppl_id, st_id, 1, 'L3-01', 'Short & Soft Field Operations', 'flight',
     'Short-field and soft-field takeoffs and landings (PA.IV.E, F, G, H).', 'ACS tolerances met.', 1.4),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 2, 'L3-02', 'Power-Off 180 & Precision Approaches', 'flight',
     'Power-off 180 accuracy landing (private-pilot task).', 'Touchdown within designated area.', 1.3),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 3, 'L3-03', 'Steep Turns & Performance Maneuvers', 'flight',
     'Steep turns to ACS tolerance (PA.V.A).', 'Bank ±5°, altitude ±100 ft.', 1.3),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 4, 'L3-04', 'ACS Oral Review', 'oral',
     'Full oral exam review covering all ACS areas.', 'Ready for checkride oral.', 2.0),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 5, 'L3-05', 'Mock Checkride', 'flight',
     'Full simulated practical test under §61.39.', 'Pass at ACS standard.', 2.0),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 6, 'L3-06', 'Knowledge Test Prep', 'ground',
     'Review for FAA knowledge test.', 'Achieve 80% on practice exam.', 2.0),
    (gen_random_uuid(), null, cv_ppl_id, st_id, 7, 'L3-07', 'End-of-Course Check', 'flight',
     'Final end-of-course check and §61.39 sign-off.', 'Recommended for practical test.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_ppl_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Preflight preparation & aeromedical', 'ACS Area I.',  'Correct.',      'required'),
    (2, 'LI-B', 'Airworthiness requirements',          'ACS Area I.B.','Correct.',      'required'),
    (3, 'LI-C', 'Performance and limitations',         'ACS Area II.', 'Calculations.', 'must_pass'),
    (4, 'LI-D', 'Operation of systems',                'ACS Area II.', 'System Q&A.',   'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_ppl_id and l.stage_id = st_id;

  -- ============================================================================
  -- Course 2: Instrument Rating (IR-SE)
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    '55555555-5555-5555-5555-555555555552'::uuid,
    null,
    'IR-SE',
    'Instrument Rating — Airplane Single-Engine',
    'instrument_rating',
    E'Reference Instrument Rating syllabus for airplane single-engine. Derived from publicly-available Louisiana Tech / Auburn University TCO materials and the FAA Instrument Rating — Airplane ACS (FAA-S-ACS-8C). Minimum-viable starting point; schools should fork and customize before use. Three stages: Basic Attitude Instrument Flying, Navigation & Approaches, Checkride Prep.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels, notes, published_at
  ) values (
    '55555555-5555-5555-5555-55555555552a'::uuid,
    '55555555-5555-5555-5555-555555555552'::uuid,
    null,
    'v1.0 (Reference)',
    'absolute_ipm',
    3,
    'Seeded reference version. Fork via clone_course_version to customize.',
    now()
  )
  on conflict (id) do nothing
  returning id into cv_ir_id;

  if cv_ir_id is null then
    select id into cv_ir_id from public.course_version
      where id = '55555555-5555-5555-5555-55555555552a'::uuid;
  end if;

  -- IR Stage 1: Basic Attitude Instrument Flying
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_ir_id, 1, 'S1', 'Basic Attitude Instrument Flying',
    'Establish attitude instrument flying scan, control, and performance.',
    'Student flies full panel and partial panel within IR-A ACS tolerances.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_ir_id, st_id, 1, 'L1-01', 'Instrument Cockpit Check & Scan', 'ground', 'Attitude instrument flying scan fundamentals.', 'Explain scan.', 1.5),
    (gen_random_uuid(), null, cv_ir_id, st_id, 2, 'L1-02', 'Straight & Level, Turns', 'flight', 'Basic attitude flying full panel.', 'Hold altitude ±100 ft.', 1.3),
    (gen_random_uuid(), null, cv_ir_id, st_id, 3, 'L1-03', 'Climbs & Descents', 'flight', 'Climbs, descents, airspeed transitions.', 'Hold target airspeeds.', 1.3),
    (gen_random_uuid(), null, cv_ir_id, st_id, 4, 'L1-04', 'Partial Panel', 'flight', 'Scan and control with failed instruments.', 'Recover from unusual attitudes.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 5, 'L1-05', 'Unusual Attitude Recovery', 'flight', 'Nose-high and nose-low recoveries.', 'Correct control inputs.', 1.3),
    (gen_random_uuid(), null, cv_ir_id, st_id, 6, 'L1-06', 'Basic Instrument Review', 'flight', 'Review all Stage 1 maneuvers.', 'Meets Stage 1 standards.', 1.4);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_ir_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Instrument scan',      'Correct scan pattern.',   'Demonstrated.', 'required'),
    (2, 'LI-B', 'Altitude control',     'Maintain ±100 ft.',       'Demonstrated.', 'required'),
    (3, 'LI-C', 'Heading control',      'Maintain ±10°.',          'Demonstrated.', 'required'),
    (4, 'LI-D', 'Unusual attitude recovery','Partial panel recovery.','Demonstrated.','must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_ir_id and l.stage_id = st_id;

  -- IR Stage 2: Navigation & Approaches
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_ir_id, 2, 'S2', 'Navigation & Approaches',
    'Develop IFR navigation, departures, arrivals, holds, and the three IR-A required approach types (precision, non-precision, and a circling as authorized).',
    'Student flies precision and non-precision approaches to ACS standards.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_ir_id, st_id, 1, 'L2-01', 'IFR Navigation — VOR / GPS', 'flight', 'Enroute IFR navigation.', 'Within 3/4 scale CDI.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 2, 'L2-02', 'Holding Procedures', 'flight', 'Standard hold entry, timing, wind corrections.', 'Correct entry and timing.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 3, 'L2-03', 'ILS Precision Approaches', 'flight', 'ILS with missed approach.', 'Within 1 dot of localizer/glideslope.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 4, 'L2-04', 'LPV / RNAV Approaches', 'flight', 'RNAV (GPS) approach with vertical guidance.', 'Within ACS tolerances.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 5, 'L2-05', 'VOR / LOC Non-Precision', 'flight', 'Non-precision approach procedures.', 'MDA and timing correct.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 6, 'L2-06', 'Circling Approach', 'flight', 'Circle-to-land at Category A minimums.', 'Safe and legal.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 7, 'L2-07', 'IFR Cross-Country', 'flight', 'Long IFR XC required by §61.65(d)(2)(ii) (≥250 NM).', 'Meets hour and distance requirement.', 3.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_ir_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Approach briefing',         'Brief approach plate.',       'Complete.',  'required'),
    (2, 'LI-B', 'Approach execution',        'Fly approach to minimums.',   'Within tol.','must_pass'),
    (3, 'LI-C', 'Missed approach procedure', 'Fly missed as published.',    'Correct.',   'must_pass'),
    (4, 'LI-D', 'ATC communications (IFR)',  'Clear and compliant comms.',  'Clear.',     'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_ir_id and l.stage_id = st_id;

  -- IR Stage 3: Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_ir_id, 3, 'S3', 'Checkride Prep',
    'Polish all IR-A ACS tasks to practical test standard.',
    'Student passes mock checkride and is recommended for the IR-A practical test per §61.39.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_ir_id, st_id, 1, 'L3-01', 'Partial Panel Approaches', 'flight', 'Partial panel approach to minimums.', 'Within ACS.', 1.5),
    (gen_random_uuid(), null, cv_ir_id, st_id, 2, 'L3-02', 'Emergencies in IMC', 'flight', 'Vacuum failure, partial panel, loss of comms.', 'Correct procedures.', 1.4),
    (gen_random_uuid(), null, cv_ir_id, st_id, 3, 'L3-03', 'ACS Oral Review', 'oral', 'Full oral prep for IR-A.', 'Ready for oral.', 2.0),
    (gen_random_uuid(), null, cv_ir_id, st_id, 4, 'L3-04', 'Mock Checkride', 'flight', 'Full simulated IR practical.', 'Pass.', 2.0),
    (gen_random_uuid(), null, cv_ir_id, st_id, 5, 'L3-05', 'End-of-Course Check', 'flight', 'Final end-of-course check.', 'Recommended for checkride.', 1.5),
    (gen_random_uuid(), null, cv_ir_id, st_id, 6, 'L3-06', 'Knowledge Test Prep', 'ground', 'Review for IR knowledge test.', '80% practice exam.', 2.0),
    (gen_random_uuid(), null, cv_ir_id, st_id, 7, 'L3-07', 'Stage 3 Progress Check', 'flight', 'Stage-level progress check.', 'Pass Stage 3.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_ir_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Regulations & IFR planning', 'ACS Area I.', 'Correct.', 'required'),
    (2, 'LI-B', 'Weather information',        'ACS Area I.', 'Correct.', 'required'),
    (3, 'LI-C', 'Cross-country flight planning','ACS Area I.','Correct.','required'),
    (4, 'LI-D', 'Aircraft systems related to IFR ops','ACS Area I.','Correct.','required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_ir_id and l.stage_id = st_id;

  -- ============================================================================
  -- Course 3: Commercial Single-Engine (CSEL)
  -- ============================================================================
  insert into public.course (id, school_id, code, title, rating_sought, description)
  values (
    '55555555-5555-5555-5555-555555555553'::uuid,
    null,
    'CSEL',
    'Commercial Pilot — Airplane Single-Engine Land',
    'commercial_single_engine',
    E'Reference Commercial Pilot syllabus for airplane single-engine land. Derived from publicly-available Louisiana Tech / Auburn University / University of Alabama TCO materials and the FAA Commercial Pilot — Airplane ACS (FAA-S-ACS-7A). Minimum-viable starting point; schools should fork and customize before use. Three stages: Commercial Maneuvers, Cross-Country & Complex Ops, Checkride Prep.'
  )
  on conflict (id) do nothing;

  insert into public.course_version (
    id, course_id, school_id, version_label, grading_scale, min_levels, notes, published_at
  ) values (
    '55555555-5555-5555-5555-55555555553a'::uuid,
    '55555555-5555-5555-5555-555555555553'::uuid,
    null,
    'v1.0 (Reference)',
    'absolute_ipm',
    3,
    'Seeded reference version. Fork via clone_course_version to customize.',
    now()
  )
  on conflict (id) do nothing
  returning id into cv_csel_id;

  if cv_csel_id is null then
    select id into cv_csel_id from public.course_version
      where id = '55555555-5555-5555-5555-55555555553a'::uuid;
  end if;

  -- CSEL Stage 1: Commercial Maneuvers
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_csel_id, 1, 'S1', 'Commercial Maneuvers',
    'Develop precision in commercial maneuvers (chandelles, lazy-8s, eights-on-pylons, steep spirals).',
    'Student flies all commercial maneuvers to Comm-A ACS standards.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_csel_id, st_id, 1, 'L1-01', 'Chandelles', 'flight', 'Chandelle technique (CA.V.A).', 'Within ACS tolerances.', 1.3),
    (gen_random_uuid(), null, cv_csel_id, st_id, 2, 'L1-02', 'Lazy-8s', 'flight', 'Lazy-8 technique (CA.V.B).', 'Symmetrical and coordinated.', 1.3),
    (gen_random_uuid(), null, cv_csel_id, st_id, 3, 'L1-03', 'Steep Spirals', 'flight', 'Steep spiral technique (CA.V.C).', 'Correct wind correction.', 1.3),
    (gen_random_uuid(), null, cv_csel_id, st_id, 4, 'L1-04', 'Eights-On-Pylons', 'flight', 'Eights-on-pylons technique (CA.V.D).', 'Pivotal altitude held.', 1.4),
    (gen_random_uuid(), null, cv_csel_id, st_id, 5, 'L1-05', 'Steep Turns', 'flight', 'Commercial steep turns (CA.V.E).', 'Within ±5° bank, ±100 ft.', 1.2),
    (gen_random_uuid(), null, cv_csel_id, st_id, 6, 'L1-06', 'Stage 1 Progress Check', 'flight', 'Stage 1 end-of-stage check.', 'Meets Stage 1 standards.', 1.3);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_csel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Entry airspeed & altitude', 'Enter maneuver correctly.', 'Within ±5 KIAS.', 'required'),
    (2, 'LI-B', 'Maneuver symmetry',          'Symmetric profile.',        'Demonstrated.',   'required'),
    (3, 'LI-C', 'Coordination',               'Ball centered.',            'Demonstrated.',   'required'),
    (4, 'LI-D', 'Recovery',                   'Recover to cruise.',        'Clean recovery.', 'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_csel_id and l.stage_id = st_id;

  -- CSEL Stage 2: Cross-Country & Complex Ops
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_csel_id, 2, 'S2', 'Cross-Country & Complex Operations',
    'Complete the §61.129(a) cross-country requirements (day/night long XC, complex/TAA operations).',
    'Student completes all §61.129 aeronautical experience and flies complex/TAA operations safely.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_csel_id, st_id, 1, 'L2-01', 'Day XC ≥100 NM Straight Line', 'flight', 'Required day XC per §61.129(a)(3)(ii).', 'Meets distance and hour.', 2.5),
    (gen_random_uuid(), null, cv_csel_id, st_id, 2, 'L2-02', 'Night XC ≥100 NM Straight Line', 'flight', 'Required night XC per §61.129(a)(3)(iii).', 'Meets distance and hour.', 2.5),
    (gen_random_uuid(), null, cv_csel_id, st_id, 3, 'L2-03', 'Solo Long XC ≥300 NM / 3 Points', 'flight', 'Solo or dual long XC per §61.129(a)(3)(iv).', 'Meets requirement.', 5.0),
    (gen_random_uuid(), null, cv_csel_id, st_id, 4, 'L2-04', 'Complex / TAA Operations', 'flight', '10 hours complex/TAA per §61.129(a)(3)(ii).', 'Meets hour requirement.', 2.0),
    (gen_random_uuid(), null, cv_csel_id, st_id, 5, 'L2-05', 'Systems Management', 'ground', 'Complex / TAA systems review.', 'Verbal Q&A correct.', 1.5),
    (gen_random_uuid(), null, cv_csel_id, st_id, 6, 'L2-06', 'Stage 2 Progress Check', 'flight', 'End-of-stage check.', 'Pass Stage 2.', 1.3);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_csel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'XC planning',             'Full navlog and W&B.',         'Accurate.',   'required'),
    (2, 'LI-B', 'Risk management',         'PAVE + personal minimums.',    'Documented.', 'required'),
    (3, 'LI-C', 'Complex systems handling','Gear / flaps / prop / cowl.',  'Correct.',    'must_pass'),
    (4, 'LI-D', 'Emergency procedures',    'Gear failure, engine out.',    'Correct.',    'must_pass')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_csel_id and l.stage_id = st_id;

  -- CSEL Stage 3: Checkride Prep
  insert into public.stage (id, school_id, course_version_id, position, code, title, objectives, completion_standards)
  values (gen_random_uuid(), null, cv_csel_id, 3, 'S3', 'Checkride Prep',
    'Polish all Comm-A ACS tasks to practical test standard.',
    'Student passes mock checkride and is recommended for Comm-A practical test per §61.39.')
  returning id into st_id;

  insert into public.lesson (id, school_id, course_version_id, stage_id, position, code, title, kind, objectives, completion_standards, min_hours)
  values
    (gen_random_uuid(), null, cv_csel_id, st_id, 1, 'L3-01', 'Short & Soft Field Ops', 'flight', 'Short / soft field TO and LDG.', 'ACS tolerances.', 1.4),
    (gen_random_uuid(), null, cv_csel_id, st_id, 2, 'L3-02', 'Power-Off 180 Accuracy Landing', 'flight', 'Power-off 180 accuracy (CA.IV.M).', 'Touchdown within designated area.', 1.3),
    (gen_random_uuid(), null, cv_csel_id, st_id, 3, 'L3-03', 'Emergency Descent', 'flight', 'Emergency descent procedure (CA.IX.B).', 'Rapid and safe.', 1.2),
    (gen_random_uuid(), null, cv_csel_id, st_id, 4, 'L3-04', 'ACS Oral Review', 'oral', 'Full Comm-A oral prep.', 'Ready for oral.', 2.0),
    (gen_random_uuid(), null, cv_csel_id, st_id, 5, 'L3-05', 'Mock Checkride', 'flight', 'Full simulated practical test.', 'Pass.', 2.0),
    (gen_random_uuid(), null, cv_csel_id, st_id, 6, 'L3-06', 'End-of-Course Check', 'flight', 'Final end-of-course check and sign-off.', 'Recommended for practical test.', 1.5);

  insert into public.line_item (school_id, course_version_id, lesson_id, position, code, title, objectives, completion_standards, classification)
  select null, cv_csel_id, l.id, li.pos, li.code, li.title, li.obj, li.cs, li.cls::public.line_item_classification
  from public.lesson l
  cross join lateral (values
    (1, 'LI-A', 'Commercial privileges & limitations', 'ACS Area I.',  'Correct.',     'required'),
    (2, 'LI-B', 'Airworthiness & documents',           'ACS Area I.B.','Correct.',     'required'),
    (3, 'LI-C', 'Performance and limitations',         'ACS Area II.', 'Calculations.','must_pass'),
    (4, 'LI-D', 'Systems & aeromedical',               'ACS Area II.', 'Correct.',     'required')
  ) as li(pos, code, title, obj, cs, cls)
  where l.course_version_id = cv_csel_id and l.stage_id = st_id;

end
$fn$;

-- Run it now as part of the migration.
select public.fn_phase5_seed_courses();

commit;
