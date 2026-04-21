-- =============================================================================
-- Migration: 20260418000001_phase2_rating_sought_additions.sql
-- Phase   : Phase 2 — Private Pilot family (ASEL, AMEL, AMEL-AO, PPL-H,
--           PPL-G) + Sport Pilot + Recreational Pilot
-- Author  : Phase 2 syllabus team
-- Date    : 2026-04-18
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
-- -------------------------------------------------------------------
-- 1. Extends the public.course_rating_sought enum with 7 new values
--    (one per Phase 2 rating/course family).
-- 2. Adds two optional, nullable columns to public.course_version:
--      * launch_method_primary  (PPL-G aerotow/ground_launch/self_launch)
--      * mosaic_aligned         (SP-A post-MOSAIC alignment flag)
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------------------------------------------------
-- The existing enum had only the coarse 'private_pilot' value, which is
-- ambiguous — a Private Pilot rating is issued per category/class (ASEL,
-- AMEL, Rotorcraft-Helicopter, Glider, etc.) with materially different
-- hour floors, must-pass items, and ACS/PTS standards. Phase 2 disambiguates
-- so that downstream code (course catalog UI, reporting, rating-based access
-- controls) can reason about the specific pathway a student is on.
--
-- DESIGN DECISIONS
-- -------------------------------------------------------------------
-- * New canonical value 'private_pilot_asel' — new ASEL courses MUST use
--   this. The legacy 'private_pilot' value is NOT dropped; existing rows
--   keyed to it continue to work. A future optional migration (Phase 2B)
--   can re-key legacy rows and deprecate the superset value.
-- * A single 'sport_pilot' value covers all SP categories. Research
--   recommended NOT expanding to 'sport_pilot_airplane' /
--   'sport_pilot_rotorcraft' / etc. — the category/class is carried on
--   course_version.notes / minimum_hours JSON, which avoids enum churn
--   every time FAA adds an SP category post-MOSAIC.
-- * 'private_pilot_amel_addon' is separate from 'private_pilot_amel' so
--   reporting can distinguish §61.109(b) initial (40-hr floor) from
--   §61.63(c) add-on (proficiency-based, no hour floor).
-- * The Rotorcraft-Helicopter enum deliberately includes the 'rotorcraft_'
--   prefix to leave room for a future 'private_pilot_rotorcraft_gyroplane'
--   without collision. Glider does not share this pattern because gliders
--   are their own category, not a class within rotorcraft.
--
-- POSTGRESQL TRANSACTION SEMANTICS (IMPORTANT)
-- -------------------------------------------------------------------
-- * ALTER TYPE ... ADD VALUE is non-transactional in PostgreSQL ≥ 12:
--   each ADD VALUE must run in its own implicit transaction. We therefore
--   DO NOT wrap the 7 ADD VALUEs in BEGIN/COMMIT.
-- * Supabase / Sqitch / custom migration runners must detect this file
--   and run each statement as its own top-level statement. Do NOT batch
--   these with other DDL inside a single transaction block.
-- * IF NOT EXISTS makes the ADD VALUEs idempotent — safe to re-run.
--
-- IDEMPOTENCY
-- -------------------------------------------------------------------
-- * ADD VALUE IF NOT EXISTS        → idempotent.
-- * ADD COLUMN IF NOT EXISTS       → idempotent.
-- * The CHECK constraint on launch_method_primary is defined inline with
--   the column; if the column already exists with a different check, this
--   migration will not overwrite it — operator must inspect manually.
--
-- ROLLBACK
-- -------------------------------------------------------------------
-- Enum values cannot be removed in PostgreSQL without recreating the
-- type and re-casting every column that uses it. We intentionally do not
-- provide a down-migration for the ADD VALUEs. The two new columns CAN
-- be dropped with:
--     alter table public.course_version drop column if exists launch_method_primary;
--     alter table public.course_version drop column if exists mosaic_aligned;
-- but will lose the associated PPL-G launch-method and SP-A MOSAIC flags.
--
-- DOWNSTREAM IMPACT
-- -------------------------------------------------------------------
-- * UI course-catalog filters and any rating-based reporting queries must
--   be updated to include the 7 new values (don't assume 'private_pilot'
--   covers all PPL-family courses going forward).
-- * The seed migration (20260418000002) relies on ALL 7 new values
--   existing. Run this migration first; otherwise the seed will fail on
--   the 'rating_sought' INSERTs with an invalid enum value error.
-- * minimum_hours JSONB was added in 20260409000017_phase6_seed_minimum_hours.sql
--   and is leveraged here without modification.
--
-- REVIEW CHECKLIST (for team reviewers)
-- -------------------------------------------------------------------
-- [ ] Confirm no existing app code string-matches against 'private_pilot'
--     in a way that will silently exclude the new disambiguated values.
-- [ ] Confirm no existing course_version row already uses
--     'launch_method_primary' or 'mosaic_aligned' as column names
--     (ADD COLUMN IF NOT EXISTS will skip silently if so — verify intent).
-- [ ] Confirm the migration runner treats this file as "auto-commit each
--     statement" (see PostgreSQL Transaction Semantics note above).
-- [ ] Sanity-check that 'private_pilot_rotorcraft_helicopter' is the
--     name we want before shipping — it's long but unambiguous.
--
-- RELATED MIGRATIONS
-- -------------------------------------------------------------------
-- * 20260409000003_phase5_course_tree.sql          — defines course /
--     course_version / stage / lesson / line_item schema.
-- * 20260409000007_phase5_seed_courses.sql          — prior seed pattern;
--     the Phase 2 seed migration follows this idiom.
-- * 20260409000017_phase6_seed_minimum_hours.sql   — added
--     course_version.minimum_hours JSONB.
-- * 20260418000002_phase2_seed_courses.sql         — SEEDS the 7 courses
--     that use the new enum values declared here.
-- =============================================================================

-- ----------------------------------------------------------------------
-- 1. course_rating_sought enum additions
-- ----------------------------------------------------------------------
-- One new value per Phase 2 course family. Each ADD VALUE is its own
-- implicit statement — DO NOT wrap in BEGIN/COMMIT (see header).
-- ----------------------------------------------------------------------

-- §61.109(a) — canonical PPL-Airplane-Single-Engine-Land enum. Replaces
-- ambiguous 'private_pilot' for new courses going forward.
alter type public.course_rating_sought add value if not exists 'private_pilot_asel';

-- §61.109(b) — PPL-Airplane-Multi-Engine-Land, INITIAL pathway (40-hr floor).
alter type public.course_rating_sought add value if not exists 'private_pilot_amel';

-- §61.63(c) — AMEL add-on rating (proficiency-based, no hour floor).
-- Separate from _amel so reporting distinguishes initial vs. add-on.
alter type public.course_rating_sought add value if not exists 'private_pilot_amel_addon';

-- §61.109(c) — PPL-Rotorcraft-Helicopter. 'rotorcraft_' prefix leaves
-- headroom for a future 'private_pilot_rotorcraft_gyroplane' value.
alter type public.course_rating_sought add value if not exists 'private_pilot_rotorcraft_helicopter';

-- §61.109(f) — PPL-Glider. Launch method (aerotow / ground-launch /
-- self-launch) is expressed via course_version.launch_method_primary
-- (added below), NOT baked into the enum.
alter type public.course_rating_sought add value if not exists 'private_pilot_glider';

-- §61.301–§61.327 Subpart J — Sport Pilot (single value covering ALL
-- SP categories — airplane, rotorcraft-helicopter, powered-lift,
-- glider, weight-shift-control, powered-parachute, gyroplane).
-- Category-specific differences are captured in course_version.minimum_hours
-- and .notes to avoid enum churn with each post-MOSAIC category add.
alter type public.course_rating_sought add value if not exists 'sport_pilot';

-- §61.96–§61.101 — Recreational Pilot. Privileges capped by §61.101.
-- Post-cert §61.101(c) XC and §61.101(d) airspace endorsements are
-- modeled as SEPARATE add-on courses (REC-XC-ADDON, REC-CB-ADDON) and
-- thus do NOT need their own enum values.
alter type public.course_rating_sought add value if not exists 'recreational_pilot';

-- ----------------------------------------------------------------------
-- 2. course_version optional columns
-- ----------------------------------------------------------------------
-- Additive, nullable — so existing rows are untouched. Both columns are
-- read-opt-in: any consumer that doesn't care can ignore them.
-- ----------------------------------------------------------------------

-- PPL-G launch method. Default course is aerotow; ground-launch and
-- self-launch pathways are delivered as separate fork courses (PPL-G-GL,
-- PPL-G-SL). Keeping this as TEXT with a CHECK rather than a new enum
-- makes it easy to extend if FAA adds a launch method without a DDL change.
alter table public.course_version
  add column if not exists launch_method_primary text
  check (launch_method_primary is null
         or launch_method_primary in ('aerotow','ground_launch','self_launch'));

-- SP-A MOSAIC alignment. MOSAIC pilot privileges are effective 2025-10-22;
-- airworthiness provisions effective 2026-07-24. A course flagged
-- mosaic_aligned = true has been updated to reflect the post-MOSAIC LSA
-- definition (VS1 ≤59 KCAS, up to 4 seats physically present though only
-- 1 passenger carried, RG and CS-prop allowed, electric/hybrid/rotorcraft/
-- powered-lift LSA-eligible). Pre-MOSAIC courses leave this null or false.
alter table public.course_version
  add column if not exists mosaic_aligned boolean;

-- ----------------------------------------------------------------------
-- 3. minimum_hours (no DDL)
-- ----------------------------------------------------------------------
-- course_version.minimum_hours (JSONB) was added in
-- 20260409000017_phase6_seed_minimum_hours.sql. The Phase 2 seed populates
-- it per course using category-appropriate keys:
--   Airplane (ASEL/AMEL/REC-A/SP-A): total, dual, solo, cross_country,
--     night, instrument, solo_cross_country, landings_day, landings_night
--   Rotorcraft-H: adds rotorcraft_helicopter flag
--   Glider: total, dual, solo, total_flights, solo_launches_landings,
--     pre_test_training_flights (no night / instrument for glider)
--   Sport: total, dual, solo, cross_country_dual, solo_cross_country_flight,
--     solo_to_ldg_non_towered, pre_test_prep
-- Consumers should tolerate missing keys — not every pathway uses every
-- key (e.g., §61.63(c) AMEL add-on has all-nulls because it's proficiency-
-- based, not hour-based).
-- ----------------------------------------------------------------------
