# Phase 4: CAMP Maintenance - Research

**Researched:** 2026-04-08
**Domain:** Continuous Airworthiness Maintenance Program (Postgres-first CAMP engine) + server-side PDF + Next.js 15 / tRPC integration
**Confidence:** HIGH on DB/domain design (detailed CONTEXT.md locks it), MEDIUM on PDF library choice (library ecosystem in flux under React 19)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Maintenance item model (MNT-01, MNT-02)**

- Single `maintenance_item` table with `kind` enum + `interval_rule jsonb` (NOT one-per-kind)
- `maintenance_item_kind` enum values: `annual_inspection`, `hundred_hour_inspection`, `airworthiness_directive`, `oil_change`, `transponder_91_413`, `pitot_static_91_411`, `elt_battery`, `elt_91_207`, `vor_check`, `component_life`, `manufacturer_service_bulletin`, `custom`
- `interval_rule` JSONB with clock enum: `hobbs | tach | airframe | engine | calendar | combined`
- `maintenance_next_due(item_id)` SQL function computes next due point from `aircraft_current_totals` view
- Status enum: `current | due_soon | overdue | grounding`
- Audit trigger + hard-delete blocker + RLS on school_id+base_id

**Airworthiness Directives (MNT-07)**

- `airworthiness_directive` catalog (school_id nullable for global), `aircraft_ad_compliance` join, `ad_compliance_history` event log
- Applicability stored as JSONB with make/model/year_range/serial_range/engine/prop (all optional)
- Manual entry only in v1 (no FAA feed)
- AD compliance rows bridge into `maintenance_item` with `kind='airworthiness_directive'` via trigger

**Component life limits (MNT-06)**

- `aircraft_component` table with kind enum (`magneto | prop | vacuum_pump | alternator | elt | elt_battery | starter | mag_points | spark_plug | custom`), life_limit_hours/months, overhaul intervals
- `component_life_remaining(component_id)` SQL function
- Component bridges into `maintenance_item` with `kind='component_life'` via trigger
- `aircraft_component_overhaul` event table for overhauls that reset life clock

**Auto-ground + §91.409 10-hour overrun (MNT-03, FLT-04)**

- Hard auto-ground on any `maintenance_item` crossing limit (not overrun-eligible)
- `is_airworthy_at` body REPLACED in-place. Signature frozen. Phase 3 tests must still pass.
- §91.409 10-hour overrun applies ONLY to 100-hour inspection (§91.409(b)), requires IA authority
- `maintenance_overrun` table: one active per compliance cycle, tracks consumed_hours, expires_at (10 days default)
- Overrun auto-revokes when consumed_hours ≥ max_additional_hours

**Squawk lifecycle (MNT-04, MNT-05)**

- Extend existing `squawk_status` enum from `open|in_work|resolved` → `open|triaged|deferred|in_work|fixed|returned_to_service` (+ `cancelled`)
- ALTER TYPE in separate migration file (Phase 2 enum caveat)
- Only `mechanic_authority in ('a_and_p','ia')` can triage and sign return-to-service
- Extended columns: `triaged_at`, `triaged_by`, `deferred_until`, `deferral_justification`, `work_order_id`, `returned_to_service_at`, `returned_to_service_signer_snapshot jsonb`

**Work orders (MNT-09)**

- `work_order` + `work_order_task` + `work_order_part_consumption` tables
- Status: `draft|open|in_progress|pending_signoff|closed|cancelled`
- Kind: `annual|100_hour|ad_compliance|squawk_repair|component_replacement|oil_change|custom`
- Task `required_authority`: `a_and_p|ia`. Annual REQUIRES IA.
- Sign-off writes one logbook entry per touched book, updates source maintenance_item/ad_compliance/component, unlocks aircraft, emits audit
- Only `draft` WOs can be hard-deleted

**Parts inventory (MNT-08)**

- `part` + `part_lot` tables. Lot-tracked parts require lot specification on consumption.
- `part.on_hand_qty` kept in sync with sum of lots by trigger
- No PO / reordering automation in v1

**Signer snapshot contract**

- JSONB `{user_id, full_name, certificate_type, certificate_number, signed_at}` COPIED (not referenced)
- `buildSignerSnapshot(userId, requiredAuthority)` server-side helper validates and builds
- Refuses if user lacks required mechanic_authority

**Digital logbook PDF (MNT-10)**

- Three PDFs per aircraft: airframe, engine (per engine), prop
- `logbook_entry` table with `sealed` boolean — UPDATE forbidden once sealed (trigger)
- Corrections are new entries with `corrects_entry_id` FK
- Export route `/admin/aircraft/[id]/logbook/[book]/export.pdf`
- Auto-created on work order close; retention forever (no soft-delete)

**Downtime prediction (MNT-11)**

- Rule-based SQL function `aircraft_next_grounding_forecast(aircraft_id)`
- Cached in `aircraft_downtime_forecast` table, refreshed by triggers
- Confidence levels: `high | medium | low`

**Maintenance item templates**

- `maintenance_item_template` + `maintenance_item_template_line` tables
- System-seeded: C172 for-hire, C152, PA-28, generic SEL
- Applied at aircraft creation; copied, not referenced

**Admin UI pages** (all `mechanicOrAdminProcedure` gated):

- `/admin/maintenance`, `/admin/aircraft/[id]/maintenance`, `/admin/aircraft/[id]/logbook/[book]`, `/admin/squawks`, `/admin/squawks/[id]`, `/admin/work-orders`, `/admin/work-orders/[id]`, `/admin/ads`, `/admin/ads/[id]`, `/admin/parts`, `/admin/parts/[id]`, `/admin/maintenance-templates`

**Role extensions**

- New `mechanicOrAdminProcedure` composed procedure in `packages/api/src/procedures.ts`
- `requireMechanicAuthority(ctx, 'ia')` helper for within-procedure gating

**Banned-term caveat**

- Internal enum values like `'annual_inspection'` fine
- Display labels in `packages/domain/src/schemas/maintenanceKindLabels.ts` (outside lint glob)
- Source-code strings use "authorized" / "compliant", never "approved"
- User-entered text (squawk descriptions, WO notes) is data, not source code — exempt

### Claude's Discretion

- PDF library: `@react-pdf/renderer` vs `pdfkit` — research must recommend
- Color palette for status chips on maintenance dashboard
- JSONB schema validation approach (zod discriminated union recommended)
- Pagination on `/admin/squawks` and `/admin/work-orders` (cursor recommended)
- `aircraft_downtime_forecast` refresh: Postgres trigger vs tRPC job (trigger recommended)
- Deferred MEL badge on dispatch (small yellow badge recommended)
- CSV import for parts — defer to v2
- Plain textarea fine for squawk descriptions in v1

### Deferred Ideas (OUT OF SCOPE)

- Automated FAA AD feed ingestion (v2)
- Parts purchasing / PO workflow / reorder automation (v2)
- Mechanic labor tracking / hours billing (out per PROJECT.md)
- Barcode scanning (v2)
- CAMP software import (v2)
- Photo attachments on squawks / work orders (v2)
- Squawk comments thread (v2)
- Auto-order below reorder threshold (v2)
- ML-based downtime prediction (v2)
- Mobile pilot-reported maintenance (v2)
- Inspection deferral approval workflow (v2)
- AD alert emails (Phase 8 + v2 feed)
- CAMP audit report for FAA surveillance (v2)
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                    | Research Support                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MNT-01 | Typed maintenance items with interval rules on correct clock                   | Single `maintenance_item` table + `kind` enum + `interval_rule jsonb` + zod discriminated union validation at tRPC boundary; `maintenance_next_due()` SQL function reads `aircraft_current_totals`         |
| MNT-02 | "Due at" derivation (hours OR date, whichever sooner)                          | `interval_rule.clock='combined'` with `mode='whichever_first'`; SQL function computes both and returns min                                                                                                 |
| MNT-03 | Auto-ground on over-fly; §91.409 10-hr IA overrun path                         | Trigger on `flight_log_entry` + `aircraft_squawk` + `aircraft_ad_compliance` recomputes `maintenance_item.status`; `maintenance_overrun` table gates exception; real `is_airworthy_at` body reads overruns |
| MNT-04 | Squawk lifecycle open→triaged→grounding→repaired→RTS signed                    | Extend `squawk_status` enum in isolated migration; `mechanicOrAdminProcedure` routes; `buildSignerSnapshot()` helper validates authority                                                                   |
| MNT-05 | Open squawks on aircraft profile + scheduling; grounding severity auto-grounds | Already partially from Phase 3; extended panels on aircraft detail page; MEL yellow badge on dispatch screen                                                                                               |
| MNT-06 | Component lifing                                                               | `aircraft_component` table + `component_life_remaining()` SQL function + trigger bridge to `maintenance_item`                                                                                              |
| MNT-07 | AD tracking with applicability, compliance method, history                     | `airworthiness_directive` catalog + `aircraft_ad_compliance` + `ad_compliance_history`; `apply_ads_to_aircraft()` function                                                                                 |
| MNT-08 | Parts inventory (on-hand, part number, lot/serial, used-on history)            | `part` + `part_lot` tables; `SELECT ... FOR UPDATE` on lot row during consumption; trigger keeps `part.on_hand_qty` in sync                                                                                |
| MNT-09 | Work order create→assign→tasks→parts→sign-off→RTS                              | `work_order` + `work_order_task` + `work_order_part_consumption`; sign-off ceremony mutation writes logbook entries + updates source items + unlocks aircraft                                              |
| MNT-10 | Digital logbook PDF (airframe/engine/prop) append-only signed                  | `logbook_entry` table + `sealed` flag + UPDATE-forbidden trigger; server-side PDF via `@react-pdf/renderer` in Route Handler (with caveat — see Pitfall 1)                                                 |
| MNT-11 | Rule-based downtime prediction on admin dashboard + aircraft profile           | `aircraft_next_grounding_forecast()` SQL function + `aircraft_downtime_forecast` cache table + refresh triggers                                                                                            |

</phase_requirements>

## Summary

Phase 4 is overwhelmingly a **Postgres-first database + trigger + SQL function phase**, with a thin tRPC/React layer on top. The CONTEXT.md locks the entire data model in detail — research needs to focus on HOW, not WHAT. The hard problems are: (1) replacing the Phase 3 `is_airworthy_at` body without breaking any Phase 3 test; (2) trigger orchestration that keeps `maintenance_item.status` authoritative on every flight log insert, squawk change, AD change, and component change; (3) the §91.409 overrun consumed-hours accounting; (4) the PDF library choice under Next.js 15 / React 19 (which has a known breakage for `@react-pdf/renderer`); (5) the sign-and-seal logbook contract; (6) concurrency on parts lot decrement.

The stack is entirely set by Phases 1–3: pnpm+turbo monorepo, Next.js 15 App Router + React 19, Drizzle ORM with `pgPolicy` RLS, tRPC per-procedure middleware, Postgres triggers + SQL functions for anything safety-relevant, migration files hand-authored starting at `0010_` and isolated-per-concern (enum ALTER vs table create vs function replace vs seed data). The only genuinely new library is the PDF renderer.

**Primary recommendation:** Build the DB layer end-to-end first (migrations 0010–0013), then the SQL functions, then the tRPC routers, then the UI panels. Replace `is_airworthy_at` body LAST inside its own migration after all inputs exist, and re-run the Phase 3 test suite before moving on. Use `@react-pdf/renderer` with a pinned version known-good against Next.js 15.2+ / React 19, with a `dynamic` server-only import in the route handler — if that fails in spike, fall back to `pdfkit` (streaming, zero React-version risk).

## Standard Stack

### Core (established by Phases 1–3 — do NOT re-choose)

| Library     | Version                | Purpose                                         | Why Standard                  |
| ----------- | ---------------------- | ----------------------------------------------- | ----------------------------- |
| Next.js     | 15 (App Router)        | Web framework                                   | Phase 1 lock                  |
| React       | 19                     | UI                                              | Phase 1 lock                  |
| TypeScript  | 5.6 strict             | Type safety (`noUncheckedIndexedAccess`)        | Phase 1 lock                  |
| Drizzle ORM | latest in repo         | Schema + RLS via `pgPolicy`                     | Phase 1 lock                  |
| tRPC        | latest in repo         | Typed API + per-procedure middleware            | Phase 1 lock                  |
| Postgres    | 15+ (Supabase managed) | DB engine                                       | Phase 1 lock                  |
| Supabase    | managed                | Auth + Storage + pooler                         | Phase 1 lock                  |
| zod         | latest in repo         | Input validation (incl. JSONB shape validation) | Phase 2–3 pattern             |
| date-fns-tz | —                      | Timezone-correct display                        | Phase 1 CLAUDE.md requirement |

### New for Phase 4

| Library               | Version                        | Purpose                                       | Why                                                                                                        |
| --------------------- | ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@react-pdf/renderer` | pin latest compatible (>= 4.x) | Server-side PDF generation for logbook export | React-based API fits the codebase; streaming render; Route-Handler compatible after Next.js 14.1.1 bug fix |

**Fallback if `@react-pdf/renderer` breaks under Next 15 + React 19:** `pdfkit` (low-level imperative, zero React entanglement, Node streams). See Pitfall 1.

### Alternatives Considered

| Instead of                          | Could Use               | Tradeoff                                                                                                                  |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@react-pdf/renderer`               | `pdfkit`                | More verbose/imperative, but zero React-version risk; streams natively into a Node `Response`                             |
| `@react-pdf/renderer`               | `pdfmake`               | Declarative JSON spec; solid but not React-native; extra learning curve unnecessary since codebase is React               |
| `@react-pdf/renderer`               | `puppeteer`             | Renders any HTML via headless Chromium but adds ~200MB dep + cold-start cost + memory spike; overkill for tabular logbook |
| Generated columns for `next_due_at` | Plain columns + trigger | Generated columns can't reference other tables; trigger writing to plain columns required anyway                          |
| Cron refresh of forecast            | Trigger-driven refresh  | Trigger is deterministic + testable in RLS harness; cron adds scheduler dep                                               |

**Installation:**

```bash
pnpm --filter @part61/web add @react-pdf/renderer
# Fallback:
# pnpm --filter @part61/web add pdfkit @types/pdfkit
```

## Architecture Patterns

### Migration File Layout (Phase 4)

Phase 2 enum caveat means ALTER TYPE must be isolated from USE. Recommended file breakdown, starting at 0010 after Phase 3's 0008:

```
packages/db/migrations/
├── 0009_phase4_enums.sql                  # NEW enums + ALTER TYPE squawk_status — NO use sites
├── 0010_phase4_camp_tables.sql            # maintenance_item, ad_*, aircraft_component, work_order*, part*, logbook_entry, maintenance_overrun, aircraft_downtime_forecast + RLS + audit + hard-delete blockers
├── 0011_phase4_functions_triggers.sql     # maintenance_next_due, component_life_remaining, apply_ads_to_aircraft, aircraft_next_grounding_forecast, seal-on-sign trigger, bridge triggers, refresh triggers
├── 0012_phase4_replace_is_airworthy_at.sql # CREATE OR REPLACE is_airworthy_at body (signature frozen)
├── 0013_phase4_seed_templates.sql         # system maintenance_item_templates (C172, C152, PA-28, generic SEL)
```

Each migration also mirrored to `supabase/migrations/` (Phase 1–3 convention).

### Recommended Code Structure

```
packages/db/src/schema/
├── maintenance_item.ts         # maintenance_item + template tables
├── ads.ts                      # airworthiness_directive + compliance + history
├── aircraft_component.ts       # component + overhaul event
├── work_order.ts               # work_order + task + part_consumption
├── part.ts                     # part + part_lot
├── logbook_entry.ts            # logbook_entry
├── maintenance_overrun.ts      # overrun exceptions
├── downtime_forecast.ts        # aircraft_downtime_forecast cache
└── index.ts                    # re-exports

packages/api/src/routers/admin/
├── maintenance.ts              # list / create / complete maintenance items
├── ads.ts                      # AD catalog + apply-to-fleet + compliance
├── components.ts               # component install/remove/overhaul
├── workOrders.ts               # CRUD + sign-off mutation
├── parts.ts                    # parts + lots + consumption
├── logbook.ts                  # list entries + export PDF
├── maintenanceTemplates.ts     # template manager
├── overruns.ts                 # IA overrun grant/revoke
└── squawks.ts                  # EXTEND from Phase 3 (triage / defer / RTS)

packages/api/src/procedures.ts  # ADD mechanicOrAdminProcedure
packages/api/src/helpers/
├── signerSnapshot.ts           # buildSignerSnapshot + requireMechanicAuthority
└── maintenanceAuthority.ts     # task-kind → required_authority mapping

packages/domain/src/schemas/
├── intervalRule.ts             # zod discriminated union
├── adApplicability.ts          # zod
├── signerSnapshot.ts           # zod
├── maintenanceKindLabels.ts    # display strings (outside banned-term glob)
└── maintenance.ts              # shared types

apps/web/app/(app)/admin/
├── maintenance/page.tsx
├── aircraft/[id]/
│   ├── MaintenancePanel.tsx    # drops into existing detail page
│   └── logbook/[book]/
│       ├── page.tsx
│       └── export.pdf/route.ts # Next.js Route Handler (POST/GET) returning PDF stream
├── squawks/page.tsx + [id]/page.tsx
├── work-orders/page.tsx + [id]/page.tsx
├── ads/page.tsx + [id]/page.tsx
├── parts/page.tsx + [id]/page.tsx
└── maintenance-templates/page.tsx

apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/pdf/
└── LogbookPdfDocument.tsx      # @react-pdf/renderer component (Document/Page/View/Text)

tests/rls/phase4-camp.test.ts   # cross-tenant harness — one case per new table
```

### Pattern 1: Replacing `is_airworthy_at` (signature frozen, body swapped)

**What:** Phase 3 shipped a stub body. Phase 4 replaces it with `CREATE OR REPLACE FUNCTION` at the same signature. All call sites keep compiling. Phase 3 tests must stay green.

**SQL sketch** (to be refined during planning):

```sql
-- 0012_phase4_replace_is_airworthy_at.sql
create or replace function public.is_airworthy_at(
  p_aircraft_id uuid,
  p_at          timestamptz
) returns boolean
language sql
stable
security invoker
as $$
  select
    case
      -- deleted or grounded at the check time
      when (select deleted_at is not null from public.aircraft where id = p_aircraft_id) then false
      when (select grounded_at is not null and grounded_at <= p_at
              from public.aircraft where id = p_aircraft_id) then false

      -- any grounding squawk open at p_at (Phase 3 rule, preserved)
      when exists (
        select 1 from public.aircraft_squawk
         where aircraft_id = p_aircraft_id
           and severity = 'grounding'
           and opened_at <= p_at
           and (returned_to_service_at is null or returned_to_service_at > p_at)
      ) then false

      -- any overdue/grounding maintenance_item without an active overrun
      when exists (
        select 1 from public.maintenance_item mi
         where mi.aircraft_id = p_aircraft_id
           and mi.deleted_at is null
           and mi.status in ('overdue','grounding')
           and not exists (
             select 1 from public.maintenance_overrun mo
              where mo.item_id = mi.id
                and mo.granted_at <= p_at
                and mo.revoked_at is null
                and mo.expires_at > p_at
                and mo.consumed_hours < mo.max_additional_hours
           )
      ) then false

      -- any overdue AD compliance
      when exists (
        select 1 from public.aircraft_ad_compliance ac
         where ac.aircraft_id = p_aircraft_id
           and ac.deleted_at is null
           and ac.status in ('overdue','grounding')
           and ac.first_due_at <= p_at
      ) then false

      -- any component with life remaining <= 0 at p_at
      when exists (
        select 1 from public.aircraft_component c
         where c.aircraft_id = p_aircraft_id
           and c.removed_at is null
           and (public.component_life_remaining(c.id)).hours_remaining <= 0
      ) then false

      else true
    end
$$;
```

**Critical:** run the existing `tests/rls/phase3-scheduling.test.ts` + any `is_airworthy_at` tests immediately after this migration. If any fails, the body is wrong, not the test.

### Pattern 2: Trigger orchestration for auto-ground

**Goal:** every event that could change airworthiness refreshes `maintenance_item.status` and, if any item crosses to `grounding`, sets `aircraft.grounded_at`.

**Triggers needed:**

| Event                                                        | Trigger                                | Action                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INSERT` or `UPDATE` on `flight_log_entry`                   | `trg_flightlog_refresh_maintenance`    | Call `recompute_maintenance_status(aircraft_id)` which loops items, re-evaluates `maintenance_next_due`, updates status; if any status='grounding' and aircraft not grounded, set `grounded_at = now()`, `grounded_reason`, `grounded_by_item_id` |
| `INSERT` on `aircraft_squawk` WHERE severity='grounding'     | existing Phase 3 trigger — verify kept | Sets `grounded_at`                                                                                                                                                                                                                                |
| `UPDATE` on `aircraft_squawk` (status → returned_to_service) | `trg_squawk_rts_maybe_ungroud`         | If last grounding squawk for aircraft cleared AND no other grounding cause, clear `grounded_at`                                                                                                                                                   |
| `INSERT` or `UPDATE` on `aircraft_ad_compliance`             | `trg_ad_refresh_maintenance`           | Recompute AD status; bridge maintenance_item row; re-run aircraft grounding check                                                                                                                                                                 |
| `INSERT` on `aircraft_component`                             | `trg_component_bridge_maintenance`     | If life_limit_hours or life_limit_months not null, create bridged `maintenance_item` row with kind='component_life'                                                                                                                               |
| `UPDATE` on `aircraft_component` (removed_at set)            | `trg_component_soft_close_bridge`      | Soft-delete bridged maintenance_item                                                                                                                                                                                                              |
| `INSERT` or `UPDATE` on `maintenance_item`                   | `trg_mi_refresh_forecast`              | Refresh `aircraft_downtime_forecast` cache row                                                                                                                                                                                                    |
| `INSERT` on `flight_log_entry` (kind='flight_in')            | `trg_flightlog_consume_overrun`        | If aircraft has active overrun, increment `consumed_hours += (hobbs_in - paired_flight_out.hobbs_out)`; if consumed ≥ max, set revoked_at = now()                                                                                                 |

**Anti-pattern:** doing this logic in tRPC mutations instead of triggers. It leaks out of the RLS surface and creates a mutation vs. background job race. Keep it in SQL.

### Pattern 3: JSONB schema validation at tRPC boundary (zod discriminated union)

```typescript
// packages/domain/src/schemas/intervalRule.ts
import { z } from 'zod';

const HoursClock = z.object({
  clock: z.enum(['hobbs', 'tach', 'airframe', 'engine']),
  hours: z.number().positive(),
  calendar: z.null().optional(),
});

const CalendarClock = z.object({
  clock: z.literal('calendar'),
  hours: z.null().optional(),
  months: z.number().int().positive(),
});

const CombinedClock = z.object({
  clock: z.literal('combined'),
  hours: z.number().positive(),
  months: z.number().int().positive(),
  mode: z.enum(['whichever_first', 'whichever_last']),
});

export const intervalRuleSchema = z.discriminatedUnion('clock', [
  HoursClock.extend({ clock: z.literal('hobbs') }),
  HoursClock.extend({ clock: z.literal('tach') }),
  HoursClock.extend({ clock: z.literal('airframe') }),
  HoursClock.extend({ clock: z.literal('engine') }),
  CalendarClock,
  CombinedClock,
]);
export type IntervalRule = z.infer<typeof intervalRuleSchema>;
```

Validated on every `maintenance_item.create` / `update` mutation. Postgres has no enforcement of JSONB shape — all shape protection is at the application boundary. Document that bypassing tRPC (e.g. a psql hand-insert) will not be caught.

### Pattern 4: Parts lot decrement with `SELECT ... FOR UPDATE`

```typescript
// packages/api/src/routers/admin/workOrders.ts (excerpt)
consumePart: mechanicOrAdminProcedure
  .input(z.object({
    workOrderId: z.string().uuid(),
    partId: z.string().uuid(),
    partLotId: z.string().uuid().nullable(),
    quantity: z.number().positive(),
  }))
  .mutation(async ({ ctx, input }) => {
    // withTenantTx already opened a transaction with school_id + base_id GUCs set
    const tx = ctx.tx;
    const part = await tx.execute(sql`
      select id, kind, on_hand_qty
        from public.part
       where id = ${input.partId}
       for update
    `);
    if (!part.rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });

    const isLotTracked = part.rows[0].kind !== 'consumable'; // example rule
    if (isLotTracked && !input.partLotId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lot required for this part' });
    }

    if (input.partLotId) {
      const lot = await tx.execute(sql`
        select id, qty_remaining
          from public.part_lot
         where id = ${input.partLotId}
           and part_id = ${input.partId}
         for update
      `);
      if (!lot.rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      if (Number(lot.rows[0].qty_remaining) < input.quantity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient lot qty' });
      }
      await tx.execute(sql`
        update public.part_lot
           set qty_remaining = qty_remaining - ${input.quantity}
         where id = ${input.partLotId}
      `);
    }
    // insert consumption row (trigger will sync part.on_hand_qty from lot sum)
    await tx.insert(workOrderPartConsumption).values({...});
  });
```

`SELECT ... FOR UPDATE` serializes concurrent consumers of the same lot. Transaction commit releases the lock.

### Pattern 5: Seal-on-sign trigger (logbook_entry UPDATE forbidden when sealed)

```sql
create or replace function public.fn_logbook_entry_block_update()
returns trigger language plpgsql as $$
begin
  if OLD.sealed = true then
    -- allow no-op or audit columns only? Never. Sealed means sealed.
    raise exception 'logbook_entry % is sealed and cannot be modified', OLD.id;
  end if;
  -- permit: sealed false→true only if we're finalizing (signed_at set and signer_snapshot set)
  if NEW.sealed = true and OLD.sealed = false then
    if NEW.signer_snapshot is null or NEW.signed_at is null then
      raise exception 'cannot seal logbook_entry without signer_snapshot and signed_at';
    end if;
  end if;
  return NEW;
end $$;

create trigger trg_logbook_entry_block_update
  before update on public.logbook_entry
  for each row execute function public.fn_logbook_entry_block_update();
```

Also block DELETE via `fn_block_hard_delete` (same pattern as Phase 1).

### Pattern 6: `@react-pdf/renderer` in Next.js 15 App Router Route Handler

```typescript
// apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/export.pdf/route.ts
import { NextRequest } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { LogbookPdfDocument } from '../pdf/LogbookPdfDocument';
import { fetchLogbookEntriesForAircraft } from '@/server/logbook';

export const runtime = 'nodejs'; // NOT edge — pdf libs need Node APIs
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; book: 'airframe' | 'engine' | 'prop' } },
) {
  // auth + mechanicOrAdmin check here (call a server helper that mirrors tRPC ctx)
  const data = await fetchLogbookEntriesForAircraft(params.id, params.book);
  const stream = await renderToStream(<LogbookPdfDocument data={data} />);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${data.tailNumber}-${params.book}-logbook.pdf"`,
    },
  });
}
```

**Caveat:** verify `@react-pdf/renderer` version works with React 19 at spike time (see Pitfall 1). Pin the working version in `package.json`.

### Anti-Patterns to Avoid

- **Computing airworthiness in TypeScript.** Must be in SQL — RLS can't reason about it otherwise, and the dispatch screen already calls `is_airworthy_at` directly.
- **Hand-rolling a parts-lot FIFO allocator.** v1 requires mechanic to specify the lot explicitly. Don't auto-pick.
- **Trigger cascades that re-enter themselves.** Mark each refresh function with a guard or use `pg_trigger_depth() > 1` short-circuit to prevent infinite loops between `maintenance_item` ↔ `aircraft_downtime_forecast` refreshes.
- **Using `sql\`authenticated\`` in pgPolicy.** Phase 1 bug: must be the string literal `'authenticated'`. Carry forward.
- **Storing `signer.user_id` as an FK only.** The contract is COPY, not REFERENCE. FK is optional and must not be ON UPDATE CASCADE.
- **Using generated columns for `next_due_at`.** Can't reference other tables (`aircraft_current_totals`). Use plain columns refreshed by trigger, or compute on read via the SQL function.

## Don't Hand-Roll

| Problem                          | Don't Build                            | Use Instead                                                                                            | Why                                                             |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Server-side PDF                  | A custom HTML-to-PDF pipeline          | `@react-pdf/renderer` (primary) or `pdfkit` (fallback)                                                 | Pagination, font embedding, table layout are hard               |
| JSONB shape validation           | Ad-hoc `if`/`else` checks in mutations | zod discriminated union                                                                                | Exhaustiveness + type narrowing free                            |
| Parts consumption concurrency    | Optimistic retry loop                  | `SELECT ... FOR UPDATE` in transaction                                                                 | Postgres row locks are the canonical pattern                    |
| Airworthiness evaluation         | TypeScript service                     | SQL function `is_airworthy_at`                                                                         | Callable from policies + triggers + app, single source of truth |
| Audit trail                      | Custom logging                         | Existing `audit.fn_log_change()` trigger attach (Phase 1)                                              | Append-only RLS already set                                     |
| Hard-delete block                | Application check                      | Existing `fn_block_hard_delete` BEFORE DELETE trigger                                                  | Can't be bypassed                                               |
| Cursor pagination for squawks/WO | OFFSET/LIMIT                           | Keyset: `where (created_at, id) < ($cursor_ts, $cursor_id) order by created_at desc, id desc limit 50` | OFFSET gets slow and drifts on inserts                          |

**Key insight:** Phase 4 is a CAMP compliance engine — it's regulatory. Every hand-rolled solution is a future audit finding. Lean on Postgres constraints, triggers, and SQL functions. The Node layer should be dumb.

## Common Pitfalls

### Pitfall 1: `@react-pdf/renderer` × Next.js 15 × React 19 compatibility

**What goes wrong:** Older versions of `@react-pdf/renderer` use a React secret internal API that was removed in React 19, causing runtime crashes under Next.js 15.

**Why it happens:** Library imported `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`. React 19 removed it. Next.js 15 ships with React 19.

**How to avoid:**

1. Check the latest `@react-pdf/renderer` release notes for "React 19" support before pinning.
2. Spike a minimal PDF render in a throwaway Route Handler on Wave 0 of Phase 4, verify it produces a valid PDF under `pnpm dev` AND `pnpm build` + `pnpm start`.
3. If the spike fails on React 19: immediately pivot to `pdfkit` (imperative API, no React dependency, stable for 10+ years). `pdfkit` is boring but bulletproof for tabular output.
4. Pin whichever version works in `package.json` exact (no `^`).

**Warning signs:** hydration errors mentioning "SECRET_INTERNALS"; `renderToStream` returning undefined; server console stack traces in React internals.

**Source:** [Next.js discussion #68553 — Can't use context on the server with React PDF](https://github.com/vercel/next.js/discussions/68553); [react-pdf issue #2460 — renderToBuffer/renderToStream in server-side with App Router](https://github.com/diegomura/react-pdf/issues/2460)

### Pitfall 2: Postgres enum extension in a single transaction

**What goes wrong:** `ALTER TYPE squawk_status ADD VALUE 'triaged'; INSERT ... status = 'triaged'` fails because the new value isn't visible in the same transaction.

**Why it happens:** Postgres enum values added inside a transaction are not usable until the transaction commits.

**How to avoid:** Put ALL `ALTER TYPE … ADD VALUE` calls in `0009_phase4_enums.sql` alone. No use sites. Subsequent migrations may reference them.

**Warning signs:** `ERROR: unsafe use of new value "triaged" of enum type squawk_status` in migration logs.

### Pitfall 3: Phase 3 tests breaking after `is_airworthy_at` swap

**What goes wrong:** You replace the body and now Phase 3 scheduling tests fail because the new body is stricter (e.g. a seeded test aircraft has a `due_soon` item and the test didn't anticipate it).

**Why it happens:** Phase 3 tests seeded minimal fixtures — the old stub only checked `grounded_at` + grounding squawks. The new body also checks maintenance_item/AD/component.

**How to avoid:**

1. Before swapping the body, audit every Phase 3 test fixture for any aircraft seeded WITHOUT a fresh "current" maintenance state. The migration must leave existing aircraft in a state where `is_airworthy_at` still returns the same answer.
2. Either (a) seed test aircraft with no maintenance_items (vacuously airworthy) OR (b) seed with far-future due dates.
3. Run `pnpm test tests/rls/phase3-scheduling.test.ts` immediately after 0012 migration applies locally.

**Warning signs:** previously-green Phase 3 tests going red after 0012 applies.

### Pitfall 4: Trigger cascade infinite loop (forecast ↔ maintenance_item)

**What goes wrong:** A trigger on `maintenance_item` update refreshes `aircraft_downtime_forecast`, which (if poorly written) updates `maintenance_item`, which re-fires the trigger.

**How to avoid:** Only write to the forecast table from the trigger, never back to `maintenance_item`. Use `pg_trigger_depth() = 1` guard if any future change creates bidirectional writes.

**Warning signs:** "stack depth limit exceeded" errors; mutations that take seconds instead of ms.

### Pitfall 5: §91.409 overrun applied to the wrong inspection

**What goes wrong:** Code allows an overrun on an annual inspection or an AD compliance item. Regulatorily illegal.

**Why it happens:** The rule only permits 10-hour overrun on the 100-hour inspection (§91.409(b)). Annuals and ADs have NO overrun path.

**How to avoid:**

1. DB-level: `maintenance_overrun` table has a CHECK constraint `item_kind = 'hundred_hour_inspection'` (enforced by trigger that reads the referenced maintenance_item.kind at insert time, since CHECK can't reference other tables).
2. tRPC-level: grant mutation validates the maintenance_item.kind is `hundred_hour_inspection` before writing.
3. UI-level: the "Request §91.409 overrun" button only renders when the blocking item is a 100-hour.

**Warning signs:** overrun granted on an annual — audit this in QA with an intentional fixture.

### Pitfall 6: Signer snapshot not actually copied

**What goes wrong:** Developer "saves space" by storing `signer_user_id` only and joining at read time. Three months later the mechanic's cert number is updated → every historical sign-off retroactively displays the new number. FAA auditability BROKEN.

**How to avoid:**

1. `signer_snapshot jsonb NOT NULL` on every table that takes a sign-off.
2. Validation in `buildSignerSnapshot()`: returns the snapshot, never a user_id alone.
3. `.eslintrc` custom lint rule (optional): flag any write to a `signer_snapshot` column that isn't produced by `buildSignerSnapshot()`. Or enforce via PR review.
4. Test: write a sign-off, then mutate the user's cert number, then read the old sign-off — assert it still shows the OLD number.

### Pitfall 7: `maintenance_overrun.consumed_hours` drifts on manual hobbs edits

**What goes wrong:** Admin fixes a typo in `flight_log_entry.hobbs_in`. The trigger that increments consumed_hours fires on INSERT only — UPDATE corrections miss.

**How to avoid:** Trigger fires on INSERT and UPDATE of `flight_log_entry` where relevant columns changed. Recompute `consumed_hours` from authoritative source (sum of matched flight_out/flight_in deltas since `granted_at`) rather than incrementing.

### Pitfall 8: Concurrency race when two flight closes push an aircraft past a limit

**What goes wrong:** Two flight_log_entry inserts commit concurrently. Each fires `recompute_maintenance_status`. Aircraft gets grounded twice, or the second misses the ground.

**How to avoid:** `recompute_maintenance_status` takes a `SELECT ... FOR UPDATE` on the `aircraft` row first. Serializes the two refreshes. Idempotent — both converge on the same end state.

**Test:** `tests/rls/phase4-camp.test.ts` includes a parallel-insert test using `Promise.all` on two flight_log_entries that together cross a limit. Assert exactly one ground event and correct final state.

### Pitfall 9: Banned-term lint firing on FAA-idiomatic strings

**What goes wrong:** Developer writes `"Approved parts only"` as a label. Lint blocks.

**How to avoid:** Use `"Authorized parts only"` or `"Compliant parts only"`. Labels live in `packages/domain/src/schemas/maintenanceKindLabels.ts` which is outside the lint glob (`apps/web/**` + `packages/exports/**`). If a user's own squawk description uses "approved", it's data, not source code, and will not hit the lint — which is correct.

## Code Examples

### Example 1: `maintenance_next_due` SQL function

```sql
create or replace function public.maintenance_next_due(p_item_id uuid)
returns table (
  next_due_at    timestamptz,
  next_due_hours numeric,
  status         public.maintenance_item_status
)
language plpgsql
stable
security invoker
as $$
declare
  v_item   public.maintenance_item%rowtype;
  v_totals record;
  v_rule   jsonb;
  v_last_hours numeric;
  v_hours_due numeric;
  v_date_due timestamptz;
  v_warn_hours numeric := 10;
  v_warn_days  int := 30;
begin
  select * into v_item from public.maintenance_item where id = p_item_id;
  if not found then return; end if;

  select * into v_totals from public.aircraft_current_totals
    where aircraft_id = v_item.aircraft_id;

  v_rule := v_item.interval_rule;

  -- Hours-based
  if v_rule->>'hours' is not null then
    v_last_hours := coalesce(
      (v_item.last_completed_hours->> (v_rule->>'clock'))::numeric,
      0
    );
    v_hours_due := v_last_hours + (v_rule->>'hours')::numeric;
  end if;

  -- Calendar-based
  if v_rule->>'months' is not null then
    v_date_due := coalesce(v_item.last_completed_at, v_item.created_at)
                  + (v_rule->>'months' || ' months')::interval;
  end if;

  next_due_at    := v_date_due;
  next_due_hours := v_hours_due;

  -- Status determination
  status := case
    when v_hours_due is not null and (
          (select (v_totals.*->>(v_rule->>'clock'))::numeric) >= v_hours_due
         ) then 'overdue'::public.maintenance_item_status
    when v_date_due is not null and now() >= v_date_due then 'overdue'::public.maintenance_item_status
    when v_hours_due is not null and (
          (select (v_totals.*->>(v_rule->>'clock'))::numeric) >= v_hours_due - v_warn_hours
         ) then 'due_soon'::public.maintenance_item_status
    when v_date_due is not null and now() >= v_date_due - (v_warn_days || ' days')::interval
         then 'due_soon'::public.maintenance_item_status
    else 'current'::public.maintenance_item_status
  end;
  return next;
end $$;
```

_(The exact rowtype lookup of `v_totals._->>(v_rule->>'clock')`is illustrative — the planner must resolve the`aircraft_current_totals` schema during implementation. Phase 3 migration 0008 defines this view.)\*

### Example 2: `buildSignerSnapshot` helper

```typescript
// packages/api/src/helpers/signerSnapshot.ts
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import type { Transaction } from '@/db';

export type MechanicAuthority = 'a_and_p' | 'ia';
export type SignerSnapshot = {
  user_id: string;
  full_name: string;
  certificate_type: MechanicAuthority;
  certificate_number: string;
  signed_at: string; // ISO
};

export async function buildSignerSnapshot(
  tx: Transaction,
  userId: string,
  required: MechanicAuthority,
): Promise<SignerSnapshot> {
  const rows = await tx.execute(sql`
    select u.id, u.mechanic_authority, pp.first_name, pp.last_name, pp.faa_airman_cert_number
      from public.users u
      join public.person_profile pp on pp.user_id = u.id
     where u.id = ${userId}
  `);
  const row = rows.rows[0];
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

  const authority = row.mechanic_authority as MechanicAuthority | null;
  if (!authority) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'User has no mechanic authority' });
  }
  if (required === 'ia' && authority !== 'ia') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'IA authority required' });
  }
  if (!row.faa_airman_cert_number) {
    throw new TRPCError({
      code: 'FAILED_PRECONDITION',
      message: 'FAA cert number missing on profile',
    });
  }

  return {
    user_id: row.id as string,
    full_name: `${row.first_name} ${row.last_name}`,
    certificate_type: authority,
    certificate_number: row.faa_airman_cert_number as string,
    signed_at: new Date().toISOString(),
  };
}

export function requireMechanicAuthority(
  ctxAuthority: MechanicAuthority | null,
  required: MechanicAuthority,
) {
  if (!ctxAuthority) throw new TRPCError({ code: 'FORBIDDEN' });
  if (required === 'ia' && ctxAuthority !== 'ia') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
}
```

### Example 3: `mechanicOrAdminProcedure`

```typescript
// packages/api/src/procedures.ts (addition)
export const mechanicOrAdminProcedure = protectedProcedure.use(requireRole('mechanic', 'admin'));
```

### Example 4: Work order → logbook book determination

```typescript
// packages/api/src/helpers/workOrderBooks.ts
import type { MaintenanceItemKind } from '@/domain';

export type LogbookBook = 'airframe' | 'engine' | 'prop';

export function booksTouchedByTaskKinds(kinds: MaintenanceItemKind[]): Set<LogbookBook> {
  const books = new Set<LogbookBook>(['airframe']); // airframe always
  for (const k of kinds) {
    if (k === 'oil_change' || k === 'manufacturer_service_bulletin' /* engine-scoped */) {
      books.add('engine');
    }
    // component-life items look at component.kind → map magneto/vacuum_pump → engine, prop → prop
  }
  return books;
}
```

Actual mapping refined during planning — requires reading component.kind and the WO task list.

## State of the Art

| Old Approach                       | Current Approach                                    | When Changed                  | Impact                                                                                          |
| ---------------------------------- | --------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Pages Router API Routes for PDF    | App Router Route Handlers (`route.ts`)              | Next.js 13+ App Router stable | Route Handlers run in Node runtime by default; set `runtime = 'nodejs'` explicitly for PDF libs |
| `@react-pdf/renderer` pre-React-19 | pinned post-React-19 release (verify at spike time) | React 19 removed internal API | See Pitfall 1                                                                                   |
| OFFSET pagination                  | Keyset / cursor pagination                          | Always, esp. at scale         | Cursor is consistent across inserts, faster at large offsets                                    |

**Deprecated/outdated:**

- Pages Router (Phase 1 locked App Router)
- Any advice suggesting `ALTER TYPE` in same transaction as usage (Postgres limitation, permanent)

## Open Questions

1. **Exact `@react-pdf/renderer` version that works on Next.js 15 + React 19**
   - What we know: pre-React-19 versions break; Next.js 14.1.1+ fixed an earlier crash
   - What's unclear: current latest release's React 19 status at the moment of implementation
   - Recommendation: Wave 0 spike — render a hello-world PDF through a Route Handler, run `pnpm build && pnpm start`, confirm. If broken, fall back to `pdfkit`.

2. **`aircraft_current_totals` view column shape for hobbs vs tach vs airframe**
   - What we know: Phase 3 migration 0008 defines this view
   - What's unclear: exact column names and whether per-engine totals are columns or a nested JSON
   - Recommendation: planner reads migration 0008 before writing `maintenance_next_due`

3. **Whether Phase 2/3 already has a pattern for seal-on-sign triggers**
   - What we know: audit triggers and hard-delete blockers exist
   - What's unclear: seal immutability pattern may or may not have precedent
   - Recommendation: if no precedent, this phase establishes it in `logbook_entry` and documents for Phase 5 (training records may want the same)

4. **FIF confirmation hook — is there an existing severity='grounding' recompute we can reuse?**
   - What we know: Phase 3 created the grounding-severity-squawk auto-ground. Phase 4 extends squawk states.
   - What's unclear: whether the existing trigger name/path will survive the enum extension
   - Recommendation: planner reviews Phase 3 migration 0007 for the existing trigger and either extends or replaces

5. **Whether `aircraft_current_totals` is refreshed synchronously on flight_log_entry insert or is a pure view**
   - Matters because auto-ground triggers need fresh totals
   - Recommendation: if it's a view, fine. If it's a materialized view, the auto-ground trigger must `REFRESH MATERIALIZED VIEW` first — document this carefully in the migration.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/04-camp-maintenance/04-CONTEXT.md` — all locked design decisions
- `.planning/REQUIREMENTS.md` — MNT-01..11 definitions
- `packages/db/migrations/0007_phase3_scheduling_dispatch.sql` — existing `is_airworthy_at` stub signature to preserve
- `packages/api/src/procedures.ts` — composed procedure pattern
- `CLAUDE.md` — project conventions (banned terms, RLS, timestamptz)

### Secondary (MEDIUM confidence)

- [Next.js discussion #68553 — React PDF + App Router server context](https://github.com/vercel/next.js/discussions/68553)
- [@react-pdf/renderer issue #2460 — renderToStream in Next 13+ App Router](https://github.com/diegomura/react-pdf/issues/2460)
- [react-pdf compatibility page](https://react-pdf.org/compatibility)
- [@react-pdf/renderer on npm](https://www.npmjs.com/package/@react-pdf/renderer)
- [Next.js + react-pdf integration guide (Ben Hur, Medium)](https://benhur-martins.medium.com/nextjs-14-and-react-pdf-integration-ccd38b1fd515)

### Tertiary (LOW confidence — validate at implementation time)

- Claude training knowledge of §91.409(b) 10-hour overrun — validated against context locked by user; user confirmed rule applies only to 100-hour inspection
- Postgres enum extension same-transaction limitation — from Phase 2 experience (documented in project) and general Postgres knowledge; unconditionally true in PG 12+
- Trigger depth guard via `pg_trigger_depth()` — standard Postgres pattern

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — entirely determined by Phases 1–3, only new library is PDF
- Architecture: HIGH — CONTEXT.md locks data model exhaustively; patterns follow Phase 3 precedent
- Pitfalls: HIGH for Postgres/SQL pitfalls (well-known); MEDIUM for `@react-pdf/renderer` × Next 15 (real issue, evolving)
- `is_airworthy_at` replacement: MEDIUM — SQL sketch is correct in shape but exact clauses need validation against Phase 3 test fixtures

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (30 days — stable DB/tRPC patterns; revisit PDF library advice at implementation time)
