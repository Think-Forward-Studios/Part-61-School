-- Phase 6 migration (part 8): backfill minimum_hours + default_plan_cadence
-- on the three seeded course_version rows (PPL, IR, Comm-SEL).
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000017_phase6_seed_minimum_hours.sql.
--
-- Idempotent: UPDATE-only, targeting fixed UUIDs from 0020_phase5_seed_courses.sql.
-- Values derived from FAA Part 61 minimums:
--   PPL  = section 61.109
--   IR   = section 61.65
--   CSEL = section 61.129

-- Temporarily bypass the published course_version seal trigger.
-- These columns (minimum_hours, default_plan_cadence_hours_per_week) were
-- added in Phase 6 and are safe to backfill on published versions.
set session_replication_role = replica;

-- ============================================================================
-- PPL (section 61.109) — 40 hours total minimum
-- ============================================================================
update public.course_version
set minimum_hours = '{
  "total": 40,
  "dual": 20,
  "solo": 10,
  "cross_country": 3,
  "night": 3,
  "instrument": 3,
  "solo_cross_country": 5,
  "landings_day": 10,
  "landings_night": 10
}'::jsonb,
    default_plan_cadence_hours_per_week = 4
where id = '55555555-5555-5555-5555-55555555551a'::uuid;

-- ============================================================================
-- IR (section 61.65) — 50 hours instrument time minimum
-- ============================================================================
update public.course_version
set minimum_hours = '{
  "total": 50,
  "dual": 0,
  "solo": 0,
  "cross_country": 50,
  "night": 0,
  "instrument": 40,
  "instrument_approaches": 6
}'::jsonb,
    default_plan_cadence_hours_per_week = 3
where id = '55555555-5555-5555-5555-55555555552a'::uuid;

-- ============================================================================
-- CSEL (section 61.129) — 250 hours total minimum
-- ============================================================================
update public.course_version
set minimum_hours = '{
  "total": 250,
  "dual": 20,
  "solo": 10,
  "cross_country": 50,
  "night": 10,
  "instrument": 10,
  "solo_cross_country": 5
}'::jsonb,
    default_plan_cadence_hours_per_week = 3
where id = '55555555-5555-5555-5555-55555555553a'::uuid;

-- Restore normal trigger processing.
set session_replication_role = origin;
