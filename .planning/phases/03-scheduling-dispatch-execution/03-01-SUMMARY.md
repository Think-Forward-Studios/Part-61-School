---
phase: 03-scheduling-dispatch-execution
plan: 01
subsystem: scheduling-schema
tags: [scheduling, dispatch, exclusion-constraint, rls, phase3]
one_liner: "Reservation schema with btree_gist exclusion constraints, is_airworthy_at stub, shadow-row unavailability trigger, and paired flight_out/flight_in totals view"
status: complete
completed: 2026-04-08
duration_minutes: 28
tasks_completed: 3
files_changed: 17
commits:
  - 9d7c569 feat(03-01) drizzle schema for phase 3 scheduling tables
  - dc72f56 feat(03-01) phase 3 scheduling SQL migration with exclusion constraints
  - 0243e81 test(03-01) phase 3 RLS, shadow trigger, view, and concurrent exclusion tests
dependency_graph:
  requires:
    - phase-02 personnel + aircraft + flight_log_entry tables
    - phase-01 audit.attach + fn_block_hard_delete + RLS scaffolding
  provides:
    - reservation table with four EXCLUDE USING gist constraints
    - public.is_airworthy_at(uuid, timestamptz) function
    - public.free_busy(text, uuid, timestamptz, timestamptz) SRF
    - person_unavailability shadow-row trigger
    - schedule_block parent_block_id inflate trigger
    - aircraft_current_totals view extended for flight_out/flight_in pairs
  affects:
    - flight_log_entry kind enum (added flight_out, flight_in)
    - flight_log_entry table (added paired_entry_id column)
    - aircraft table (added grounded_at column)
tech-stack:
  added:
    - postgres btree_gist extension
    - tstzrange columns via Drizzle customType
  patterns:
    - Two-file enum-bump migration to dodge ALTER TYPE ADD VALUE same-txn caveat
    - Partial EXCLUDE USING gist with status allow-list
    - SECURITY DEFINER trigger for shadow-row materialization
    - postgres-js parallel .begin() blocks for true concurrency tests
key-files:
  created:
    - packages/db/src/schema/reservations.ts
    - packages/db/src/schema/rooms.ts
    - packages/db/src/schema/squawks.ts
    - packages/db/src/schema/schedule_blocks.ts
    - packages/db/src/schema/fif.ts
    - packages/db/src/schema/passenger_manifest.ts
    - packages/db/src/schema/person_unavailability.ts
    - packages/db/migrations/0007_phase3_scheduling_dispatch.sql
    - packages/db/migrations/0008_phase3_view_update.sql
    - supabase/migrations/20260408000000_phase3_scheduling_dispatch.sql
    - supabase/migrations/20260408000001_phase3_view_update.sql
    - tests/rls/phase3-scheduling.test.ts
    - tests/rls/phase3-exclusion-concurrency.test.ts
  modified:
    - packages/db/src/schema/enums.ts
    - packages/db/src/schema/aircraft.ts
    - packages/db/src/schema/flight_log.ts
    - packages/db/src/schema/index.ts
    - tests/rls/cross-tenant.test.ts
decisions:
  - Two migration files (0007 + 0008) split because Postgres forbids using a freshly added enum value in the same transaction it was added in. 0007 adds flight_out/flight_in to the kind enum; 0008 replaces aircraft_current_totals to reference them.
  - Drizzle has no DSL for partial EXCLUDE USING gist, so the four constraints live ONLY in the hand-authored SQL migration. A comment in reservations.ts says so.
  - Half-open tstzrange bounds enforced with a CHECK constraint (lower_inc + not upper_inc) — a back-to-back booking (10-11 then 11-12) does NOT conflict.
  - Shadow-row trigger is SECURITY DEFINER + pinned search_path so it can insert a reservation row regardless of caller role; the triggering insert still goes through the calling user's RLS.
  - Concurrency test accepts BOTH 23P01 (exclusion_violation) and 40P01 (deadlock_detected) as proof that the constraint bites — Postgres can race-resolve overlapping gist inserts either way and both indicate exactly-one-winner semantics.
  - Aircraft and reservation use base-scoped RLS with the Phase 2 nullable-fallback pattern so flows without an active base GUC keep working.
  - room and fif_acknowledgement and schedule_block_instance get audit-only triggers (no hard-delete blocker) — they aren't training-record-relevant.
  - Block-inflate trigger runs BEFORE INSERT so the exclusion constraint sees the inflated instructor_id/aircraft_id/room_id when it evaluates.
  - person_unavailability has a shadow_reservation_id column written by the trigger so update/delete don't need a fragile lookup.
metrics:
  duration_minutes: 28
  tests_added: 18
  tests_passing: 80
  baseline_phase2_tests: 62
  new_phase3_tests: 18
---

# Phase 3 Plan 01: Scheduling Schema Summary

Single-shot landing of the entire Phase 3 data layer: nine new tables, four partial GiST exclusion constraints, the `is_airworthy_at()` stub, the `free_busy` privacy SRF, the personnel-unavailability shadow-row trigger, the schedule-block inflate trigger, and an updated `aircraft_current_totals` view that handles paired `flight_out`/`flight_in` rows alongside the legacy Phase 2 `flight` kind. Every later Phase 3 plan stands on this.

## Scope Delivered

- **9 new tables:** reservation, room, aircraft_squawk, schedule_block, schedule_block_instance, fif_notice, fif_acknowledgement, passenger_manifest, person_unavailability
- **2 column additions:** aircraft.grounded_at, flight_log_entry.paired_entry_id
- **1 enum extension:** flight_log_entry_kind += {flight_out, flight_in}
- **8 new enums:** reservation_activity_type, reservation_status, close_out_reason, squawk_severity, fif_severity, manifest_position, block_kind, unavailability_kind
- **4 partial EXCLUDE USING gist constraints** on reservation (aircraft_id, instructor_id, student_id, room_id) gated by `status in ('approved','dispatched','flown')`
- **2 SQL functions:** is_airworthy_at(uuid, timestamptz), free_busy(text, uuid, timestamptz, timestamptz)
- **3 triggers:** person_unavailability shadow (insert/update/delete), reservation block-inflate (BEFORE INSERT)
- **18 new RLS / behavior tests** covering cross-tenant isolation per table, is_airworthy_at semantics, the shadow trigger writing a real shadow + blocking overlap, the paired-totals view, and a true-concurrency exclusion proof using two postgres-js connections

## Verification Gate Results

| Gate | Result |
| ---- | ------ |
| `pnpm -r typecheck` | clean |
| `pnpm -r lint` | clean |
| `supabase db reset` | applies all migrations cleanly (Phase 1 + 2 + 3) |
| `pnpm --filter @part61/rls-tests test` | 80/80 (62 baseline + 18 new) |
| Concurrency test | one INSERT wins, the other rejects with 23P01 or 40P01 |
| Constraint presence | reservation_aircraft_no_overlap, reservation_instructor_no_overlap, reservation_student_no_overlap, reservation_room_no_overlap |
| btree_gist | enabled |
| is_airworthy_at | returns true for active aircraft, false for grounded, false for open grounding squawk |
| Shadow trigger | insert creates matching `status='approved' activity_type='misc'` reservation; overlapping instructor flight rejected by exclusion constraint |
| Paired totals view | baseline 100.0 + (flight_in 101.5 - flight_out 100.0) = 101.5 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed invalid PL/pgSQL block label `update_record:`**

- **Found during:** Task 2 (`supabase db reset` first run)
- **Issue:** `update_record:` followed by `begin`/`end` is not valid PL/pgSQL syntax in this position; Postgres returned `ERROR: syntax error at or near "update_record" (SQLSTATE 42601)` and the migration failed
- **Fix:** Removed the gratuitous block wrapper from `fn_reservation_block_inflate()`; the three nullable-column inflate steps run as plain top-level statements
- **Files modified:** packages/db/migrations/0007_phase3_scheduling_dispatch.sql + supabase mirror
- **Commit:** dc72f56

**2. [Rule 1 - Bug] Concurrency test occasionally returned 40P01 instead of 23P01**

- **Found during:** Task 3 (full RLS suite second run)
- **Issue:** When two parallel transactions both insert overlapping approved reservations on the same aircraft, Postgres can resolve the conflict either by raising 23P01 (`exclusion_violation`) on the loser OR by raising 40P01 (`deadlock_detected`) when both holders race on the gist index. Both outcomes are valid proof that exactly one transaction can commit, but the test only accepted 23P01 and was therefore flaky.
- **Fix:** Test now accepts either SQLSTATE; documented in a code comment so the next reader doesn't think it's hiding a real bug
- **Files modified:** tests/rls/phase3-exclusion-concurrency.test.ts
- **Commit:** 0243e81

**3. [Rule 3 - Blocking] Shadow-row trigger needed correct user role to set instructor_id**

- **Found during:** Task 3 (first phase3 test run)
- **Issue:** The trigger looks up the user's default role from `user_roles is_default = true` to decide whether to set `instructor_id` or `student_id` on the shadow reservation. The seeded `userA` had `admin` as default, which matched neither branch, so the shadow reservation came back with both columns null and the test assertion failed.
- **Fix:** The test now demotes `userA`'s admin role to `is_default = false` and inserts an `instructor` row with `is_default = true` before creating the unavailability. This is test-only setup; the trigger contract is unchanged.
- **Files modified:** tests/rls/phase3-scheduling.test.ts
- **Commit:** 0243e81

### Rule 4 (Architectural) decisions deferred

None — the plan was tight enough that no plan-level course corrections were needed. The 8-enum count, 9-table count, and constraint shape all matched the locked decisions in 03-CONTEXT.md exactly.

## Authentication Gates

None encountered. All work was schema/migration/test-only against the local Supabase stack.

## Self-Check: PASSED

Verified:

- 13 created files exist (7 schema files, 2 migration files in packages/db, 2 mirrored to supabase/, 2 test files): all FOUND
- 3 commits exist (9d7c569, dc72f56, 0243e81): all FOUND
- 80/80 tests pass on the live local Supabase stack
- Four exclusion constraints, btree_gist extension, and 3 PL/pgSQL functions present in the database
