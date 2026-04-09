---
phase: 04-camp-maintenance
plan: 03
subsystem: camp-trpc-routers
tags: [trpc, routers, signer-snapshot, camp, integration-tests]
requires:
  - 04-01 schema (maintenance_item, ads, work_order, part, logbook_entry, maintenance_overrun)
  - 04-02 SQL functions (maintenance_next_due, recompute_maintenance_status, apply_ads_to_aircraft, is_airworthy_at)
  - Phase 3 withTenantTx + adminProcedure / protectedProcedure pattern
provides:
  - mechanicOrAdminProcedure (composed)
  - buildSignerSnapshot + requireMechanicAuthority + getMechanicAuthority helpers
  - taskKindRequiredAuthority + booksTouchedByTaskKinds + bookForComponentKind helpers
  - admin.maintenance / admin.ads / admin.components / admin.workOrders / admin.parts / admin.logbook / admin.maintenanceTemplates / admin.overruns routers
  - admin.squawks extended to 5-state lifecycle (Phase 3 resolve preserved)
  - Work-order sign-off ceremony (tasks-all-complete gate, signer snapshot, per-book sealed logbook entries, source item/squawk update, recompute_maintenance_status)
  - FOR UPDATE parts consumption (lot and non-lot paths)
  - phase4-camp-api.test.ts (11 integration scenarios)
affects:
  - packages/api/src/routers/admin/_root.ts (8 new router registrations)
  - packages/api/src/procedures.ts (mechanicOrAdminProcedure)
  - packages/domain/src/index.ts (6 new re-exports)
tech_added: []
patterns:
  - 'Signer snapshot COPIED (Object.freeze) — mutating person_profile.faa_airman_cert_number does not retroactively alter past signatures'
  - 'mechanic_authority read from user_roles (max across roles) — helper handles multi-role mechanics'
  - 'interval_rule zod discriminated union at the router boundary — DB never sees garbage JSON'
  - 'Work order sign-off is a single withTenantTx txn: per-book sealed logbook insert + source item update + aircraft recompute'
  - 'Parts consumption uses raw SELECT ... FOR UPDATE via ctx.tx.execute(sql``) to serialize concurrent decrements'
  - 'Overrun.grant does TS kind-check (hundred_hour_inspection only) + IA authority check before insert; DB trigger is defense #2'
  - 'ad.applyToFleet loops school aircraft, calls apply_ads_to_aircraft, counts delta of aircraft_ad_compliance rows per AD to return newComplianceRows'
  - 'squawk lifecycle: triage/moveToInWork/markFixed authenticate via buildSignerSnapshot (a_and_p) even though the snapshot isn''t persisted on those transitions — A&P authority gate reuse'
  - 'returnToService persists the snapshot into aircraft_squawk.returned_to_service_signer_snapshot and also stamps resolved_at so the trg_squawk_rts_maybe_unground trigger fires'
key_files:
  created:
    - packages/domain/src/schemas/intervalRule.ts
    - packages/domain/src/schemas/adApplicability.ts
    - packages/domain/src/schemas/signerSnapshot.ts
    - packages/domain/src/schemas/maintenance.ts
    - packages/domain/src/schemas/maintenanceKindLabels.ts
    - packages/api/src/helpers/signerSnapshot.ts
    - packages/api/src/helpers/maintenanceAuthority.ts
    - packages/api/src/helpers/workOrderBooks.ts
    - packages/api/src/routers/admin/maintenance.ts
    - packages/api/src/routers/admin/ads.ts
    - packages/api/src/routers/admin/components.ts
    - packages/api/src/routers/admin/workOrders.ts
    - packages/api/src/routers/admin/parts.ts
    - packages/api/src/routers/admin/logbook.ts
    - packages/api/src/routers/admin/maintenanceTemplates.ts
    - packages/api/src/routers/admin/overruns.ts
    - tests/rls/phase4-camp-api.test.ts
  modified:
    - packages/domain/src/index.ts
    - packages/api/src/procedures.ts
    - packages/api/src/routers/admin/squawks.ts
    - packages/api/src/routers/admin/_root.ts
decisions:
  - 'mechanic_authority lives on user_roles, NOT users (Phase 2 schema). buildSignerSnapshot queries max(mechanic_authority) across roles so a user with multiple role rows still resolves correctly.'
  - 'Signer snapshot is Object.frozen to document the copied-not-referenced contract at the TypeScript boundary on top of the JSONB copy contract at the DB layer.'
  - 'Integration tests landed in tests/rls/ (the existing @part61/rls-tests package) instead of a new tests/api/ workspace — avoids a second vitest config and reuses harness/api-caller scaffolding.'
  - 'consumePart emits raw SQL for SELECT ... FOR UPDATE because Drizzle''s query builder does not expose row locking cleanly; the rest of the router stays on Drizzle.'
  - 'admin.ads.applyToFleet counts delta per aircraft by taking before/after snapshots of aircraft_ad_compliance — the underlying SQL function does not return a count by AD id, only total inserts.'
  - 'squawks.triage/moveToInWork/markFixed call buildSignerSnapshot(... a_and_p) to reuse the auth gate even though they don''t persist the snapshot. This enforces mechanic_authority on every transition without a separate role-check helper.'
  - 'Overrun.grant catches unique-violation errors and maps to TRPCError(CONFLICT) so the partial unique index message stays as an integrity rail.'
  - 'No new parts.on_hand_qty trigger shipped in plan 04-01, so receiveLot and consumePart both patch part.on_hand_qty directly inside the same transaction — authoritative sync.'
metrics:
  duration: 25m
  tasks: 2
  files: 21
  tests_added: 11
  tests_total: 151
  completed: 2026-04-09
---

# Phase 4 Plan 03: CAMP tRPC Routers Summary

Plan 04-03 ships the full tRPC surface for CAMP: composed procedures, signer snapshot plumbing, eight admin routers (maintenance, ads, components, workOrders, parts, logbook, maintenanceTemplates, overruns), an extended squawks router with the 5-state lifecycle, and 11 integration scenarios proving every ceremony contract end-to-end.

## What Shipped

### Procedures + helpers

- `mechanicOrAdminProcedure` in `packages/api/src/procedures.ts` — one-liner composition on top of `protectedProcedure` with `requireRole('mechanic','admin')`.
- `buildSignerSnapshot(tx, userId, required)` in `packages/api/src/helpers/signerSnapshot.ts` — validates authority, pulls first_name/last_name/faa_airman_cert_number, returns a frozen copy. Throws `FORBIDDEN` on insufficient authority, `PRECONDITION_FAILED` on missing cert number, `NOT_FOUND` on missing user.
- `requireMechanicAuthority(actual, required)` — pure function, used in Work Order sign-off after computing the highest authority across tasks.
- `getMechanicAuthority(tx, userId)` — reads the highest authority across user_roles.
- `taskKindRequiredAuthority(kind)` — `annual_inspection → ia`, everything else → `a_and_p`.
- `booksTouchedByTaskKinds(kinds)` — annual → {airframe, engine, prop}; 100-hour → {airframe, engine}; oil_change → {engine}; everything else → {airframe}.
- `bookForComponentKind(kind)` — magneto/vacuum_pump/spark_plug/mag_points → engine; prop → prop; else → airframe.

### Domain schemas

- `intervalRuleSchema` — zod discriminated union on `clock` ∈ {hobbs, tach, airframe, engine, calendar, combined}. Positive-number + positive-int guards. Rejects `{clock:'hobbs', hours:-10}` and unknown clocks.
- `adApplicabilitySchema` — all-optional zod object matching the applicability jsonb shape from CONTEXT.
- `signerSnapshotSchema` — mirrors the runtime contract.
- `maintenance.ts` — TS type mirrors for enums (MaintenanceItemKind, WorkOrderKind, LogbookBook, etc.).
- `maintenanceKindLabels.ts` — display labels. No banned terms. Lives in `packages/domain/src/schemas/` which is outside the `no-banned-terms` file glob (`apps/web/**` + `packages/exports/**`).

### Routers

| Router | Key surface |
| --- | --- |
| `admin.maintenance` | list, get, create (interval_rule zod), update, complete (signer snapshot + recompute), listDueSoon |
| `admin.ads` | list, get, create (admin), update (admin), applyToFleet (loops fleet, counts new rows), recordCompliance (mechanic+signer) |
| `admin.components` | list, install, overhaul (signer), remove |
| `admin.workOrders` | list (keyset), get, create, addTask, completeTask (per-task signer), consumePart (FOR UPDATE), signOff (CEREMONY) |
| `admin.parts` | list, get, create, update, receiveLot, listLots, consumptionHistory |
| `admin.logbook` | list, createDraft, seal, correct |
| `admin.maintenanceTemplates` | list, get, create, applyToAircraft |
| `admin.overruns` | active, grant (IA only, 100-hour only), revoke |
| `admin.squawks` | Phase 3: list/resolve preserved. New: get, triage, moveToInWork, markFixed, returnToService (signer), cancel |

All registered in `packages/api/src/routers/admin/_root.ts`.

### Work order sign-off ceremony (`admin.workOrders.signOff`)

Single `withTenantTx` transaction:

1. Load WO, validate it exists and isn't already closed.
2. Load tasks, require ≥ 1 task and all `completed_at` set.
3. Compute `highestAuthority` across task `required_authority` values.
4. `buildSignerSnapshot(tx, userId, highest)` — throws if caller lacks authority or cert number.
5. Compute `booksTouchedByTaskKinds` from the provided `taskKinds` (falls back to WO `kind` mapping).
6. Insert one `logbook_entry` per book with `sealed=true`, `signer_snapshot`, `signed_at`.
7. If `source_maintenance_item_id`: update `last_completed_*` + `last_work_order_id`.
8. If `source_squawk_id`: set status=`returned_to_service`, write `returned_to_service_signer_snapshot`, set `resolved_at` (so `trg_squawk_rts_maybe_unground` fires).
9. Update WO: status=closed, signed_off_at, signed_off_by, signer_snapshot, return_to_service_time.
10. Call `public.recompute_maintenance_status(aircraft_id)` — may clear `aircraft.grounded_at`.

Returns `{ok, signer, logbookEntries}` with the book→id mapping.

### Integration test scenarios (all 11 green)

| # | Scenario | Assertion |
| - | - | - |
| 1 | student → `admin.maintenance.create` | throws FORBIDDEN |
| 2 | instructor → `admin.squawks.triage` | throws FORBIDDEN |
| 3 | A&P → interval_rule `{clock:'hobbs',hours:-10}` | zod throws |
| 4 | A&P → triage → in_work → markFixed → returnToService | status transitions correctly, returned snapshot has MECH_AP_CERT |
| 5 | mutate person_profile.faa_airman_cert_number after RTS | old squawk snapshot still has original cert number (historical integrity) |
| 6 | A&P → `admin.overruns.grant` (100-hour) | throws with "IA authority" |
| 7 | IA → `admin.overruns.grant` (100-hour) | succeeds, snapshot has MECH_IA_CERT |
| 8 | IA → `admin.overruns.grant` (annual) | throws (TS kind-check) |
| 9 | `admin.ads.applyToFleet` with C172 AD against C172 + PA-28 fleet | returns `{newComplianceRows: 1}`, PA-28 has 0 rows |
| 10 | Concurrent `admin.workOrders.consumePart` 5 + 5 on 7-qty lot | exactly one succeeds, other gets "Insufficient" |
| 11 | Annual WO sign-off with IA | closes WO, writes 3 sealed logbook entries (airframe+engine+prop) |

## Verification

| Gate | Result |
| --- | --- |
| `pnpm -r typecheck` | green |
| `pnpm -r lint` | green (no banned-term hits) |
| `scripts/check-service-role-usage.sh` | OK |
| `pnpm --filter @part61/rls-tests test -- phase4-camp-api` | **11/11 green** |
| `pnpm --filter @part61/rls-tests test -- phase3-scheduling phase4` (regression) | **69/69 green** |
| Full suite (18 files) | 150/151 green — see note below |

### Pre-existing flake (out of scope)

`tests/rls/api-fif.test.ts` "listActive includes the new notice" fails when the full suite runs but passes when run in isolation or paired with `api-dispatch`. Reproduced **before** my new test file was added (139/140 green baseline without `phase4-camp-api.test.ts`). The flake is time-dependent (Phase 3 summary 03-02 documents `fif.revoke` sets `expires_at = now() - 1s` and `listActive` excludes notices on a now()-tied comparison) and predates this plan. Logged as a pre-existing test-isolation issue; not caused by CAMP router code. **Deferred** per Rule scope boundary.

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] mechanic_authority lives on `user_roles`, not `users`**

- **Found during:** Task 1 (writing `buildSignerSnapshot`)
- **Issue:** Plan context said "pulls users.mechanic_authority", but Phase 2 schema puts `mechanic_authority` on `user_roles` (a user can hold multiple roles with different authorities).
- **Fix:** `buildSignerSnapshot` + `getMechanicAuthority` read `max(mechanic_authority::text)` from `user_roles` for that user, restricted to `('a_and_p','ia')`. Works for single- and multi-role mechanics. Documented in the helper's docstring.

**2. [Rule 3 — Blocking] Plan said tests live in `tests/api/phase4-camp-api.test.ts`**

- **Found during:** Task 2 setup
- **Issue:** No `tests/api/` workspace exists. The existing API integration tests (Phase 3 `api-admin-aircraft`, `api-dispatch`, etc.) live in `tests/rls/` under `@part61/rls-tests`, which already has the tRPC harness, `adminCaller`, and `harness.ts` seed helper.
- **Fix:** Placed the new test file at `tests/rls/phase4-camp-api.test.ts`. No new workspace or vitest config created. Summary frontmatter reflects the actual path.

**3. [Rule 2 — Missing critical functionality] `part.on_hand_qty` not kept in sync by a DB trigger**

- **Found during:** Task 2 writing `admin.parts.receiveLot`
- **Issue:** Plan 04-01 summary describes the lot-tracked path but no trigger ships to keep `part.on_hand_qty` synced with `sum(part_lot.qty_remaining)`. Without sync, the concurrency test's FOR UPDATE lock on `part` would lag.
- **Fix:** `receiveLot` and `consumePart` both patch `part.on_hand_qty` inside the same transaction as the lot insert/decrement. Authoritative and atomic. If a trigger is added later, these manual updates can become no-ops.

**4. [Rule 1 — Bug] Overrun grant catches unique-violation instead of leaking 23505**

- **Found during:** Task 2 writing `admin.overruns.grant`
- **Issue:** The once-only-per-cycle partial unique index would leak a raw Postgres error to clients.
- **Fix:** try/catch around the insert, map unique/duplicate messages to `TRPCError(CONFLICT)`.

### Asked / no-ops

None — every issue fell under Rules 1-3.

## Commits

- `958275a` — feat(04-03): domain schemas + mechanicOrAdminProcedure + signer snapshot helpers (Task 1)
- `014370a` — feat(04-03): CAMP tRPC routers + 11 integration tests (Task 2)

## Signature check

`mechanicOrAdminProcedure` identical shape to `instructorOrAdminProcedure`. `buildSignerSnapshot` returns `Readonly<SignerSnapshot>`. Work order `signOff` returns `{ok: true, signer: SignerSnapshot, logbookEntries: Array<{id, book}>}` — the UI in plan 04-04 consumes this directly.

## Ready for Plan 04-04 (CAMP admin UI)

Plan 04-04 will consume:

- `admin.maintenance.list({aircraftId})` on the aircraft profile maintenance tab
- `admin.squawks.list` + lifecycle mutations on the squawk board
- `admin.workOrders.list` + `signOff` on the work order detail page
- `admin.ads.list` + `applyToFleet` on the AD catalog
- `admin.parts.list` + `receiveLot` on the parts inventory page
- `admin.overruns.grant` on the aircraft profile (IA-only CTA)
- `admin.logbook.list` + PDF export route
- `admin.maintenanceTemplates.list` + `applyToAircraft` on the aircraft-creation flow

Every router call is already gated server-side; UI just needs to hide buttons the current user can't press.

## Self-Check: PASSED

- All claimed files exist on disk (17 created, 4 modified)
- Both commit hashes resolve in `git log --oneline`
- phase4-camp-api.test.ts 11/11 green; phase3+phase4 regression 69/69 green
- Pre-existing api-fif flake confirmed not caused by this plan (reproduced without the new test file)
