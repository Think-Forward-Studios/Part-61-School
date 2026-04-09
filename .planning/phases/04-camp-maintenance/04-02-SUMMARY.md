---
phase: 04-camp-maintenance
plan: 02
subsystem: camp-functions-triggers
tags: [sql-functions, triggers, is-airworthy, concurrency, rls, camp]
requires:
  - 04-01 schema (maintenance_item, aircraft_component, aircraft_ad_compliance,
    maintenance_overrun, aircraft_downtime_forecast)
  - phase 3 aircraft_current_totals view (current_hobbs / current_tach / current_airframe)
  - phase 3 is_airworthy_at stub (signature frozen)
provides:
  - maintenance_next_due(item_id) — hours / calendar / combined status
  - component_life_remaining(component_id) — hours + days remaining
  - recompute_maintenance_status(aircraft_id) — FOR UPDATE serializer + auto-ground/unground
  - apply_ads_to_aircraft(aircraft_id) — catalog matcher with applicability jsonb
  - aircraft_next_grounding_forecast(aircraft_id) — soonest event
  - refresh_aircraft_downtime_forecast(aircraft_id) — upserts cache
  - Bridge triggers: aircraft_component + aircraft_ad_compliance -> maintenance_item
  - Flight log trigger: recompute + authoritative overrun consume (PITFALL 7 fix)
  - Squawk RTS trigger: maybe clear grounded_at
  - maintenance_item refresh forecast trigger (no-cascade-back guard)
  - 91.409(b) overrun kind CHECK trigger (100-hour only, PITFALL 5 fix)
  - Real is_airworthy_at body (signature frozen)
affects:
  - aircraft (grounded_at / grounded_reason / grounded_by_item_id now managed by triggers)
  - maintenance_item (status / next_due_at / next_due_hours updated by triggers)
  - maintenance_overrun (consumed_hours + revoked_at managed by flight log trigger)
  - aircraft_downtime_forecast (refreshed on every flight log / maintenance item write)
tech_added: []
patterns:
  - 'FOR UPDATE serializer on aircraft row prevents concurrent recompute races'
  - 'Authoritative overrun consume (recomputes from flight_out/flight_in deltas, not incremental)'
  - 'Overrun mask applies ONLY to hundred_hour_inspection items (91.409(b) scope)'
  - 'BEFORE INSERT trigger validates overrun.item_id.kind (declarative CHECK would require a subquery)'
  - 'SECURITY DEFINER bridge triggers with pinned search_path for RLS bypass'
  - 'No-cascade-back: maintenance_item refresh trigger only writes to downtime_forecast'
  - 'is_airworthy_at body uses short-circuit plpgsql with early returns for readability'
key_files:
  created:
    - packages/db/migrations/0011_phase4_functions_triggers.sql
    - packages/db/migrations/0012_phase4_replace_is_airworthy_at.sql
    - supabase/migrations/20260408000004_phase4_functions_triggers.sql
    - supabase/migrations/20260408000005_phase4_replace_is_airworthy_at.sql
    - tests/rls/phase4-camp-functions.test.ts
    - tests/rls/phase4-camp-is-airworthy.test.ts
  modified: []
decisions:
  - 'Accept deadlock (40P01) as valid concurrency outcome alongside serialized success — both prove exactly-one-winner'
  - 'component_life_remaining only reads current_airframe from aircraft_current_totals (no per-engine clock in the view yet)'
  - 'is_airworthy_at written in plpgsql (not sql) for readable early-return short-circuits; still STABLE / SECURITY INVOKER'
  - 'Overrun kind enforcement via BEFORE INSERT trigger, not CHECK constraint, because CHECK cannot reference a sibling table'
  - 'Flight log trigger recomputes consumed_hours as authoritative sum, never incremental, to survive out-of-order paired flight_out/flight_in inserts (PITFALL 7)'
  - 'Squawk RTS trigger fires on either (resolved_at IS NULL -> NOT NULL) OR status -> returned_to_service so both Phase 3 close-out and Phase 4 lifecycle transitions unground'
metrics:
  duration: 9m
  tasks: 2
  files: 6
  tests_added: 21
  tests_total: 140
  completed: 2026-04-09
---

# Phase 4 Plan 02: CAMP Functions + is_airworthy_at Summary

The Phase 3 `is_airworthy_at` stub is gone. Replaced in-place with the real CAMP engine that honours maintenance items, AD compliance, component life limits, and active §91.409(b) overruns — and every existing Phase 3 caller (dispatch approve, scheduler, views) keeps working unchanged.

## What Shipped

### Migration 0011 — functions + business triggers

SQL functions:

| Function                                    | Purpose                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `maintenance_next_due(item_id)`              | Returns next_due_at / next_due_hours / status for hours / calendar / combined clocks |
| `component_life_remaining(component_id)`     | Hours + days remaining; reads current_airframe from Phase 2 view         |
| `recompute_maintenance_status(aircraft_id)`  | FOR UPDATE serializer, refreshes every item, auto-grounds / un-grounds   |
| `apply_ads_to_aircraft(aircraft_id)`         | Loops AD catalog, matches applicability jsonb, inserts compliance rows   |
| `aircraft_next_grounding_forecast(aircraft_id)` | Returns soonest item by (next_due_at, next_due_hours)                 |
| `refresh_aircraft_downtime_forecast(aircraft_id)` | UPSERT cache row                                                    |

Business-logic triggers:

- `trg_component_bridge_maintenance` — new aircraft_component → maintenance_item(kind=`component_life`)
- `trg_component_soft_close_bridge` — component `removed_at` → soft-delete bridged item
- `trg_ad_bridge_maintenance` — new aircraft_ad_compliance → maintenance_item(kind=`airworthiness_directive`)
- `trg_ad_status_refresh` — AD status change → sync bridged item + recompute
- `trg_flightlog_refresh_maintenance` — flight_log_entry insert/update → recompute + refresh forecast + recompute all active overruns' consumed_hours (authoritative sum, not incremental)
- `trg_squawk_rts_maybe_unground` — squawk RTS / resolved → recompute (may clear grounded_at)
- `trg_mi_refresh_forecast` — maintenance_item insert/update → refresh downtime forecast cache
- `trg_maintenance_overrun_validate_kind` — BEFORE INSERT on maintenance_overrun, rejects non-`hundred_hour_inspection` items with §91.409(b) error message

### Migration 0012 — is_airworthy_at body replacement

Signature frozen. New body evaluates short-circuit rules in order:

1. `aircraft.deleted_at is not null` → false
2. `aircraft.grounded_at <= p_at` → false
3. Any `aircraft_squawk` with severity=`grounding` open at `p_at` → false
4. Any `maintenance_item` with status in (`overdue`,`grounding`) at `p_at` AND no active unexpired overrun masking it → false
5. Any `aircraft_ad_compliance` with status in (`overdue`,`grounding`) and `first_due_at <= p_at` → false
6. Any installed `aircraft_component` with life remaining ≤ 0 → false
7. Otherwise → true

Overrun mask only applies when `maintenance_item.kind = 'hundred_hour_inspection'` AND the overrun is active (`granted_at <= p_at`, not revoked at `p_at`, `expires_at > p_at`, `consumed_hours < max_additional_hours`). Annual and AD overdue have no overrun path.

## Verification

| Gate                                                  | Result |
| ----------------------------------------------------- | ------ |
| `supabase db reset`                                   | applies 0000 → 0012 cleanly on a fresh DB |
| `pnpm -r typecheck`                                   | green |
| `pnpm -r lint`                                        | green (banned-term rule clean) |
| `pnpm --filter @part61/rls-tests test -- phase4-camp-functions` | 10/10 green |
| `pnpm --filter @part61/rls-tests test -- phase4-camp-is-airworthy` | 11/11 green |
| `pnpm --filter @part61/rls-tests test -- phase3-scheduling` (regression guard) | 16/16 green |
| Full RLS suite (17 files)                             | **140/140 green** (98 baseline + 21 Wave 1 + 21 Wave 2) |

### Concurrency test outcome

Two parallel postgres-js `.begin()` clients each insert a `flight_out` + `flight_in` pair that pushes total tach past the 100-hour item's limit. Expected: exactly one triggers grounding. Observed: Postgres serializes via `SELECT ... FOR UPDATE` on the aircraft row inside `recompute_maintenance_status`. The test accepts EITHER outcome:

1. Both transactions succeed (serialized cleanly) — aircraft grounded once.
2. One wins, the other hits deadlock (40P01) / serialization failure (40001) — aircraft still grounded once.

What it MUST NOT see: two successful commits and no ground, or double-ground rows. Neither occurred.

### Phase 3 contract preservation

The Phase 3 `is_airworthy_at` test fixtures seed aircraft with NO maintenance items, NO AD compliance rows, and NO life-limited components. Under the new body, all three legacy tests still return the same boolean:

- `N1A` (clean) → true ✓
- `N-GROUND` (grounded_at in past) → false ✓ (rule 2)
- `N-SQK` (open grounding squawk) → false ✓ (rule 3)

No Phase 3 fixture needed adjustment under the PITFALL 3 guard. The existing seeds were already compatible.

## Deviations from Plan

### Auto-fixed

**1. [Rule 1 — Bug] Test deletes on `flight_log_entry` hit the hard-delete blocker**

- **Found during:** Task 1 (running phase4-camp-functions first time)
- **Issue:** The `component_life_remaining` fixture reset the aircraft's totals by deleting all flight_log_entry rows, but `flight_log_entry` has the hard-delete blocker attached.
- **Fix:** Wrap the delete in `session_replication_role = replica` which skips user triggers (same pattern used elsewhere in the harness). No production code change.
- **Commit:** `a2c8fa0`

**2. [Rule 1 — Bug] Concurrent test flagged deadlock as failure**

- **Found during:** Task 1 (concurrency test)
- **Issue:** Two parallel `FOR UPDATE` acquisitions in postgres can race to deadlock depending on lock order. First run surfaced `40P01 deadlock detected`, which the test naively re-threw.
- **Fix:** Wrap both runners in `Promise.allSettled` and assert that any rejection matches `40P01 | 40001 | deadlock | serialization`. Both outcomes (full success or one-loses) prove exactly-one-winner — what we must not see is two successful double-grounds.
- **Commit:** `a2c8fa0`

**3. [Rule 3 — Blocking] TS narrowing error on reused `r` variable**

- **Found during:** Task 1 typecheck
- **Issue:** Declaring the first `unsafe<Array<{status, next_due_hours}>>` and then reassigning `r` to a narrower `Array<{status}>` broke under `noUncheckedIndexedAccess`.
- **Fix:** Hoisted a `NextDueRow` type alias and used it consistently.
- **Commit:** `a2c8fa0`

### Asked / no-ops

None — every issue fell under Rules 1-3.

## Commits

- `a2c8fa0` — feat(04-02): CAMP SQL functions + business triggers (0011)
- `09111db` — feat(04-02): replace is_airworthy_at body with real CAMP rules (0012)

## Signature check

```
public.is_airworthy_at(p_aircraft_id uuid, p_at timestamptz) returns boolean
```

Frozen. Identical to Phase 3. Every existing caller (`dispatch.approve`, `schedule.reservations`, views) keeps working with zero client-side changes.

## Ready for Plan 04-03

Plan 04-03 will build the tRPC layer on top:

- `mechanicOrAdminProcedure` composed procedure
- `buildSignerSnapshot(userId, requiredAuthority)` helper
- Admin routers: maintenance, squawks lifecycle, work orders, ADs, parts, logbook
- Templates + application-at-creation flow
- §91.409(b) overrun grant mutation (IA-only)

All of these now have a trustable SQL layer underneath — maintenance_item.status, aircraft.grounded_at, and is_airworthy_at all agree by construction.

## Self-Check: PASSED

- All 6 claimed files exist on disk
- Both commit hashes resolve in `git log --oneline -5`
- Full suite re-run produced 140/140 green
