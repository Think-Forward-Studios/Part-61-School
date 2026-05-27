-- =============================================================================
-- Migration: 0046_duty_hour_warning_safety_critical.sql
-- =============================================================================
-- Flips notification_default_by_role.is_safety_critical = true for the
-- duty_hour_warning event kind across every role/channel combo that
-- already had a row seeded in migration 0032.
--
-- Rationale: §61.51(a) duty-hour limits exist precisely because tired
-- pilots / instructors cause accidents. A duty-hour warning is the
-- system telling the operator "if this continues you're going to be
-- legal-but-unsafe." That's a safety event — it belongs alongside
-- overdue_aircraft and grounded_aircraft_attempted_use.
--
-- Effect:
--   * The in-app delivery channel becomes non-disable-able for these
--     rows (the UI tickbox is locked; the helper at
--     packages/api/src/helpers/notifications.ts always inserts the
--     in_app row even if the user has it off).
--   * Email STILL respects the user's pref — explicit literal reading
--     of CONTEXT + RESEARCH Q6 (see notifications.ts header comment).
--     If a school later wants to force email too, the single
--     choke-point is that helper.
--   * The /profile/notifications UI labels the row with a red
--     'Safety' chip via the same is_safety_critical column.
--
-- Idempotent — no-op on a clean install where the rows might be
-- pre-seeded with true.
-- =============================================================================

update public.notification_default_by_role
   set is_safety_critical = true
 where kind = 'duty_hour_warning';
