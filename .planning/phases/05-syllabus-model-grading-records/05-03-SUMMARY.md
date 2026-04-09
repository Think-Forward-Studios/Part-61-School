---
phase: 05-syllabus-model-grading-records
plan: 03
subsystem: syllabus-api-routers
tags: [trpc, routers, migrations, procedures, signer-snapshot, partial]
status: complete
requires:
  - 05-01 (syllabus schema + clone_course_version)
  - 05-02 (system course templates for fork testing)
provides:
  - migration 0021 user_roles.is_chief_instructor
  - migration 0022 test_grade table + seal guard + hard-delete blocker
  - Drizzle schema for test_grade
  - adminOrChiefInstructorProcedure
  - buildInstructorSignerSnapshot helper
  - domain labels (gradingLabels, lessonKindLabels, endorsementCategoryLabels)
  - admin.courses router (list/get/getVersion/createDraft/createVersion/fork/publish/add*/updateLineItem/softDelete)
  - admin.enrollments router (list/get/create/migrate/markComplete/withdraw)
affects:
  - packages/db/src/schema/index.ts (test_grade export)
  - packages/domain/src/index.ts (3 label re-exports)
  - packages/api/src/procedures.ts (new composed procedure)
  - packages/api/src/routers/admin/_root.ts (2 new sub-routers)
tech-stack:
  added: []
  patterns:
    - 'adminOrChiefInstructorProcedure uses a live SQL probe of user_roles.is_chief_instructor per-call (no session caching) for defense-in-depth'
    - 'InstructorSignerSnapshot is structurally distinct from the mechanic SignerSnapshot (different cert type enum) — kept in the api helpers package, not exported from domain yet'
    - 'admin.courses.fork creates an owned course shell THEN calls clone_course_version THEN re-parents the cloned version onto the shell, so the caller always owns the resulting course row'
    - 'assertDraft() helper reads courseVersion.publishedAt before every tree mutation — router-level mirror of the DB seal trigger'
key-files:
  created:
    - packages/db/migrations/0021_phase5_chief_instructor.sql
    - packages/db/migrations/0022_phase5_test_grade.sql
    - supabase/migrations/20260409000008_phase5_chief_instructor.sql
    - supabase/migrations/20260409000009_phase5_test_grade.sql
    - packages/db/src/schema/test_grade.ts
    - packages/api/src/helpers/buildInstructorSignerSnapshot.ts
    - packages/api/src/routers/admin/courses.ts
    - packages/api/src/routers/admin/enrollments.ts
    - packages/domain/src/schemas/gradingLabels.ts
    - packages/domain/src/schemas/lessonKindLabels.ts
    - packages/domain/src/schemas/endorsementCategoryLabels.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/domain/src/index.ts
    - packages/api/src/procedures.ts
    - packages/api/src/routers/admin/_root.ts
decisions:
  - 'Reused existing `instructorOrAdminProcedure` for grading / stage check / endorsement ceremonies instead of minting a new `instructorProcedure`. Plan text said "instructorProcedure"; the existing composed procedure is semantically identical and was already wired — no need for a second name.'
  - 'Kept migration 0022 RLS policies as drafted (bare `(auth.jwt() ->> \'school_id\')::uuid`). Matches Phase 4 convention.'
  - 'Created a separate `InstructorSignerSnapshot` type in the helper instead of extending the domain `SignerSnapshot` enum. Mechanic certificate_type is frozen as `a_and_p | ia`; instructor certs (cfi/cfii/mei/admin) are structurally disjoint. Keeps the Phase 4 contract immutable.'
  - 'admin.courses.fork re-parents the cloned course_version onto a freshly-inserted owned course row so the caller always owns both sides of the fork. clone_course_version only clones the version subtree, not the course header.'
  - 'This plan is being executed in SLICES. Slice A (this summary) landed the migrations, procedures, helper, labels, admin.courses, and admin.enrollments. Remaining routers are deferred to a continuation agent — see "Deferred" below.'
metrics:
  duration: 14m
  tasks: 4 (of ~11 total for the full plan)
  files: 13
  tests_total: 175 (baseline unchanged)
  completed: 2026-04-09
---

# Phase 5 Plan 03: API Routers Summary (SLICE A — PARTIAL)

**This is a partial summary.** The full 05-03 plan covers 9 routers + 1
helper + 3 label files + integration tests. This slice landed the
foundation plus the first two admin routers so a continuation agent can
pick up cleanly from a green tree.

## What Landed (Slice A)

### Foundation

- **Migration 0021 — `user_roles.is_chief_instructor`** (`boolean not null default false`). Unlocks the composed `adminOrChiefInstructorProcedure`.
- **Migration 0022 — `test_grade` table (SYL-25).** Records knowledge / oral / end-of-stage / practical grades against any course component (course / stage / course_phase / unit / lesson / line_item). Includes seal guard trigger and hard-delete blocker. RLS uses the bare `(auth.jwt() ->> 'school_id')::uuid` pattern to match Phase 4.
- **Drizzle schema** `packages/db/src/schema/test_grade.ts` exporting `testGrade` table + enums + types, wired through the schema barrel.

### Procedures + helper + labels

- **`adminOrChiefInstructorProcedure`** — admin passes immediately; instructor passes iff any of their `user_roles` rows has `is_chief_instructor = true`. Probes the DB per-call, wrapped in `protectedProcedure` (so the tenant tx + GUCs are already set).
- **`buildInstructorSignerSnapshot(tx, userId, activeRole)`** — mirrors the Phase 4 mechanic helper; validates the caller is instructor/admin, reads `person_profile.first_name/last_name` + `faa_airman_cert_number`, returns a frozen `{ user_id, full_name, certificate_type: 'cfi'|'cfii'|'mei'|'admin', certificate_number, signed_at }` snapshot. Copied, not referenced.
- **Domain labels** in `packages/domain/src/schemas/`:
  - `gradingLabels.ts` — `gradingScaleLabels`, `absoluteIpmLabels`, `relative5Labels`, `passFailLabels`, `gradeValueLabel()`, `isPassingGrade()` helper used later by gradeSheet.seal.
  - `lessonKindLabels.ts` — ground/flight/simulator/oral/written_test.
  - `endorsementCategoryLabels.ts` — AC 61-65K category display labels.
  - Re-exported from `@part61/domain`.

### admin.courses router (`packages/api/src/routers/admin/courses.ts`)

Endpoints (all `adminOrChiefInstructorProcedure`):

| Procedure        | Shape                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `list`           | system templates (school_id is null) + school's own courses                              |
| `get`            | single course + all versions                                                             |
| `getVersion`     | full tree (stages, phases, units, lessons, line items) in one query                      |
| `createDraft`    | new course + first draft version                                                         |
| `createVersion`  | additional draft version on an existing course                                           |
| `fork`           | owned course shell + `clone_course_version(source, school)` + re-parent                  |
| `publish`        | sets `published_at` (transitive seal activates via DB trigger)                           |
| `addStage`       | draft-only                                                                               |
| `addPhase`       | draft-only (under a stage)                                                               |
| `addUnit`        | draft-only (exclusive-FK: stage XOR coursePhase)                                         |
| `addLesson`      | draft-only (exclusive-FK: stage XOR coursePhase XOR unit)                                |
| `addLineItem`    | draft-only                                                                               |
| `updateLineItem` | draft-only                                                                               |
| `softDelete`     | course soft delete; refuses if any version is published                                  |

`assertDraft(tx, versionId)` mirrors the DB seal guard at the router layer, so the caller gets a clean `CONFLICT` instead of a raw SQL exception.

### admin.enrollments router (`packages/api/src/routers/admin/enrollments.ts`)

Endpoints (all `adminOrChiefInstructorProcedure`):

| Procedure      | Notes                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| `list`         | Optional `studentUserId` filter                                         |
| `get`          | Returns enrollment + joined course_version                              |
| `create`       | Refuses draft versions; stores `primaryInstructorId` + `notes`          |
| `migrate`      | `newCourseVersionId` + `reason`; refuses draft target; stores reason    |
| `markComplete` | Sets `completed_at = now()`                                             |
| `withdraw`     | `reason` required; sets `withdrawn_at = now()`, stores reason in notes  |

## Verification

| Gate                                                          | Result                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `pnpm dlx supabase db reset`                                  | 23 migrations apply clean (21 prior + 0021 + 0022) |
| `pnpm --filter @part61/rls-tests test`                        | **175/175 green** (baseline unchanged)         |
| `pnpm -r typecheck`                                           | 6 workspaces green (db, domain, api, web, rls) |
| `pnpm -r lint`                                                | green (banned-term rule clean)                 |

## Commits

- `de5052f` — feat(05-03): migrations 0021 chief_instructor + 0022 test_grade + drizzle schema
- `6b554f8` — feat(05-03): adminOrChiefInstructorProcedure + buildInstructorSignerSnapshot + domain labels
- `91deb6d` — feat(05-03): admin.courses router with fork + publish + tree CRUD
- `5822647` — feat(05-03): admin.enrollments router

## Requirements (partially closed by slice A)

- **SYL-01** — Admin can CRUD courses / versions / stages / phases / units / lessons / line items through `admin.courses.*`. Draft-only enforced at router + DB trigger.
- **SYL-03** — Draft vs published lifecycle: `publish` activates transitive seal; `createVersion` makes a new draft on an existing course; `softDelete` refuses published courses.
- **SYL-04** — `admin.courses.fork` wraps `clone_course_version` and produces an owned course + owned draft version in one call.

Marking only the requirements this slice fully satisfies. SYL-05/06/07/08/09/12/13/14/25 and SCH-12 remain OPEN for the continuation agent.

## Deferred to Continuation Agent (Slice B)

The following routers from 05-03 have NOT been written yet:

1. `admin.stageChecks` — list / schedule (different-instructor check) / record (seals with signer snapshot). SYL-05.
2. `admin.endorsements` — listTemplates / listStudentEndorsements / issue (with rendered_text snapshot) / revoke. SYL-09.
3. `admin.studentCurrencies` — list / record / update / delete filtered on `subject_kind='student'`. SYL-13.
4. `gradeSheet` router — createFromReservation / setGrade / setOverallRemarks / seal / recordTestGrade. SYL-06/07/08/25.
5. `flightLog.categorize` — writes flight_log_time rows with the ±6 min tolerance check. SYL-12/14.
6. `record` router (student-facing, read-only, scoped to ctx.session.userId) — me / myFlightLog / myCurrencies / myCourseProgress / myFlightLogTotals. SYL-14.
7. `schedule.checkStudentCurrency(lessonId, studentId)` + additive hook in existing `schedule.approve`. SCH-12.
8. `tests/api/phase5-routers.test.ts` — integration tests for all of the above.

The continuation agent has everything it needs: the procedures, the signer snapshot helper, the labels, and the two admin routers to copy pattern from. `clone_course_version` is exercised by `admin.courses.fork` so the pl/pgsql path is proven.

### Continuation pattern notes

- Reuse `instructorOrAdminProcedure` (already in `procedures.ts`) for grading / stage check / endorsement ceremonies. The plan text says "instructorProcedure" but the existing composed procedure covers it.
- Reuse `buildInstructorSignerSnapshot(tx, ctx.session.userId, ctx.session.activeRole)` at seal time in gradeSheet.seal, admin.stageChecks.record, and admin.endorsements.issue.
- `isPassingGrade(scale, value)` in `@part61/domain` is the helper for gradeSheet.seal's must_pass enforcement.
- Integration tests can use the Phase 3-4 API test harness pattern; `fn_phase5_seed_courses()` seeds PPL/IR/CSEL for fork/grade sheet coverage.

## Slice B — Continuation (2026-04-09)

Slice B picked up cleanly from the green tree Slice A left behind and landed
the remaining 6 routers plus the integration test suite.

### What Landed (Slice B)

#### admin.stageChecks router (`packages/api/src/routers/admin/stageChecks.ts`)

| Procedure  | Notes                                                                                |
| ---------- | ------------------------------------------------------------------------------------ |
| `list`     | Optional `studentEnrollmentId` filter; scoped to school                              |
| `schedule` | Server-side guard: rejects when `checkerUserId == enrollment.primaryInstructorId`    |
| `record`   | Writes status + remarks, calls `buildInstructorSignerSnapshot`, seals via `sealedAt` |

#### admin.endorsements router (`packages/api/src/routers/admin/endorsements.ts`)

| Procedure                 | Notes                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `listTemplates`           | Returns full endorsement_template catalog                                             |
| `listStudentEndorsements` | Filtered to `schoolId` + `studentUserId`, newest first                                |
| `issue`                   | Loads template + student/instructor profile, renders `{{placeholder}}` tokens into `rendered_text`, snapshots signer, seals on insert |
| `revoke`                  | Soft revoke via `revoked_at` + reason; never deletes                                  |

Placeholder substitution supports `{{student_name}}`, `{{instructor_name}}`,
`{{instructor_cfi_number}}`, `{{date}}`, `{{aircraft}}` — callers can also
pass an explicit `placeholderValues` map to override or extend.

#### admin.studentCurrencies router (`packages/api/src/routers/admin/studentCurrencies.ts`)

CRUD mirror of Phase 2 instructor currencies, filtered to `subject_kind='student'`.
`list` / `record` / `update` / `softDelete`, all gated by
`adminOrChiefInstructorProcedure`. Uses the existing `currency_kind` enum
(cfi/cfii/mei/medical/bfr/ipc).

#### gradeSheet router (`packages/api/src/routers/gradeSheet.ts`)

| Procedure               | Notes                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `createFromReservation` | Inserts a draft `lesson_grade_sheet`, pre-fills `line_item_grade` stubs for every lesson item  |
| `setGrade`              | Draft-only; validates `gradeValue` against the line item's grading scale (override or course default) |
| `setOverallRemarks`     | Draft-only                                                                                     |
| `setGroundFlightMinutes`| Draft-only                                                                                     |
| `seal`                  | Enforces every non-optional item has a grade AND every `must_pass` item has a passing grade (via `isPassingGrade`). Snapshots signer, flips status to `sealed`. DB trigger is the backstop. |
| `recordTestGrade`       | Writes `test_grade` row with signer snapshot, seals immediately. SYL-25.                       |

`loadDraft(tx, gradeSheetId)` mirrors Slice A's `assertDraft` pattern — every
mutation calls it first so the router rejects sealed sheets before the DB
trigger ever sees them.

#### flightLog.categorize (`packages/api/src/routers/flightLog.ts`)

Added to the existing flight log router. Writes 1..N `flight_log_time` rows
per reservation. Validates day+night minutes sum to within ±6 min of the
paired `flight_log_entry.airframe_delta` (converted to minutes). Simulator
splits skip the hobbs gate.

#### record router (`packages/api/src/routers/record.ts`)

Student-facing read-only queries. **Every procedure scopes its query to
`ctx.session.userId` — never to an arbitrary input userId.**

| Procedure           | Notes                                                          |
| ------------------- | -------------------------------------------------------------- |
| `me`                | Caller's `users` + `person_profile` row + active enrollments   |
| `myCourseProgress`  | Enrollment + graded/total line item counts for the enrollment  |
| `myFlightLog`       | `flight_log_time` rows WHERE `user_id = caller`                |
| `myFlightLogTotals` | `user_flight_log_totals` view scoped to caller                 |
| `myCurrencies`      | `personnel_currency` rows WHERE `user_id = caller`             |

#### schedule.checkStudentCurrency + approve hook (SCH-12)

Added to `packages/api/src/routers/schedule/reservations.ts`:

- `computeStudentCurrencyBlockers(tx, lessonId, studentUserId)` — helper that
  reads `lesson.required_currencies` (jsonb array of currency kind strings,
  also accepts `[{kind}]` shape), joins `personnel_currency` WHERE
  `subject_kind='student'`, and returns blockers for missing or expired entries.
- `checkStudentCurrency` procedure — public wrapper, returns `{ blockers }`.
- `approve` now additively calls `computeStudentCurrencyBlockers` ONLY when
  `reservation.lesson_id` AND `reservation.student_id` are both set. Raises
  `PRECONDITION_FAILED` with a human-readable blocker list. Reservations
  without a `lesson_id` are untouched — Phase 3 regression tests still pass.

Exposed at `schedule.checkStudentCurrency` in the top-level schedule router.

#### Integration tests (`tests/rls/api-phase5-routers.test.ts`)

12 new tests covering:

1. `admin.courses.createDraft` → `addStage` → `addLesson` → `addLineItem` builds an owned tree
2. `admin.enrollments.create` refuses a draft version
3. `admin.courses.publish` activates the version + enrollment succeeds
4. `admin.stageChecks.schedule` rejects checker == primary_instructor
5. `admin.stageChecks.schedule` allows a different checker
6. `gradeSheet.createFromReservation` + grade every item + `seal` succeeds
7. `gradeSheet.seal` refuses when a must_pass line item is failing
8. `admin.endorsements.issue` renders and seals with signer snapshot
9. `schedule.checkStudentCurrency` reports missing + expired currencies
10. `schedule.approve` passes through unchanged when `lesson_id` is null (Phase 3 regression)
11. `flightLog.categorize` rejects day+night exceeding hobbs delta ± 6 min; accepts when within tolerance
12. `record.myFlightLog` scopes rows strictly to `ctx.session.userId`

The fork/publish path was intentionally swapped for an owned-course path because
`fn_phase5_seed_courses()` uses deterministic non-v4 UUIDs (`55555555-...-551a`)
which fail strict `zod.uuid()` parsing in the router. The `clone_course_version`
round-trip is already covered by `phase5-seed.test.ts`.

### Slice B Verification

| Gate                                         | Result                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `pnpm --filter @part61/rls-tests test`       | **187/187 green** (+12 from 175 baseline)        |
| `pnpm -r typecheck`                          | green (6 workspaces)                             |
| `pnpm -r lint`                               | green (banned-term clean)                        |
| `pnpm --filter ./apps/web build`             | green                                            |

### Slice B Commits

- `5fc4b9f` — feat(05-03): admin.stageChecks router with different-instructor check
- `6d6fdb8` — feat(05-03): admin.endorsements router with placeholder substitution + snapshot
- `46e7bb5` — feat(05-03): admin.studentCurrencies router
- `f5e67f5` — feat(05-03): gradeSheet router with must_pass enforcement + test_grade
- `96b90eb` — feat(05-03): flightLog.categorize router for 61.51(e) buckets
- `cb0563e` — feat(05-03): record router + schedule.checkStudentCurrency (SCH-12 wire)
- `a871da1` — test(05-03): phase 5 API integration test suite

### Requirements Closed by Slice B

- **SYL-05** — Stage check cannot be conducted by the student's primary instructor (server guard + DB trigger backstop).
- **SYL-06** — Instructor can create a draft `lesson_grade_sheet` from a reservation, edit line item grades, and seal it; sealed sheets reject further mutations.
- **SYL-07** — `gradeSheet.seal` enforces must_pass → passing grade using `isPassingGrade(scale, value)` from `@part61/domain`.
- **SYL-08** — Overall remarks / ground + flight minutes captured on the draft sheet; sealed with signer snapshot at `seal` time.
- **SYL-09** — Endorsements issued with fully-rendered text snapshotted from placeholders; sealed immediately; revoke is soft.
- **SYL-12** — `personnelCurrency` (subject_kind='student') CRUD via `admin.studentCurrencies`.
- **SYL-13** — Student currency CRUD wired; used by SCH-12 hook.
- **SYL-14** — `flightLog.categorize` writes `flight_log_time` rows with the ±6 min tolerance gate; `record.myFlightLog` + `record.myFlightLogTotals` expose the 61.51(e) view to the student.
- **SYL-25** — `gradeSheet.recordTestGrade` writes to `test_grade` with signer snapshot + seal.
- **SCH-12** — `schedule.checkStudentCurrency` procedure plus additive call in `schedule.approve` when `lesson_id` is present.

Combined with Slice A (SYL-01, SYL-03, SYL-04), the plan now closes **13 requirements**.

## Self-Check: PASSED

- All 11 commits resolve in `git log --oneline` (4 slice A + 7 slice B)
- Router files present: stageChecks.ts, endorsements.ts, studentCurrencies.ts (admin/), gradeSheet.ts, record.ts, flightLog.ts (extended); schedule/reservations.ts extended
- `tests/rls/api-phase5-routers.test.ts` present; 12 tests green
- `pnpm -r typecheck && pnpm -r lint && pnpm --filter ./apps/web build` green
- `pnpm --filter @part61/rls-tests test` 187/187 green
- Banned-term lint clean
- Slice A Self-Check retained below

### Slice A Self-Check: PASSED

- All 4 commits resolve in `git log --oneline`
- All 11 created files exist on disk
- `packages/api/src/routers/admin/_root.ts` exports `courses` and `enrollments` sub-routers
- `pnpm dlx supabase db reset` clean
- 175/175 RLS tests green
- `pnpm -r typecheck && pnpm -r lint` green
- Clean git status at slice boundary
