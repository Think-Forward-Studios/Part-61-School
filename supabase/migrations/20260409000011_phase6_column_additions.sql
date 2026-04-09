-- Phase 6 migration (part 2): additive columns on existing Phase 5 tables.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000011_phase6_column_additions.sql.
--
-- All columns are either nullable or have defaults so no data migration
-- is required. This migration purposely touches only columns — new tables
-- (lesson_override, training_record_audit_exception,
-- student_progress_forecast_cache) land in a later Phase 6 migration.
--
-- Requirements covered:
--   SYL-16 lesson.prerequisite_lesson_ids
--   SYL-18 / SCH-11 lesson.required_instructor_qualifications,
--                    required_instructor_currencies,
--                    required_student_qualifications,
--                    required_aircraft_equipment,
--                    required_aircraft_type,
--                    required_sim_kind
--   SYL-20 lesson.max_repeats, line_item.max_repeats
--   SYL-21 course_version.minimum_hours (backfill happens in a later
--          Phase 6 migration; column added here with empty default)
--   SYL-22 course_version.default_plan_cadence_hours_per_week,
--          student_course_enrollment.plan_cadence_hours_per_week

-- lesson: prerequisite + qualification + resource columns
alter table public.lesson
  add column prerequisite_lesson_ids uuid[] not null default '{}'::uuid[],
  add column required_instructor_qualifications jsonb not null default '[]'::jsonb,
  add column required_instructor_currencies jsonb not null default '[]'::jsonb,
  add column required_student_qualifications jsonb not null default '[]'::jsonb,
  add column required_aircraft_equipment jsonb not null default '[]'::jsonb,
  add column required_aircraft_type text,
  add column required_sim_kind text,
  add column max_repeats int;

-- line_item: per-line-item repeat limit
alter table public.line_item
  add column max_repeats int;

-- course_version: FAA minimums + default plan cadence
alter table public.course_version
  add column minimum_hours jsonb,
  add column default_plan_cadence_hours_per_week numeric(5,2) not null default 4;

-- student_course_enrollment: per-enrollment cadence override (nullable;
-- falls back to course_version.default_plan_cadence_hours_per_week)
alter table public.student_course_enrollment
  add column plan_cadence_hours_per_week numeric(5,2);
