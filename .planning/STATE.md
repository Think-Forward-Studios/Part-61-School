---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_plan: 5
status: verifying
last_updated: '2026-04-09T00:56:12.744Z'
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 18
  completed_plans: 17
  percent: 94
---

# STATE: Part 61 School

**Last updated:** 2026-04-08 (post 03-01 execution)

## Project Reference

**Core Value:** Give a Part 61 school a single source of truth for fleet, training, and scheduling so it can operate as professionally as a 141 school.

**Current Focus:** Phase 3 — scheduling & dispatch execution.

## Current Position

- **Phase:** 04-camp-maintenance
- **Current Plan:** 5
- **Total Plans in Phase:** 5
- **Status:** Phase complete — ready for verification
- **Progress:** [█████████░] 94%

## Performance Metrics

- Phases complete: 0/8
- Plans complete: 4 autonomous (01-01, 01-02, 01-03, 01-04); consolidated human-verify pending
- v1 requirements mapped: 136/136

| Phase                                      | Plan   | Duration | Tasks    | Files |
| ------------------------------------------ | ------ | -------- | -------- | ----- |
| 01                                         | 01     | ~6m      | 3        | 33    |
| 01                                         | 02     | 12m      | 3        | 27    |
| 01                                         | 03     | —        | 3        | —     |
| 01                                         | 04     | ~25m     | 2        | 11    |
| 02                                         | 01     | 10m      | 3        | 22    |
| 02                                         | 02     | ~4m      | 2        | 9     |
| Phase 02 P03                               | 20m    | 2 tasks  | 36 files |
| Phase 03-scheduling-dispatch-execution P01 | 28m    | 3 tasks  | 17 files |
| Phase 03-scheduling-dispatch-execution P02 | 22m    | 2 tasks  | 17 files |
| Phase 03-scheduling-dispatch-execution P03 | 24m    | 2 tasks  | 24 files |
| Phase 03-scheduling-dispatch-execution P04 | 18 min | 2 tasks  | 12 files |
| Phase 03-scheduling-dispatch-execution P05 | 7m     | 2 tasks  | 8 files  |
| Phase 04 P01                               | 35m    | 2 tasks  | 17 files |
| Phase 04-camp-maintenance P02              | 9m     | 2 tasks  | 6 files  |
| Phase 04-camp-maintenance P03              | 25m    | 2 tasks  | 21 files |
| Phase 04-camp-maintenance P04              | 10m    | 2 tasks  | 21 files |
| Phase 04-camp-maintenance P05              | 20m    | 1 tasks  | 9 files  |

## Accumulated Context

### Key Decisions

- Build order: Foundation → Personnel+Fleet → Scheduling+Dispatch → CAMP → Syllabus Model → Syllabus Rules/Progression → ADS-B → Experience/Reporting/Beta
- ADS-B is integration with existing service at `/Users/christopher/Desktop/ADS-B Data` (REST at port 3002), not a rebuild
- Web-only for v1; mobile deferred to v2
- Multi-tenant RLS from day 1; single-tenant deploy; multi-base scoping from Phase 2
- `isAirworthyAt()` domain contract stubbed in Phase 3, replaced for real in Phase 4
- Syllabus split into two phases: P5 builds the Course→Stage→Phase→Unit→Lesson→LineItem model, grading, records, and exports; P6 adds the active progression engine (rollover, rules, prerequisites, projections, nightly audit, next-activity suggestion)
- Personnel (PER) and instructor currencies/quals (IPF-01/02) land in Phase 2 so scheduling and dispatch can depend on them
- Flight Tracking & Dispatch (FTR) folded into Phase 3 alongside scheduling — dispatch IS scheduling execution
- Audit log and cost tracking (REP) consolidated in Phase 8 on top of the audit scaffolding from Phase 1
- Messaging (MSG) and multi-base reporting (MUL-03) are Phase 8 cross-cutting polish

### Decisions (01-01)

- ESLint flat config files use `.mjs` extension so the config package can stay CommonJS for Prettier/index entries
- Custom `part61/no-banned-terms` rule lives in-repo as a CommonJS file consumed via in-config plugin object — no separate plugin package
- Allow-comment lookup walks parent statements so `// allow-banned-term: <reason>` above a `const x = 'Part 141'` works
- CI pipeline shape locked: install → typecheck → lint → test → build; Supabase steps stubbed as YAML comment for plan 02 to insert

### Decisions (02-01)

- Base-scoped RLS policies use `current_setting('app.base_id', true)` with a nullable fallback so flows without a base context still work
- `aircraft_current_totals` uses correlated subqueries (not window functions) so the view is `security_invoker = true` safe and deterministically one row per aircraft
- `currency_status()` is STABLE (not IMMUTABLE) because `now()` is transaction-scoped
- Phase 2 child tables (aircraft_engine, aircraft_equipment, flight_log_entry_engine) inherit isolation via EXISTS against their parent — single source of truth
- `emergency_contact`, `info_release_authorization`, and `aircraft_equipment` get audit-only triggers (no hard-delete blocker) because they are not training-record-relevant

### Decisions (03-01)

- Two-file migration (0007 + 0008) to dodge `ALTER TYPE flight_log_entry_kind ADD VALUE` same-transaction caveat: 0007 adds enum values + everything else, 0008 replaces aircraft_current_totals to reference flight_out/flight_in.
- Drizzle has no DSL for partial `EXCLUDE USING gist`; the four reservation no-overlap constraints live ONLY in the hand-authored SQL migration. reservations.ts has a header comment pointing future readers there.
- Half-open tstzrange bounds enforced via CHECK (`lower_inc + not upper_inc`) so back-to-back reservations don't conflict.
- Shadow-row trigger on person_unavailability is SECURITY DEFINER + pinned `search_path = public`. Stores `shadow_reservation_id` on the unavailability row so update/delete don't need a fragile lookup.
- Concurrency test accepts BOTH 23P01 (exclusion_violation) and 40P01 (deadlock_detected) — Postgres can race-resolve overlapping gist inserts either way, both prove exactly-one-winner.
- Block-inflate trigger fires BEFORE INSERT so the exclusion constraint sees the inflated instructor/aircraft/room when it evaluates.
- room, fif_acknowledgement, and schedule_block_instance get audit-only triggers (no hard-delete blocker) because they aren't training-record-relevant.

### Decisions (04-01)

- `squawk_status` was created as a NEW enum in Phase 4 — Phase 3 had no such enum and tracked open/resolved via the nullable `resolved_at` column. Plan/CONTEXT mistakenly said "extend"; the executor created it from scratch and documented as a Rule 1 deviation.
- `logbook_entry` has NO `deleted_at` column — retention contract forbids soft-delete. Immutability is enforced via a BEFORE UPDATE seal trigger that raises P0001 on any UPDATE to a sealed row, and validates that the false→true sealing transition supplies both `signer_snapshot` and `signed_at`.
- Forward-FK cycles (`maintenance_item.component_id`, `.ad_compliance_id`, `.last_work_order_id`, `aircraft_squawk.work_order_id`) handled via post-creation `ALTER TABLE ADD CONSTRAINT`. Drizzle schemas mirror this with bare `uuid('foo_id')` columns (no `.references()`) to dodge TypeScript import cycles.
- `maintenance_overrun` once-only-per-cycle invariant enforced via partial unique index on `(item_id) WHERE revoked_at IS NULL AND deleted_at IS NULL`.
- Append-only event tables (`ad_compliance_history`, `aircraft_component_overhaul`) use four-policy RLS (SELECT scoped, INSERT with check, UPDATE/DELETE returning false) plus audit-only triggers.
- New base-scoped RLS predicate widens with `or base_id is null` because several CAMP tables (school-wide ADs, cross-base inventory) intentionally have nullable `base_id`.

### Decisions (03-02)

- Recurrence expansion happens server-side inside a single `withTenantTx` with a shared `series_id`; children are inserted with `status='requested'` so exclusion-constraint conflicts only fire later at `schedule.approve`.
- 23P01 exclusion-constraint violations are caught in schedule.approve/update and mapped to `TRPCError('CONFLICT')` with a resource-aware message ("the aircraft/instructor/student/room is already booked").
- Tstzrange lower-bound parser (`parseLowerBound`) in `schedule/reservations.ts` handles both Postgres's quoted-value format and the abbreviated `+00` offset — required because `new Date('2027-01-10T14:00:00+00')` is invalid.
- FIF unacked-gate in `dispatchReservation` checks the dispatching pilot: student if set, else instructor, else session userId.
- `dispatch.closeOut` pairs `flight_in` to `flight_out` by "most recent flight_out on this aircraft" instead of carrying the FK on the reservation row — good enough for v1.
- `fif.revoke` sets `expires_at = now() - 1s` so `listActive` excludes the notice immediately without a now()-tied equality race.
- Banned-term caveat honored: router user-facing messages say "confirmed" instead of "approved". Internal enum values stay `status='approved'`.

### Decisions (02-02)

- 02-01 nullable-fallback branch on base-scoped RLS is load-bearing — an unset `app.base_id` GUC intentionally allows non-admin reads so Phase 1 login flows (no base context yet) keep working. Plan 02-02's stricter "unset == 0 rows" test assertion was relaxed to document this contract.
- `custom_access_token_hook` RAISEs `account_not_active` for pending / inactive / rejected users instead of emitting empty-roles claims — gives login UX a clear, translatable error code (Research Pattern 8 §2).
- Cookie → server-validated → GUC: `part61.active_base_id` is re-validated against `user_base` on every request in BOTH `createContext` and the protected layout. Duplicated resolution intentional until a third site needs it.
- `Session.activeBaseId` is `string | null` (not optional) so downstream code must explicitly handle the no-base case.

### Decisions (01-02)

- pgPolicy `to:` field uses raw `sql\`authenticated\``literal (not`authenticatedRole`from`drizzle-orm/supabase`) — import-path-stable across Drizzle versions
- `packages/db/migrations/0000_init.sql` hand-authored (toolchain unavailable); plan 01-03 must diff against `drizzle-kit generate --name init` output
- `audit_log.user_id` is nullable; system-originated mutations set `actor_kind != 'user'`
- `audit_log` INSERT policy is `with check (false)`; only the SECURITY DEFINER trigger writes rows; UPDATE/DELETE revoked from authenticated/anon/public
- RLS Vitest harness uses raw postgres-js (not Drizzle, not supabase-js) so it can manipulate `request.jwt.claims` GUC and `set role authenticated` per call
- `users.id` is NOT defaultRandom — it mirrors Supabase `auth.users.id`
- Active role lives in `app.active_role` GUC (not JWT); the access token hook emits it for client convenience only

### Revision History

- 2026-04-06: Initial 7-phase roadmap created (75 requirements)
- 2026-04-06: Revised to 8 phases (75 → 136 requirements). Added personnel management, instructor performance, dispatch execution, audit/reporting, messaging, and multi-location categories. Split syllabus into model (P5) and progression engine (P6).

### Open Todos

- (none until planning begins)

### Blockers

- Plan 01-03 must pick up 6 deferred items from `.planning/phases/01-foundation-terminology-contract/deferred-items.md` BEFORE running verification gates: (1) add drizzle-orm/postgres/drizzle-kit to packages/db/package.json, (2) add `tests/*` to pnpm-workspace.yaml, (3) add Supabase setup+migrate steps to .github/workflows/ci.yml, (4) diff hand-authored 0000_init.sql against drizzle-kit generate, (5) fix husky pre-commit pnpm dependency, (6) verify Supabase CLI honors `[auth.hook.custom_access_token]` in config.toml

## Session Continuity

**Next action:** Execute `.planning/phases/04-camp-maintenance/04-02-PLAN.md`.

**Last session stopped at:** Completed 04-01-PLAN.md (commits 36f64da, dfc769d).
**Resume from:** None

**Files:**

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/research/` (SUMMARY, STACK, FEATURES, ARCHITECTURE, PITFALLS)

---

_State initialized: 2026-04-06_
_Revised: 2026-04-06 (post-expansion)_
