---
phase: 04-camp-maintenance
plan: 01
subsystem: camp-data-model
tags: [schema, rls, audit, migrations, drizzle, camp]
requires:
  - phase 1 audit + hard-delete-blocker scaffold
  - phase 2 aircraft / aircraft_engine / users / mechanic_authority enum
  - phase 3 aircraft_squawk + grounded_at column
provides:
  - 16 CAMP tables (maintenance_item + templates, ADs + compliance + history,
    aircraft_component + overhaul, work_order + task + parts consumption,
    part + part_lot, logbook_entry, maintenance_overrun, downtime_forecast)
  - 12 new enums + new squawk_status enum
  - aircraft.grounded_reason + aircraft.grounded_by_item_id columns
  - aircraft_squawk lifecycle columns (status, triage, deferral, RTS, work_order_id)
  - logbook seal trigger (immutable once sealed=true)
  - append-only RLS on ad_compliance_history + aircraft_component_overhaul
  - cross-tenant phase4-camp.test.ts (21 assertions)
affects:
  - aircraft (added grounded_reason + grounded_by_item_id)
  - aircraft_squawk (lifecycle expansion)
  - packages/db/src/schema/index.ts (8 new re-exports)
tech_added:
  - none (extends existing drizzle / postgres / vitest stack)
patterns:
  - "pgPolicy `to: 'authenticated'` STRING LITERAL (Phase 1 fix preserved)"
  - 'school_id + nullable-base RLS predicate from Phase 2/3'
  - 'split enum migration (0009) from usage migration (0010) — Postgres ALTER TYPE caveat'
  - 'audit.attach() = audit + hard-delete blocker bundled'
  - 'append-only via ALL-policy returning false for UPDATE/DELETE'
key_files:
  created:
    - packages/db/migrations/0009_phase4_enums.sql
    - packages/db/migrations/0010_phase4_camp_tables.sql
    - supabase/migrations/20260408000002_phase4_enums.sql
    - supabase/migrations/20260408000003_phase4_camp_tables.sql
    - packages/db/src/schema/maintenance_item.ts
    - packages/db/src/schema/ads.ts
    - packages/db/src/schema/aircraft_component.ts
    - packages/db/src/schema/work_order.ts
    - packages/db/src/schema/part.ts
    - packages/db/src/schema/logbook_entry.ts
    - packages/db/src/schema/maintenance_overrun.ts
    - packages/db/src/schema/downtime_forecast.ts
    - tests/rls/phase4-camp.test.ts
  modified:
    - packages/db/src/schema/enums.ts
    - packages/db/src/schema/aircraft.ts
    - packages/db/src/schema/squawks.ts
    - packages/db/src/schema/index.ts
decisions:
  - Created squawk_status as a NEW enum (Phase 3 had no enum, only resolved_at)
  - maintenance_item.base_id is nullable; RLS predicate widens "or base_id is null"
  - airworthiness_directive uniqueness uses coalesce(school_id, sentinel uuid) for partial unique
  - logbook_entry has NO deleted_at column (retention contract)
  - maintenance_overrun once-only invariant via partial unique index on item_id where revoked_at is null
  - Append-only event tables (ad_compliance_history, aircraft_component_overhaul) use audit-only triggers
metrics:
  duration: 35m
  tasks: 2
  files: 17
  tests_added: 21
  tests_total: 119
  completed: 2026-04-08
---

# Phase 4 Plan 01: CAMP Data Model Summary

Schema-first foundation for the entire Phase 4 CAMP engine: 16 tables, 12 enums, RLS on every table, audit + hard-delete protection on safety-relevant tables, logbook seal immutability, and a 21-assertion cross-tenant test suite — all green alongside the 98 baseline tests from Phases 1-3.

## What Shipped

### Migrations

**0009_phase4_enums.sql** — pure enum DDL, no use sites. Twelve new enum types covering maintenance items, work orders, parts, logbook books, AD compliance, and component lifecycles. Plus a brand-new `squawk_status` enum.

**0010_phase4_camp_tables.sql** — sixteen tables, indexes, RLS policies, audit hooks, and the logbook seal trigger. Hand-authored, mirrored verbatim into `supabase/migrations/`.

### Tables created

| #   | Table                            | Notes                                                 |
| --- | -------------------------------- | ----------------------------------------------------- |
| 1   | `maintenance_item`               | unified items, jsonb interval_rule, status enum       |
| 2   | `maintenance_item_template`      | school-scoped or global (school_id null)              |
| 3   | `maintenance_item_template_line` | per-template line items                               |
| 4   | `airworthiness_directive`        | catalog; partial unique on (school_id, ad_number)     |
| 5   | `aircraft_ad_compliance`         | per-aircraft AD state                                 |
| 6   | `ad_compliance_history`          | append-only event log                                 |
| 7   | `aircraft_component`             | serial-tracked components with life limits            |
| 8   | `aircraft_component_overhaul`    | append-only event log                                 |
| 9   | `work_order`                     | lifecycle + signer snapshots                          |
| 10  | `work_order_task`                | required_authority gating                             |
| 11  | `work_order_part_consumption`    | quantity > 0 check                                    |
| 12  | `part`                           | inventory; partial unique on (school_id, part_number) |
| 13  | `part_lot`                       | lot/serial-tracked stock                              |
| 14  | `logbook_entry`                  | sealed-immutable, NO deleted_at                       |
| 15  | `maintenance_overrun`            | §91.409(b) overrun, once-only-per-cycle invariant     |
| 16  | `aircraft_downtime_forecast`     | cache table (1 row per aircraft)                      |

### Schema extensions

- `aircraft`: added `grounded_reason text`, `grounded_by_item_id uuid` (FK to `maintenance_item` declared post-creation).
- `aircraft_squawk`: added `status squawk_status not null default 'open'`, `triaged_at`, `triaged_by`, `deferred_until`, `deferral_justification`, `work_order_id` (FK declared post-`work_order` creation), `returned_to_service_at`, `returned_to_service_signer_snapshot`.

### Triggers

- **`fn_logbook_entry_block_update`** (BEFORE UPDATE on `logbook_entry`): raises P0001 if `OLD.sealed = true`. Validates that the `false → true` sealing transition supplies both `signer_snapshot` and `signed_at`.
- **`audit.attach('<table>')`** on every safety-relevant table — same helper Phases 1-3 use; bundles audit log + hard-delete blocker.
- Audit-only triggers (no hard-delete blocker) on `maintenance_item_template_line`, `ad_compliance_history`, `aircraft_component_overhaul`, `aircraft_downtime_forecast`.

### RLS pattern

Every table gets the Phase 2/3 standard predicate:

```sql
school_id = (auth.jwt() ->> 'school_id')::uuid
and (
  (auth.jwt() ->> 'active_role') = 'admin'
  or base_id::text = current_setting('app.base_id', true)
  or current_setting('app.base_id', true) is null
  or base_id is null
)
```

The trailing `or base_id is null` is new in Phase 4 because several CAMP tables have nullable `base_id` (cross-base inventory, school-wide ADs, etc). Append-only tables use a four-policy pattern: SELECT scoped by school, INSERT with check, UPDATE/DELETE returning `false`.

`pgPolicy({ to: 'authenticated' })` is consistently a **string literal** — the Phase 1 regression bug stays fixed.

## Deviations from Plan

### Auto-fixed

**1. [Rule 1 — Bug] `squawk_status` did not exist; created instead of altered**

- **Found during:** Task 1 (writing 0009)
- **Issue:** Plan and CONTEXT both said "extend Phase 3 `squawk_status` enum via ALTER TYPE." But Phase 3 only created `squawk_severity` (info/watch/grounding) and tracked open/resolved via the nullable `resolved_at` column — no `squawk_status` enum existed.
- **Fix:** Migration 0009 creates `squawk_status` from scratch with all seven Phase 4 values (open, triaged, deferred, in_work, fixed, returned_to_service, cancelled). Migration 0010 adds the `status` column to `aircraft_squawk` with default `'open'`.
- **Files modified:** `packages/db/migrations/0009_phase4_enums.sql`, `0010_phase4_camp_tables.sql`, `packages/db/src/schema/enums.ts`, `packages/db/src/schema/squawks.ts`
- **Commits:** `36f64da` (migrations), `dfc769d` (drizzle)

**2. [Rule 3 — Blocking] Forward-FK ordering required deferred constraint syntax**

- **Found during:** Task 1
- **Issue:** `maintenance_item.component_id` references `aircraft_component`, but `aircraft_component` is defined later in the same migration. Same situation for `maintenance_item.ad_compliance_id`, `maintenance_item.last_work_order_id`, and `aircraft_squawk.work_order_id`.
- **Fix:** Declared the columns as bare `uuid` first, then added the FK constraints via separate `ALTER TABLE ... ADD CONSTRAINT` statements after each referenced table exists. Drizzle schemas mirror this by declaring the columns as bare `uuid()` without `.references()`.
- **No data impact** — pure DDL ordering fix.

**3. [Rule 1 — Bug] CONTEXT said `mechanic_authority_kind`, code already had `mechanic_authority`**

- **Found during:** Task 1
- **Issue:** CONTEXT/RESEARCH referenced a new `mechanic_authority_kind` enum, but Phase 1 (`enums.ts`) already exported `mechanicAuthorityEnum` for `mechanic_authority` (`none|a_and_p|ia`).
- **Fix:** Reused the existing enum verbatim in 0010's `work_order_task.required_authority` and `maintenance_item_template_line.required_authority` columns, and in the corresponding Drizzle schemas. No new enum created.

### Asked / no-ops

None — Rules 1-3 covered every issue. No architectural decisions surfaced.

## Verification

| Gate                                                  | Result                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| `pnpm -r typecheck`                                   | green                                     |
| `pnpm -r lint`                                        | green (banned-term rule clean)            |
| `supabase db reset`                                   | applies 0000 → 0010 cleanly on a fresh DB |
| `pnpm --filter @part61/rls-tests test -- phase4-camp` | 21/21 green                               |
| Full RLS suite (15 files)                             | **119/119 green** (98 baseline + 21 new)  |
| Phase 3 `phase3-scheduling.test.ts` regression check  | 16/16 green                               |

## Phase 1-3 Tests Re-run (regression check)

All run via `pnpm --filter @part61/rls-tests test`:

- `phase3-scheduling.test.ts` 16/16
- `phase3-exclusion-concurrency.test.ts` 1/1
- `phase2-aircraft.test.ts` 6/6
- `phase2-personnel.test.ts` 14/14
- `phase2-tenant-context.test.ts` 6/6
- `phase2-views.test.ts` 5/5
- `cross-tenant.test.ts` 10/10
- `documents-storage.test.ts` 6/6
- `api-schedule.test.ts` 10/10
- `api-dispatch.test.ts` 3/3
- `api-fif.test.ts` 5/5
- `api-admin-people.test.ts` 6/6
- `api-admin-aircraft.test.ts` 6/6
- `api-register.test.ts` 4/4

Zero regressions. Every prior assertion still holds.

## Commits

- `36f64da` — feat(04-01): phase 4 CAMP enums + tables migration
- `dfc769d` — feat(04-01): drizzle schemas + phase 4 RLS test suite

## Ready for Plan 04-02

Plan 04-02 will layer on top:

- `maintenance_next_due()` SQL function reading `aircraft_current_totals`
- `component_life_remaining()` SQL function
- AD ↔ maintenance_item bridging trigger
- Component ↔ maintenance_item bridging trigger
- Replacement body for `is_airworthy_at()` (maintenance items + AD compliance + components + active overruns)
- `aircraft_next_grounding_forecast()` cache refresh trigger
- `apply_ads_to_aircraft()` helper

## Self-Check: PASSED

All claimed files exist on disk; both commit hashes resolve in `git log`.
