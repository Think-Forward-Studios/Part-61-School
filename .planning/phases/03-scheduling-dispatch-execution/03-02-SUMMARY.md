---
phase: 03-scheduling-dispatch-execution
plan: 02
subsystem: scheduling-api
tags: [scheduling, dispatch, fif, trpc, phase3]
one_liner: "tRPC schedule/dispatch/fif routers with server-enforced is_airworthy_at, person_hold, FIF-ack, exclusion-conflict mapping, and paired flight_out/flight_in writes"
status: complete
completed: 2026-04-08
duration_minutes: 22
tasks_completed: 2
files_changed: 17
commits:
  - ba0c8e6 feat(03-02) schedule.* router with reservations, recurring, blocks, freebusy, rooms
  - 38119a6 feat(03-02) dispatch + fif + admin/squawks routers with integration tests
dependency_graph:
  requires:
    - phase-03 plan 01 scheduling schema (reservation, is_airworthy_at, free_busy, fif_notice, aircraft_squawk)
    - phase-02 personnel + flight_log_entry + person_hold + no_show
    - phase-01 withTenantTx, protectedProcedure, adminProcedure
  provides:
    - appRouter.schedule (request, approve, list, update, cancel, markNoShow, getById, recurring, blocks, freebusy)
    - appRouter.dispatch (list, markStudentPresent, authorizeRelease, dispatchReservation, closeOut, openSquawk, passengerManifestUpsert)
    - appRouter.fif (listActive, listUnacked, acknowledge, post, revoke)
    - appRouter.admin.rooms (list, create, update, softDelete)
    - appRouter.admin.squawks (list, resolve)
    - instructorOrAdminProcedure middleware composition
  affects:
    - packages/domain schedule zod schemas
tech-stack:
  added: []
  patterns:
    - Partial EXCLUDE conflict mapping SQLSTATE 23P01 → friendly TRPCError('CONFLICT')
    - Server-side recurrence expansion in single withTenantTx — all children share series_id
    - Tstzrange lower-bound parser that handles "[+00]" abbreviated offset
    - FIF acknowledgement gate as a NOT EXISTS query inside dispatchReservation
    - Paired flight_log_entry write with paired_entry_id FK back to the matching flight_out row
key-files:
  created:
    - packages/api/src/routers/schedule.ts
    - packages/api/src/routers/schedule/reservations.ts
    - packages/api/src/routers/schedule/recurring.ts
    - packages/api/src/routers/schedule/blocks.ts
    - packages/api/src/routers/schedule/freebusy.ts
    - packages/api/src/routers/dispatch.ts
    - packages/api/src/routers/fif.ts
    - packages/api/src/routers/admin/rooms.ts
    - packages/api/src/routers/admin/squawks.ts
    - packages/domain/src/schemas/schedule.ts
    - tests/rls/api-schedule.test.ts
    - tests/rls/api-dispatch.test.ts
    - tests/rls/api-fif.test.ts
  modified:
    - packages/api/src/procedures.ts
    - packages/api/src/routers/_root.ts
    - packages/api/src/routers/admin/_root.ts
    - packages/domain/src/index.ts
decisions:
  - "Reservation conflict check via the EXCLUDE constraint runs on UPDATE during approve (because only status in ('approved','dispatched','flown') participates). requested rows can overlap freely. Server maps SQLSTATE 23P01 to TRPCError('CONFLICT') with a resource-aware message."
  - "Recurrence expansion runs inside a single withTenantTx — if any child insert fails, the whole series rolls back. But since children are inserted with status='requested', the exclusion constraint does NOT fire at creation time; conflicts only appear later at approve."
  - "Tstzrange literal lower-bound parser needs two fixes over a naive `match(/^\\[([^,]+),/)`: (1) Postgres wraps quoted strings when the value contains whitespace, (2) Postgres abbreviates `+00:00` to `+00` which JS Date() rejects. The parseLowerBound helper handles both."
  - "FIF unacked gate in dispatchReservation queries against the dispatching pilot. When the reservation has a student, that's the student. When it's solo/instructor-only, that's the instructor. When neither, the dispatcher."
  - "closeOut decides flight_out pairing by 'most recent flight_out on this aircraft' rather than carrying the flight_log_entry_id on the reservation. Good enough for v1; a future refactor can make it a reservation column if we see issues."
  - "admin/squawks compose mechanicOrAdminProcedure inline instead of adding another shared procedure — only one router needs it in Phase 3."
  - "fif.revoke sets expires_at = now() - 1 second so listActive excludes the revoked notice immediately (avoids now()-tied equality race)."
  - "Banned-term caveat honored: router error messages use 'confirmed' instead of 'approved' when describing user-facing state. Internal enum values (status='approved') are unchanged."
metrics:
  duration_minutes: 22
  tests_added: 18
  tests_passing: 98
  baseline_phase3_plan1_tests: 80
  new_phase3_plan2_tests: 18
---

# Phase 3 Plan 02: Scheduling & Dispatch API Summary

All Phase 3 server-side business rules are now locked behind tRPC procedures and integration-tested against the live local Supabase Postgres. The UI plans 03-03/04 are thin pass-throughs — scheduling state transitions, FIF gates, airworthiness checks, and the paired flight_log write for dispatch/close-out live here.

## Scope Delivered

- **Schedule router:**
  - `schedule.request` — zod-validated insert with optional server-side recurrence expansion (single tx, shared series_id)
  - `schedule.approve` — instructorOrAdminProcedure, re-checks `is_airworthy_at()` + active `person_hold`, catches 23P01 and maps to user-friendly CONFLICT with the colliding resource named
  - `schedule.list` — mode 'mine' | 'full' | 'freebusy'; server enforces role → mode mapping
  - `schedule.update`, `schedule.cancel`, `schedule.markNoShow`, `schedule.getById`
  - `schedule.cancel` derives `cancelled_free` / `cancelled_late` from current time vs reservation start
  - `schedule.markNoShow` writes a Phase 2 `no_show` row when the reservation had a student
  - `schedule.recurring.cancelScope` — `occurrence | following | series`
  - `schedule.blocks.create/list/delete` — materializes `schedule_block_instance` children
  - `schedule.freebusy.forResource` — wraps `public.free_busy()` SRF
- **Dispatch router:**
  - `dispatch.list` returns `{ currentlyFlying, aboutToFly, recentlyClosed }`
  - `dispatch.markStudentPresent`, `dispatch.authorizeRelease` for the two-tick electronic dispatch sheet
  - `dispatch.dispatchReservation` — approved-only, student check-in, instructor authorization, all FIF acked, `is_airworthy_at(now)` for flight, Hobbs/tach required, writes `flight_log_entry kind='flight_out'`, transitions to `dispatched`
  - `dispatch.closeOut` — writes `flight_log_entry kind='flight_in'` with `paired_entry_id` FK, creates any observed squawks, auto-grounds aircraft when severity='grounding', transitions to `closed` (if instructor sign-off) or `pending_sign_off`
  - `dispatch.openSquawk`, `dispatch.passengerManifestUpsert`
- **FIF router:** `fif.listActive`, `fif.listUnacked`, `fif.acknowledge` (idempotent upsert), `fif.post` (admin), `fif.revoke` (admin — expires_at to past)
- **admin/rooms** — CRUD (admin)
- **admin/squawks** — `list` + `resolve` (mechanic or admin)
- **instructorOrAdminProcedure** added to `packages/api/src/procedures.ts`
- **18 new API integration tests** across `api-schedule.test.ts`, `api-dispatch.test.ts`, `api-fif.test.ts`

## Verification Gate Results

| Gate | Result |
| ---- | ------ |
| `pnpm -r typecheck` | clean |
| `pnpm -r lint` | clean (no banned terms in user-facing strings) |
| `scripts/check-service-role-usage.sh` | OK — service-role scoped correctly |
| `pnpm --filter @part61/rls-tests test` | 98/98 passing (80 Phase 3 plan 01 baseline + 18 new) |
| Conflict-error mapping | 23P01 → TRPCError('CONFLICT') with "Schedule conflict: the aircraft/instructor/... is already booked" message |
| Airworthiness gate | approve against grounded aircraft rejected with "Aircraft is not airworthy" |
| FIF gate | dispatch against unacked critical notice rejected with "Flight Information File notices must be read before dispatch" |
| Paired flight log | flight_in row has paired_entry_id pointing to the matching flight_out |
| Grounding auto-ground | closeOut squawk severity='grounding' sets aircraft.grounded_at |
| no_show write-through | schedule.markNoShow inserts a Phase 2 no_show row when student is attached |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tstzrange lower-bound parsing**

- **Found during:** Task 1, running api-schedule tests the first time
- **Issue:** Naive regex `^\[([^,]+),/` grabs `"2027-01-10 14:00:00+00"` WITH quotes when Postgres renders the literal. Stripping the quote still leaves `+00` without minutes, which `new Date()` rejects as "Invalid time value". All three procedures that parse the lower bound (approve, cancel, markNoShow) hit it.
- **Fix:** Added a `parseLowerBound()` helper that handles both the quoted-inside variant and expands `+HH` → `+HH:00`. Called from all three sites.
- **Files modified:** packages/api/src/routers/schedule/reservations.ts
- **Commit:** ba0c8e6

**2. [Rule 1 - Bug] `fif.revoke` race against `listActive` time filter**

- **Found during:** Task 2, running api-fif tests
- **Issue:** Setting `expires_at = now()` in revoke, then calling listActive which filters on `expires_at > now()`, is a fence race even across separate transactions — occasional failures where the revoked notice still appeared.
- **Fix:** `fif.revoke` now sets `expires_at = new Date(Date.now() - 1000)` — one second in the past — so `expires_at > now()` is unambiguously false.
- **Files modified:** packages/api/src/routers/fif.ts
- **Commit:** 38119a6

**3. [Rule 3 - Blocking] Test constraint-conflict with reused instructor id**

- **Found during:** Task 2, the auto-ground closeOut test
- **Issue:** Two sequential tests in api-dispatch.test.ts used the same seed instructorId with overlapping approved reservations. The second approve tripped the instructor_no_overlap exclusion constraint, not because of a bug in the router, but because the test harness didn't stagger the fixtures.
- **Fix:** The grounding-squawk test now creates the reservation with `instructorId`/`studentId` omitted (null) so it can't collide with the happy-path fixture.
- **Files modified:** tests/rls/api-dispatch.test.ts
- **Commit:** 38119a6

### Rule 4 (Architectural) decisions deferred

None. The plan matched the code shape cleanly.

## Authentication Gates

None. All work is router + test code against the local Supabase stack.

## Self-Check: PASSED

- 13 created files exist: all FOUND
- 2 commits (ba0c8e6, 38119a6): all FOUND via `git log --oneline`
- 98/98 tests pass on the live local Supabase stack
- Full suite lints clean, typechecks clean, no banned terms surface in user-facing router error strings
