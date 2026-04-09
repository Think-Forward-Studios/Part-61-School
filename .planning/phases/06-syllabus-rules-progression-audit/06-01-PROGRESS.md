# Plan 06-01 Progress Note

**Status:** Task 1 of 4 complete. Plan NOT complete. Do not create SUMMARY.md yet.
**Last updated:** 2026-04-09

## Commits Landed (Task 1)

1. `1329fa2` — `feat(06-01): migration 0023 phase 6 enums`
   - `packages/db/migrations/0023_phase6_enums.sql`
   - `supabase/migrations/20260409000010_phase6_enums.sql`
   - Creates `lesson_override_kind`, `audit_exception_kind`,
     `audit_exception_severity` enums, isolated from usage.

2. `068e41a` — `feat(06-01): migration 0024 phase 6 additive columns on lesson/line_item/course_version/enrollment`
   - `packages/db/migrations/0024_phase6_column_additions.sql`
   - `supabase/migrations/20260409000011_phase6_column_additions.sql`
   - `packages/db/src/schema/syllabus.ts` (lesson + line_item + course_version columns)
   - `packages/db/src/schema/enrollment.ts` (plan_cadence_hours_per_week)
   - All columns nullable or defaulted; no data migration required.

## Verification After Task 1

- `pnpm dlx supabase db reset` → clean (all 24 migrations apply)
- `pnpm -r typecheck` → green (6 workspaces)
- `pnpm -r lint` → green (banned-term clean)
- `pnpm --filter @part61/rls-tests test` → **187/187 green** (Phase 1-5 baseline preserved)

## Deviations from the PLAN.md (from user's execution instructions)

The original `06-01-PLAN.md` Task 1 called for FIVE migrations (0023-0027). The
execution prompt explicitly collapsed this into TWO migrations and
instructed: "Task 1 owns 0023 (enums) + 0024 (column additions) — two
migrations only." This progress note follows the execution prompt.

Specifically, these items from the original PLAN.md Task 1 were NOT done and
are pushed into later tasks (to be renumbered accordingly):

- `line_item_grade.rollover_from_grade_sheet_id` column + index (deferred to
  Task 2a alongside the rollover-consuming function work).
- PLAN.md migration numbering 0025/0026/0027 is now unused — the collapsed
  0024 covers course_version + enrollment + line_item columns in one file.

## What's Left in Plan 06-01

### Task 2a — New tables + cross-tenant RLS tests
- `lesson_override` table (mirror Phase 4 `maintenance_overrun` pattern)
- `training_record_audit_exception` table
- `student_progress_forecast_cache` table (mirror Phase 4 `aircraft_downtime_forecast`)
- `line_item_grade.rollover_from_grade_sheet_id` column + partial index (rolled here from Task 1)
- Drizzle schemas: `lessonOverride.ts`, `trainingRecordAuditException.ts`, `studentProgressForecastCache.ts`
- Register new exports in `packages/db/src/schema/index.ts`
- `tests/rls/phase6-rls.test.ts` — cross-tenant deny + hard-delete blocker tests

### Task 2b — SQL functions + views + rollover/race tests
- `packages/db/migrations/0029_phase6_views.sql` — `student_course_minimums_status`, `management_override_activity`
- `packages/db/migrations/0030_phase6_functions.sql` — `is_passing_grade`, six `check_*` functions, `evaluate_lesson_eligibility`, `compute_rollover_line_items`, `suggest_next_activity`
- `tests/rls/phase6-rollover.test.ts`
- `tests/rls/phase6-override-race.test.ts`

### Task 2c — Forecast/audit functions + triggers + pg_cron + seed backfill
- Extend `0030` (or new file) with `student_progress_forecast`, `refresh_student_progress_forecast`, `run_training_record_audit`
- `0031_phase6_triggers.sql` — `flight_log_time` → refresh forecast; cadence mutations → refresh forecast
- `0032_phase6_pg_cron.sql` — `cron.schedule('phase6_nightly_training_record_audit', '0 7 * * *', ...)`
- `0033_phase6_seed_minimums.sql` — backfill PPL / IR / Comm-SEL `minimum_hours` + cadence
- `tests/rls/phase6-pg-cron.test.ts` — cron smoke + audit idempotency

## Reserved Numbering for Continuation

**`packages/db/migrations/` — reserved 0025-0029 (5 slots).** The collapsed
Task 1 only consumed 0023 + 0024. Continuation agents should start new
migrations at **0025**. Suggested mapping:

| Task | Original PLAN # | Reserved # | Content                             |
| ---- | --------------- | ---------- | ----------------------------------- |
| 2a   | 0028            | **0025**   | new tables + `line_item_grade` col  |
| 2b   | 0029            | **0026**   | views                               |
| 2b   | 0030            | **0027**   | SQL functions                       |
| 2c   | 0031            | **0028**   | triggers                            |
| 2c   | 0032            | **0029**   | pg_cron + seed minimums (combinable)|

If more separation is desired the continuation agent can fan out further, but
the originally-planned 11-migration count is no longer required (Task 1
collapsed from 5 files to 2).

**`supabase/migrations/` — reserved 20260409000012 through 20260409000020.**
Task 1 consumed 000010 (enums) and 000011 (column additions). The next
supabase mirror timestamp is **20260409000012**.

## Test Baseline

- **187/187** RLS tests passing
- Runner: `pnpm --filter @part61/rls-tests test`
- Test directory: `tests/rls/` (NOT `packages/db/tests/` as some PLAN.md
  entries imply — those paths in the plan are stale and should be updated to
  `tests/rls/phase6-*.test.ts` when Task 2a lands)

## Schema Tables Still To Create

1. `public.lesson_override` — Phase 4 override pattern; partial unique index
   on `(student_enrollment_id, lesson_id) where consumed_at is null and
   revoked_at is null`; audit + hard-delete blocker.
2. `public.training_record_audit_exception` — unique open exception per
   `(student_enrollment_id, kind) where resolved_at is null`; audit + hard-delete blocker.
3. `public.student_progress_forecast_cache` — PK on `student_enrollment_id`
   with `on delete cascade` (cache is evictable, no hard-delete blocker).

## Entry Points for Continuation Agent

- Start by reading this file + `06-01-PLAN.md` Task 2a section.
- `packages/db/src/schema/syllabus.ts` already imports what you need for
  FK references into `lesson`, `courseVersion`, `studentCourseEnrollment`.
- Phase 4 `maintenance_overrun` in `packages/db/migrations/0010_phase4_camp_tables.sql`
  is the authoritative pattern for `lesson_override`.
- Phase 4 `aircraft_downtime_forecast` in same file is the pattern for
  `student_progress_forecast_cache`.
