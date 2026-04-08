---
phase: 02-personnel-admin-fleet-primitives
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, views, audit, security_invoker, append-only]

requires:
  - phase: 01-foundation-terminology-contract
    provides: schools/bases/users/user_roles/documents, audit.attach helper, pgPolicy to:'authenticated' string contract, RLS test harness
provides:
  - Drizzle schema modules for every Phase 2 table (personnel, holds, currencies, qualifications, no_show, enrollment, aircraft, flight_log, user_base, views)
  - Hand-authored migration 0002_phase2_personnel_aircraft.sql (mirrored to supabase/migrations/)
  - aircraft_current_totals + aircraft_engine_current_totals views with security_invoker = true
  - public.currency_status(timestamptz, integer) SQL function (STABLE)
  - currency_kind_config seeded with warning_days defaults
  - Append-only flight_log_entry contract enforced three ways (no UPDATE policy, audit.attach hard-delete trigger, corrects_id append-only path)
  - Three new RLS test suites (40 total tests passing)
affects:
  - 02-02-PLAN (base context extension)
  - 02-03-PLAN (tRPC routers)
  - 02-04-PLAN (admin pages)
  - phase-03-scheduling
  - phase-04-camp
  - phase-05-syllabus

tech-stack:
  added: []
  patterns:
    - "Append-only event store over flight_log_entry with derived-totals views (security_invoker = true)"
    - "Combined school+base RLS with admin cross-base branch and nullable app.base_id GUC"
    - "Computed-status SQL function pattern (currency_status) for due-soon rendering"
    - "Drizzle pgView().existing() bindings for hand-authored views"

key-files:
  created:
    - packages/db/src/schema/personnel.ts
    - packages/db/src/schema/holds.ts
    - packages/db/src/schema/currencies.ts
    - packages/db/src/schema/qualifications.ts
    - packages/db/src/schema/no_show.ts
    - packages/db/src/schema/enrollment.ts
    - packages/db/src/schema/aircraft.ts
    - packages/db/src/schema/flight_log.ts
    - packages/db/src/schema/user_base.ts
    - packages/db/src/schema/views.ts
    - packages/db/migrations/0002_phase2_personnel_aircraft.sql
    - supabase/migrations/20260407000000_phase2_personnel_aircraft.sql
    - packages/db/src/functions/currency_status.sql
    - tests/rls/phase2-personnel.test.ts
    - tests/rls/phase2-aircraft.test.ts
    - tests/rls/phase2-views.test.ts
  modified:
    - packages/db/src/schema/enums.ts
    - packages/db/src/schema/users.ts
    - packages/db/src/schema/documents.ts
    - packages/db/src/schema/index.ts
    - packages/domain/src/documents.ts
    - apps/web/app/(app)/profile/documents/DocumentList.tsx
    - tests/rls/harness.ts

key-decisions:
  - "aircraft_engine / aircraft_equipment / flight_log_entry_engine use EXISTS-in-aircraft (and parent flight_log_entry) RLS to keep a single source of truth on the parent"
  - "Base-scoped RLS on aircraft/flight_log_entry/instructor_qualification uses current_setting('app.base_id', true) with a nullable fallback so unset GUC passes (per Pitfall 4)"
  - "currency_status marked STABLE (not IMMUTABLE) because now() is transaction-scoped"
  - "aircraft_current_totals computed via correlated subqueries over flight_log_entry (not window functions) so the security_invoker RLS is obvious and one row per aircraft is guaranteed"
  - "emergency_contact, info_release_authorization, and aircraft_equipment get audit-only triggers (no hard-delete blocker) because they are not training-record-relevant"
  - "DocumentKind domain enum extended with 'aircraft_photo' and DocumentList label map updated to unblock apps/web typecheck (Rule 3 - Blocking)"

patterns-established:
  - "Pattern: hand-authored Drizzle migration mirrored verbatim to supabase/migrations/ for supabase db reset"
  - "Pattern: pgView('name', {...}).existing() binding for SQL views hand-authored in the migration"
  - "Pattern: append-only table = INSERT+SELECT policies only + audit.attach() for hard-delete trigger"

requirements-completed:
  - FLT-01
  - FLT-02
  - FLT-03
  - FLT-05
  - PER-01
  - PER-03
  - PER-04
  - PER-05
  - PER-06
  - PER-07
  - PER-08
  - PER-09
  - PER-10
  - IPF-01
  - IPF-02
  - MUL-01

duration: 10m
completed: 2026-04-08
---

# Phase 2 Plan 1: Personnel, Admin & Fleet Primitives Schema Summary

**Phase 2 data-layer foundation: 10 new Drizzle schema modules, hand-authored migration with 16 new tables + 2 security_invoker derived-totals views + currency_status SQL function, and 25 new RLS tests proving cross-tenant isolation and flight-log append-only contract.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-08T01:10:38Z
- **Completed:** 2026-04-08T01:20:31Z
- **Tasks:** 3
- **Files created:** 15
- **Files modified:** 7

## Accomplishments

- Full Drizzle schema layer for Phase 2 (personnel, holds, currencies, qualifications, aircraft, flight log, user_base, views)
- Idempotent enum extensions (role += rental_customer, document_kind += aircraft_photo) with 10 brand-new enums
- Hand-authored migration that applies cleanly through `supabase db reset`
- Both derived-totals views created with `security_invoker = true` and explicit SELECT grants to `authenticated`
- currency_status() SQL function + currency_kind_config seed (medical=30, bfr=60, others=30)
- 12 tables attached to `audit.attach()` (audit trigger + hard-delete blocker); 3 tables get audit-only triggers
- flight_log_entry append-only contract verified end-to-end (RLS denies UPDATE; trigger blocks DELETE)
- Cross-tenant test coverage for 10 new tables + 2 views (40/40 RLS tests pass in 1.3s)

## Task Commits

1. **Task 1: Drizzle schema modules** — `b478209` (feat)
2. **Task 2: Migration + Supabase mirror + function + views** — `391422b` (feat)
3. **Task 3: Phase 2 RLS test suites** — `eaaa269` (test)

## Files Created/Modified

**Created:**
- `packages/db/src/schema/personnel.ts` — person_profile, emergency_contact, info_release_authorization, instructor_experience
- `packages/db/src/schema/holds.ts` — person_hold (partial index on active holds)
- `packages/db/src/schema/currencies.ts` — instructor_currency + currency_kind_config
- `packages/db/src/schema/qualifications.ts` — instructor_qualification (base-scoped)
- `packages/db/src/schema/no_show.ts`, `enrollment.ts` — Phase 5 scaffolds
- `packages/db/src/schema/aircraft.ts` — aircraft, aircraft_engine, aircraft_equipment
- `packages/db/src/schema/flight_log.ts` — flight_log_entry (append-only) + flight_log_entry_engine
- `packages/db/src/schema/user_base.ts` — multi-base join
- `packages/db/src/schema/views.ts` — pgView().existing() bindings for derived-totals views
- `packages/db/migrations/0002_phase2_personnel_aircraft.sql` — hand-authored, 600+ lines
- `supabase/migrations/20260407000000_phase2_personnel_aircraft.sql` — verbatim mirror
- `packages/db/src/functions/currency_status.sql` — canonical reference copy
- `tests/rls/phase2-personnel.test.ts`, `phase2-aircraft.test.ts`, `phase2-views.test.ts`

**Modified:**
- `packages/db/src/schema/enums.ts` — extended role/document_kind + 10 new enums
- `packages/db/src/schema/users.ts` — +status column + users_status_idx
- `packages/db/src/schema/documents.ts` — +aircraftId nullable column
- `packages/db/src/schema/index.ts` — barrel re-exports all new modules
- `packages/domain/src/documents.ts` — DocumentKind enum += 'aircraft_photo'
- `apps/web/app/(app)/profile/documents/DocumentList.tsx` — label map updated
- `tests/rls/harness.ts` — truncate Phase 2 tables, seed primary bases

## Cross-Tenant Coverage Matrix

| Table / View                    | Test File                   | Assertions                                        |
| ------------------------------- | --------------------------- | ------------------------------------------------- |
| person_profile                  | phase2-personnel.test.ts    | A sees own, B sees own                            |
| person_hold                     | phase2-personnel.test.ts    | A sees own, B sees own                            |
| instructor_currency             | phase2-personnel.test.ts    | A sees own, B sees own                            |
| instructor_qualification        | phase2-personnel.test.ts    | A sees own, B sees own (base-scoped)              |
| no_show                         | phase2-personnel.test.ts    | A sees own, B sees own                            |
| student_course_enrollment       | phase2-personnel.test.ts    | A sees own, B sees own                            |
| instructor_experience           | phase2-personnel.test.ts    | A sees own, B sees own                            |
| aircraft                        | phase2-aircraft.test.ts     | A sees 1 row matching own id                      |
| aircraft_engine                 | phase2-aircraft.test.ts     | A sees only own engine                            |
| aircraft_equipment              | phase2-aircraft.test.ts     | A sees only own tags                              |
| flight_log_entry                | phase2-aircraft.test.ts     | A sees 2 rows (baseline + flight), both own       |
| flight_log_entry (append-only)  | phase2-aircraft.test.ts     | UPDATE of cross-tenant row → 0 rows affected      |
| flight_log_entry (hard-delete)  | phase2-aircraft.test.ts     | DELETE own row → trigger raises P0001             |
| aircraft_current_totals         | phase2-views.test.ts        | A sees 1 own row, 0 for B id; B sees 1 own row    |
| aircraft_engine_current_totals  | phase2-views.test.ts        | A sees 1 engine, 0 for B engine id                |

## Decisions Made

- EXISTS-in-parent RLS for child tables (aircraft_engine, aircraft_equipment, flight_log_entry_engine) keeps the parent's school+base policy as the single source of truth.
- `aircraft_current_totals` uses correlated subqueries per aircraft (not window functions) so the result is deterministically one row per aircraft and the RLS path through `aircraft` is obvious.
- `current_setting('app.base_id', true)` with a nullable-fallback branch lets Phase 1 login flows (no base context yet) still read school-scoped data on base-scoped tables without errors.
- currency_kind_config lives as a table with a read-all-authenticated policy (not hardcoded constants) to make warning_days customizable later without a deploy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] apps/web DocumentKind enum gap**
- **Found during:** Task 1 typecheck after extending `documentKindEnum` with `aircraft_photo`
- **Issue:** `packages/domain/src/documents.ts` declares its own `DocumentKind` zod enum; adding `aircraft_photo` to the Drizzle enum broke `apps/web/app/(app)/profile/documents/page.tsx` typing.
- **Fix:** Added `'aircraft_photo'` to the domain zod enum and the `KIND_LABEL` map in `DocumentList.tsx`.
- **Files modified:** `packages/domain/src/documents.ts`, `apps/web/app/(app)/profile/documents/DocumentList.tsx`
- **Verification:** `pnpm -r typecheck` clean.
- **Committed in:** `b478209` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Drizzle `AnyPgColumn` import path**
- **Found during:** Task 1 typecheck
- **Issue:** Initial `flight_log.ts` imported `AnyPgColumn` from `drizzle-orm`; that package exports `AnyColumn`. The self-referencing FK needs the Pg-specific type from `drizzle-orm/pg-core`.
- **Fix:** Moved the import to `drizzle-orm/pg-core`.
- **Committed in:** `b478209` (Task 1 commit)

**3. [Rule 3 - Blocking] Harness truncation set did not include Phase 2 tables**
- **Found during:** Task 3 (RLS tests would have leaked fixture data across files)
- **Issue:** `seedTwoSchools()` only truncated Phase 1 tables; re-seeding would violate FKs.
- **Fix:** Extended the TRUNCATE CASCADE list to include every Phase 2 table and added BASE_A/BASE_B seed rows so `base_id NOT NULL` FKs resolve.
- **Committed in:** `eaaa269` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 missing-critical, 2 blocking). All necessary for compilation and test isolation. No scope creep.

## Issues Encountered

None — verification gates (typecheck, lint, supabase db reset, RLS test suite) all passed first or second try.

## User Setup Required

None.

## Open Questions Still Pending for Downstream Plans

1. **Supabase-js `auth.admin.createUser` custom `id` support** — Plan 02-02 must verify at task time (research Open Question 1). If the installed version silently drops the `id` field, the self-registration flow pivots to a separate `registration_request` table.
2. **Drizzle-kit diff behavior for hand-authored views** — Plan 02-02 or 02-03 should run `drizzle-kit generate --name phase2_verify` against a DB that already has the migration applied and confirm it does NOT attempt to recreate the two views.
3. **currency_kind_config per-school overrides** — Currently global. If partner school wants per-school warning_days, add a school_id column later (non-breaking).

## Next Phase Readiness

- Schema layer stable. Plans 02-02 (base context + access token hook), 02-03 (tRPC routers), and 02-04 (admin pages) can proceed in wave order.
- RLS test harness extended to cover Phase 2 tables; downstream plans should add their own cross-tenant tests for any new tables or procedures.
- `aircraft_current_totals` ready to power the admin fleet dashboard (ADM-07) in plan 02-04.

---

*Phase: 02-personnel-admin-fleet-primitives*
*Completed: 2026-04-08*

## Self-Check: PASSED

- Verified files exist:
  - packages/db/src/schema/{personnel,holds,currencies,qualifications,no_show,enrollment,aircraft,flight_log,user_base,views}.ts
  - packages/db/migrations/0002_phase2_personnel_aircraft.sql
  - supabase/migrations/20260407000000_phase2_personnel_aircraft.sql
  - tests/rls/phase2-{personnel,aircraft,views}.test.ts
- Verified commits exist: b478209, 391422b, eaaa269
- `pnpm -r typecheck` + `pnpm -r lint` + `pnpm --filter @part61/rls-tests test` all green
