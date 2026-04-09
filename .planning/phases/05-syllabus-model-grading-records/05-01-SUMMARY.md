---
phase: 05-syllabus-model-grading-records
plan: 01
subsystem: syllabus-grading-records
tags: [schema, rls, migrations, drizzle, triggers, functions, views]
requires:
  - phase-02-personnel (instructor_currency rename source)
  - phase-02-enrollment (student_course_enrollment extension)
  - phase-03-reservation (reservation FK additions)
  - phase-04-logbook-seal-pattern (reused for grade sheet / stage check / endorsement)
provides:
  - 6-level course tree (course, course_version, stage, course_phase, unit, lesson, line_item)
  - grading (lesson_grade_sheet, line_item_grade)
  - stage_check with different-instructor trigger
  - endorsement catalog (endorsement_template) + per-issuance (student_endorsement)
  - flight_log_time per 14 CFR 61.51(e) buckets
  - personnel_currency rename + subject_kind discriminator + backwards-compat view
  - clone_course_version PL/pgSQL deep-clone
  - transitive seal on published course_version (tree children blocked)
  - fn_syllabus_seal_guard + fn_syllabus_tree_seal_guard triggers
  - fn_stage_check_different_instructor trigger
  - fn_flight_log_time_hobbs_invariant trigger
  - compute_recency_currency v1 stub
  - user_flight_log_totals view (security_invoker)
affects:
  - packages/db/src/schema/index.ts (4 new exports)
  - packages/db/src/schema/enrollment.ts (course_version_id + primary_instructor_id)
  - packages/db/src/schema/reservations.ts (lesson_id + student_enrollment_id)
  - tests/rls/harness.ts (truncation list)
tech-stack:
  added: []
  patterns:
    - "Hand-authored RLS migrations mirrored to supabase/migrations/"
    - "pgPolicy to: 'authenticated' string literal (never sql template)"
    - "Denormalized school_id + course_version_id on every tree node for 1-row RLS + seal checks"
    - "Backwards-compat VIEW pattern for table renames (instructor_currency -> personnel_currency)"
    - "Seal-on-sign triggers with signer_snapshot contract (Phase 4 pattern)"
    - "Transitive seal via helper function is_course_version_published + BEFORE UPDATE trigger"
    - "PL/pgSQL deep-clone with temp UUID remap tables (single transaction)"
    - "Enum-in-transaction caveat: ADD VALUE in isolated migration file"
key-files:
  created:
    - packages/db/migrations/0014_phase5_currency_rename.sql
    - packages/db/migrations/0015_phase5_currency_kinds.sql
    - packages/db/migrations/0016_phase5_course_tree.sql
    - packages/db/migrations/0017_phase5_grade_stage_endorsement.sql
    - packages/db/migrations/0018_phase5_functions_triggers_views.sql
    - supabase/migrations/20260409000001_phase5_currency_rename.sql
    - supabase/migrations/20260409000002_phase5_currency_kinds.sql
    - supabase/migrations/20260409000003_phase5_course_tree.sql
    - supabase/migrations/20260409000004_phase5_grade_stage_endorsement.sql
    - supabase/migrations/20260409000005_phase5_functions_triggers_views.sql
    - packages/db/src/schema/syllabus.ts
    - packages/db/src/schema/personnelCurrency.ts
    - packages/db/src/schema/grading.ts
    - packages/db/src/schema/endorsements.ts
    - tests/rls/phase5-syllabus.test.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/src/schema/enrollment.ts
    - packages/db/src/schema/reservations.ts
    - tests/rls/harness.ts
decisions:
  - "Kept backwards-compat via `public.instructor_currency` auto-updatable VIEW instead of aliased Drizzle export, so Phase 2 RLS tests and the people.currencies router continue working without touching a single existing file."
  - "Left `student_course_enrollment.course_descriptor` as a nullable legacy column rather than dropping it — Phase 2 fixtures still seed rows by that name. New writes populate course_version_id instead."
  - "`endorsement_template` is catalog data with SELECT-only RLS for authenticated users; writes require the superuser/migration path. Seed migration for AC 61-65 templates deferred to Plan 05-02."
  - "Transitive seal implemented as a per-tree-node BEFORE UPDATE trigger reading is_course_version_published(course_version_id) rather than recursive joins. Works because every tree node denormalizes course_version_id."
  - "`clone_course_version` uses ON COMMIT DROP temp tables for UUID remaps; runs in a single transaction with SECURITY INVOKER so caller RLS flows through."
  - "`flight_log_time` gained is_simulator + instrument_approaches columns beyond the plan spec (Rule 2 additions — required for IACRA 8710-1 coverage and 61.57(c) recency per the research pitfalls section)."
  - "Hobbs invariant trigger skips simulator rows and skips rows with no paired flight_log_entry (can't validate without both endpoints)."
  - "course_version seal guard allows mutating `superseded_at` on a published version (normal supersede flow) but blocks everything else."
metrics:
  duration: 18m
  tasks: 2
  files: 19
  lines_added: ~3460
  tests_added: 15
  tests_total: 166
  completed: 2026-04-09
---

# Phase 5 Plan 1: Syllabus Model Schema Foundation Summary

Schema-only ground layer for the entire training-records pillar: 6-level
course tree with versioning, grading, stage checks, endorsements, flight
time categorization, student currencies, and the RLS / seal / hard-delete
machinery every downstream Phase 5 plan depends on.

## What Landed

- **Five hand-authored migrations (0014–0018) mirrored to supabase/migrations.**
  - `0014` rename `instructor_currency` → `personnel_currency` + `subject_kind` column + backwards-compat view
  - `0015` extend `currency_kind` enum with 12 student kinds (separate file per enum-in-transaction caveat)
  - `0016` 6-level course tree (7 tables) + denormalized school_id + course_version_id + exclusive-FK CHECKs + RLS + enrollment FK + reservation FKs + currency_kind_config seeds
  - `0017` `lesson_grade_sheet`, `line_item_grade`, `stage_check`, `endorsement_template`, `student_endorsement`, `flight_log_time`
  - `0018` functions/triggers/views: seal guards, transitive seal, different-instructor, hobbs invariant, `clone_course_version`, `compute_recency_currency`, `user_flight_log_totals`
- **Five new Drizzle schema files** (`syllabus.ts`, `personnelCurrency.ts`, `grading.ts`, `endorsements.ts`), plus updates to `enrollment.ts`, `reservations.ts`, `index.ts`, `harness.ts`.
- **15 new cross-tenant RLS + behavior tests** in `tests/rls/phase5-syllabus.test.ts` covering isolation for every new table, `clone_course_version` deep-copy, different-instructor rejection, grade-sheet seal rejection, and published-version transitive seal.

## Verification

- `pnpm dlx supabase db reset` → all 19 migrations apply cleanly
- `pnpm -r typecheck` → 6 workspaces green
- `pnpm -r lint` → green (banned-term clean)
- `pnpm --filter ./apps/web build` → green
- `pnpm --filter @part61/rls-tests test` → **166/166 green** (151 prior + 15 new Phase 5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical functionality] Added `is_simulator` + `instrument_approaches` to `flight_log_time`**
- **Found during:** Task 2 while writing migration 0017
- **Issue:** Plan listed these as research-recommended but didn't put them explicitly in the action block. Without them the table cannot cover IACRA 8710-1 (simulator column) or 14 CFR 61.57(c) instrument recency (needs approach count).
- **Fix:** Added both columns with sensible defaults + included in the CHECK.
- **Files modified:** `packages/db/migrations/0017_phase5_grade_stage_endorsement.sql`, mirror, `packages/db/src/schema/grading.ts`
- **Commit:** 2536329

**2. [Rule 3 - Blocking] Kept `course_descriptor` nullable legacy column instead of dropping**
- **Found during:** Task 1 while writing migration 0016
- **Issue:** Phase 2 fixtures (`tests/rls/phase2-personnel.test.ts` line 61) still insert rows with `course_descriptor='PPL'`. Dropping the column mid-phase breaks Phase 2 regression.
- **Fix:** Made the column nullable, added `course_version_id` FK alongside, let Phase 2 fixtures coexist. Phase 5 Plan 03 will migrate callers and Plan 05 drops the legacy column.
- **Files modified:** `packages/db/migrations/0016_phase5_course_tree.sql`, mirror, `packages/db/src/schema/enrollment.ts`
- **Commit:** 0ee585b

**3. [Rule 3 - Blocking] Added backwards-compat VIEW instead of direct Drizzle alias**
- **Found during:** Task 1 while planning the rename
- **Issue:** Non-negotiable #6 says rename + view. Phase 2 router + RLS harness + phase2-personnel tests all reference `instructor_currency` by name. A Drizzle aliased re-export would not satisfy those SQL-level callers.
- **Fix:** Created `public.instructor_currency` as an auto-updatable `security_invoker` view with `WITH LOCAL CHECK OPTION`, filtering `WHERE subject_kind='instructor'`. Column default `subject_kind='instructor'` makes Phase 2 INSERTs land in the filter. Harness TRUNCATE now targets `personnel_currency` (can't TRUNCATE a view).
- **Files modified:** `packages/db/migrations/0014_phase5_currency_rename.sql`, mirror, `tests/rls/harness.ts`
- **Commit:** 0ee585b

### Schema Shape Choices

- `course_version` seal guard intentionally ALLOWS `superseded_at` mutations on a published version (normal supersede flow during version rollover) and BLOCKS every other update.
- `lesson` exclusive-FK is `num_nonnulls(stage_id, course_phase_id, unit_id) = 1` as specified. `unit` follows the same pattern with 2 parents.
- `line_item` does not need exclusive-FK since it's always a child of `lesson`.
- `endorsement_template` is a catalog table (not per-school) so it gets SELECT-only RLS for all authenticated users; modifications require the migration path. Phase 5 Plan 02 will seed AC 61-65 templates.

### Out of Scope (explicit, per plan's "DO NOT" list)

- No tRPC routers written (Plan 05-03)
- No seed data (Plan 05-02 will seed endorsement templates + 3 courses)
- No UI, PDF routes, student pages (Plans 05-04 / 05-05)
- No `is_chief_instructor` flag on `user_roles` (future plan — not needed until the `adminOrChiefInstructorProcedure` composition)

## Follow-ups for Later Phase 5 Plans

- Plan 05-02: Seed AC 61-65 endorsement templates + PPL/IR/CommSEL courses (separate migration 0019 + 0020 per research recommendation)
- Plan 05-03: tRPC routers (admin.courses.*, admin.enrollments.*, admin.stageChecks.*, admin.endorsements.*, gradeSheet.*, flightLog.categorize, record.*); migrate people.currencies router to query `personnel_currency` directly and retire the backwards-compat view
- Plan 05-04: Close-out form extension (lesson picker, grade sheet inline, flight_log_time categorization section)
- Plan 05-05: 141.101 PDF + IACRA PDF+CSV export routes + `/record` + `/flight-log` student pages
- Drop `student_course_enrollment.course_descriptor` legacy column once all Phase 2 fixtures updated
- Retire `instructor_currency` view once all callers migrated

## Self-Check: PASSED

- All 10 migration files exist in packages/db/migrations + supabase/migrations
- 4 new Drizzle schema files exist (syllabus.ts, personnelCurrency.ts, grading.ts, endorsements.ts)
- phase5-syllabus.test.ts exists with 15 tests
- Commits 0ee585b + 2536329 recorded
- `supabase db reset` → all 19 migrations apply cleanly
- `pnpm -r typecheck` / `pnpm -r lint` / `apps/web build` / 166/166 tests — all green
