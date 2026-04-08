# Phase 2: Personnel, Admin & Fleet Primitives — Research

**Researched:** 2026-04-07
**Domain:** Multi-tenant personnel + aircraft CRUD, multi-base RLS scoping, append-only flight-log event store, derived-total SQL views, computed-status SQL functions, self-registration approval queue, photo uploads reusing Phase 1 documents flow
**Confidence:** HIGH for everything that extends already-proven Phase 1 patterns (schema/RLS/audit/tx/trpc); MEDIUM for the two novel surfaces (RLS-aware VIEW, `SET LOCAL app.base_id` combined with school_id in RLS). No new libraries are being introduced. Research is prescriptive by design: CONTEXT.md locked virtually every architectural choice — this document is a patterns-and-pitfalls guide for the planner, not a stack selection.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Aircraft time-series model (FLT-01/02/03)**

- One log entry per flight. Single `flight_log_entry` table: `aircraft_id`, `flown_at`, `hobbs_out`, `hobbs_in`, `tach_out`, `tach_in`, `airframe_delta`, plus per-engine deltas. Recorded at flight close-out.
- Append-only. No updates, no deletes. Corrections are NEW entries with `kind = 'correction'` and a `corrects_id` FK. Audit trigger attached.
- Current totals derived via SQL VIEW `aircraft_current_totals` using `SUM(...) OVER (PARTITION BY aircraft_id)`. Profile + dashboard read from the view.
- Per-aircraft baseline: each aircraft has an initial `flight_log_entry` of `kind = 'baseline'`. The view sums from there.

**Engines (FLT-01)**

- N engines via `aircraft_engine` table: `aircraft_id`, `position` (`single | left | right | center | numbered`), `serial_number`, `installed_at`, `removed_at`.
- `flight_log_entry_engine` join: `flight_log_entry_id`, `engine_id`, `delta_hours`. Multiple rows per flight when multi-engine.
- SEL fleet: one engine row with `position = 'single'`; UI hides per-engine columns when there is only one.

**Personnel model (PER-01..10, AUTH-06/07)**

- Extend role enum: add `rental_customer`. Same `users` + `user_roles`. Dual-role users have two rows.
- `person_profile` (1:1 with users): `first_name`, `last_name`, `date_of_birth`, `address_line1/2`, `city`, `state`, `postal_code`, `country`, `phone`, `email_alt`, `faa_airman_cert_number`, `citizenship_status` (enum: `us_citizen | us_national | foreign_national | unknown`), `tsa_afsp_status` (enum: `not_required | pending | approved | expired`), `notes`. FAA/TSA fields nullable in v1.
- `emergency_contact` (1:N): `name`, `relationship`, `phone`, `email`, `is_primary`.
- `info_release_authorization` (1:N): `name`, `relationship`, `granted_at`, `revoked_at`.

**Holds and groundings (PER-05/06)**

- Single `person_hold` table. Columns: `id`, `user_id`, `school_id`, `kind` (`hold | grounding`), `reason`, `created_by`, `created_at`, `cleared_at` (nullable), `cleared_by`, `cleared_reason`. Active = `cleared_at IS NULL`. Never deleted — clear via `cleared_at`.

**Currency tracking (IPF-01)**

- `instructor_currency`: `user_id`, `kind` enum (`cfi | cfii | mei | medical | bfr | ipc`), `effective_at`, `expires_at`, `notes`, `document_id` FK.
- Status (`current | due_soon | expired`) is a SQL function `currency_status(expires_at, warning_days)`. No stored status column, no background job. Per-kind `warning_days` config in a small `currency_kind_config` table or domain code.
- Reused for student currencies in Phase 5.

**Qualifications (IPF-02)**

- `instructor_qualification`: `user_id`, `kind` enum (`aircraft_type | sim_authorization | course_authorization`), `descriptor` text, `granted_at`, `granted_by`, `notes`.

**Multi-base (MUL-01/02)**

- Schema everywhere now, single-base UI. Every base-scoped business table gets `base_id` NOT NULL referencing `bases.id`. `user_base` join (user can hold roles at multiple bases).
- Active base in cookie `part61.active_base_id` (parallel to `part61.active_role`).
- `withTenantTx` extends to `SET LOCAL app.base_id = ?`. RLS policies on base-scoped tables read both `school_id` AND `base_id`.
- Phase 2 ships exactly one base auto-created with the school; picker UI renders only when a user has roles at >1 base.

**Equipment (FLT-05)**

- `aircraft_equipment_tag` enum: `ifr_equipped, complex, high_performance, glass_panel, autopilot, ads_b_out, ads_b_in, gtn_650, gtn_750, g1000, g3x, garmin_530, kln_94, tail_dragger, retractable_gear`. Stored via `aircraft_equipment` join.
- `aircraft.equipment_notes` text.

**No-show tracking (PER-07)**

- `no_show` table lands now: `id`, `user_id`, `school_id`, `scheduled_at`, `aircraft_id`, `instructor_id`, `lesson_descriptor` (text — Phase 5 replaces with FK), `recorded_by`, `recorded_at`, `reason`. Phase 2 profile shows count in last 90 days + last 5 list.

**Training history (PER-09)**

- `student_course_enrollment` with minimal columns now: `id`, `user_id`, `course_descriptor` (text — Phase 5 replaces with FK), `enrolled_at`, `completed_at`, `withdrawn_at`, `notes`.

**Instructor experience (PER-10)**

- `instructor_experience`: `user_id`, `total_time`, `pic_time`, `instructor_time`, `multi_engine_time`, `instrument_time`, `as_of_date`, `source` (`self_reported | imported | derived`), `notes`. Admin-entered snapshots in v1.

**Admin pages (ADM-01..07)**

- Table list → detail pattern. Routes:
  - `/admin/people` (list with role chip filter), `/admin/people/[id]`, `/admin/people/new`, `/admin/people/pending` (filtered tab inside /admin/people)
  - `/admin/aircraft` (list), `/admin/aircraft/[id]`, `/admin/aircraft/new`
  - `/admin/dashboard` (fleet status panel for active base)
  - `/admin/school` (settings: name, timezone, default base)
- Under `(app)` route group, gated by `adminProcedure`. Server Components for tables, Client Components only for forms and the switchers.

**Self-registration queue (PER-02)**

- Public `/register` (no auth): collects bio + email + requested school. Creates `users` row with `status = 'pending'`, NO auth user yet.
- Approve = existing Phase 1 invite-accept flow (creates auth user via service role, sends activation, sets `users.status = 'active'`).
- Reject = `users.status = 'rejected'` with reason, no auth user ever created.
- `users.status` enum: `pending | active | inactive | rejected`. Indexed.

**Aircraft photos (FLT-06)**

- Reuse Phase 1 documents flow. Add `aircraft_photo` to `document_kind` enum. Add nullable `aircraft_id` FK column to `documents`. Upload via existing documents tRPC router wrapped to scope to an aircraft.

**Schema-first discipline**

- Every new table: `school_id`, RLS policy, audit trigger, hard-delete blocker (where training/maint relevant), cross-tenant test.
- Hand-author the migration AND mirror to `supabase/migrations/` for `supabase start`.
- Drizzle `pgPolicy` must use `to: 'authenticated'` as a STRING (not sql literal — Phase 1 bug).
- Soft-delete-and-block triggers attach to: `flight_log_entry`, `person_hold`, `instructor_currency`, `instructor_qualification`, `no_show`, `student_course_enrollment`.

### Claude's Discretion

- Exact column types beyond what's specified
- Form library / validation (Zod + react-hook-form is fine)
- Server Actions vs tRPC mutations for forms — pick one and be consistent
- Phone number formatting / validation library
- Address autocomplete (skip for v1 — plain fields)
- Empty state visuals / loading skeletons
- Pagination strategy on the people / aircraft tables (cursor or offset, both fine for v1 volume)
- Whether the people-table filter is a query string or a session preference
- Unit display preference (always show times to 1 decimal)

### Deferred Ideas (OUT OF SCOPE)

- Background expiration notification job (Phase 8)
- TSA AFSP automated workflow
- IACRA deep-link from instructor profile (Phase 5)
- Aircraft squawks / open work orders panels (Phase 4)
- Per-base operating hours / holiday calendar (Phase 3 if needed)
- Instructor pay rates / payroll (v2)
- Pilot logbook PDF export for instructors (Phase 5/8)
- Document expiration push notifications (Phase 8)
- Bulk CSV import (v2)
- Rental customer agreement e-sign (v2)
- Two-factor for admin role (v2)
- Searching the people list (Phase 8)
- Auto-derived total time from system flight logs (v2)
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                               | Research Support                                                                                                  |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ADM-01 | Admin create/edit/soft-delete students                    | `/admin/people` CRUD pattern (§Architecture); reuse `adminProcedure`+`withTenantTx`; soft-delete via `deleted_at` |
| ADM-02 | Admin CRUD instructors                                    | Same people router; role=instructor                                                                               |
| ADM-03 | Admin CRUD mechanics with A&P/IA                          | Reuses existing `mechanicAuthority` enum on `user_roles` from Phase 1                                             |
| ADM-04 | Assign/change roles on any user                           | `user_roles` mutations through admin sub-router; audit trigger fires                                              |
| ADM-05 | Admin CRUD aircraft (tail, m/m/y, equipment, base, photo) | `/admin/aircraft` router; `aircraft_equipment` join; photo via documents reuse                                    |
| ADM-06 | School settings (name, tz, default base, templates)       | `/admin/school` — extends existing `schools` table                                                                |
| ADM-07 | Admin dashboard fleet status                              | Query `aircraft_current_totals` view joined to latest `flight_log_entry` per aircraft                             |
| FLT-01 | Independent Hobbs/tach/airframe/engine time series        | `flight_log_entry` + `aircraft_engine` + `flight_log_entry_engine`                                                |
| FLT-02 | Append-only flight log events                             | Hard-delete blocker + no UPDATE policy; correction = new row with `corrects_id`                                   |
| FLT-03 | Current totals as derived query                           | `aircraft_current_totals` VIEW — §Pattern: VIEW over append-only log                                              |
| FLT-05 | Equipment tags for lesson filtering                       | `aircraft_equipment_tag` enum + join table — §Pattern: enum-backed tag join                                       |
| FLT-06 | Aircraft profile page                                     | Reuse documents flow; view-sourced totals; recent flights query                                                   |
| PER-01 | Full biographic data                                      | `person_profile` table                                                                                            |
| PER-02 | Self-registration with approval queue                     | `users.status = 'pending'` + `/admin/people/pending` tab — §Pattern: deferred auth user creation                  |
| PER-03 | Emergency contact                                         | `emergency_contact` 1:N                                                                                           |
| PER-04 | Info release authorizations                               | `info_release_authorization` 1:N                                                                                  |
| PER-05 | Student hold/ground                                       | `person_hold` with `kind` enum                                                                                    |
| PER-06 | Instructor ground                                         | Same `person_hold` table                                                                                          |
| PER-07 | No-show records                                           | `no_show` table with `lesson_descriptor` text                                                                     |
| PER-08 | Rental customer record type                               | Role enum extension; same `users`+`person_profile`                                                                |
| PER-09 | Training history view                                     | `student_course_enrollment` with `course_descriptor` text                                                         |
| PER-10 | Instructor experience history                             | `instructor_experience` snapshots                                                                                 |
| IPF-01 | Currencies with expiration auto-warn                      | `instructor_currency` + `currency_status()` SQL function — §Pattern: computed-status function                     |
| IPF-02 | Instructor qualifications                                 | `instructor_qualification` with `kind` enum                                                                       |
| MUL-01 | Base-scoped resources                                     | `base_id NOT NULL` + `user_base` join — §Pattern: combined school+base RLS                                        |
| MUL-02 | Active base switching                                     | `part61.active_base_id` cookie + `BaseSwitcher` — §Pattern: extending withTenantTx                                |

</phase_requirements>

## Summary

Phase 2 is almost entirely an **extension of already-proven Phase 1 patterns**. The research question is not "which libraries?" (answer: zero new dependencies) but "how do we extend each Phase 1 primitive cleanly?" Every table repeats the Phase 1 template: Drizzle schema with `pgPolicy`, audit trigger attached via `select audit.attach('tbl')`, hard-delete blocker where training-relevant, cross-tenant RLS test. Every admin page reuses the established `(app)` layout + `adminProcedure` + server-component-table / client-component-form split. Every mutation runs inside `withTenantTx`. The documents pipeline already built in Phase 1 absorbs aircraft photos with a single enum-value addition and one nullable FK column.

The **three genuinely novel surfaces** that need careful planning are: (1) extending `withTenantTx` to set `app.base_id` from a cookie and having RLS policies consume it while still permitting admin cross-base reads; (2) the SQL VIEW `aircraft_current_totals` over the append-only `flight_log_entry` table — Postgres 15+ views default to `security_invoker = false` (runs as view owner, bypassing RLS), so we **must** declare the view `WITH (security_invoker = true)` for RLS on the base table to flow through; (3) the self-registration flow that creates a `public.users` row with `status='pending'` **without** an `auth.users` row, which is unusual and requires the access token hook, the `public.users.id` FK to `auth.users`, and the `adminProcedure` approval path to interact carefully.

**Primary recommendation:** Plan Phase 2 in a schema-first sequence. Wave 0 writes the Drizzle schema files + hand-authored SQL migration + Supabase mirror + cross-tenant tests for every new table (all tables land in a single migration `0002_phase2_personnel_aircraft.sql` — splitting buys nothing and complicates FK ordering). Wave 1 extends `withTenantTx` and the access token hook for `base_id` + `status`. Wave 2 builds tRPC routers (people, aircraft, flightLog, holds, currencies, qualifications, adminUsers). Wave 3 builds the admin pages reusing the /profile/documents upload pattern. Wave 4 builds `/register` + approval flow. Wave 5 builds the fleet dashboard reading from the view. Verify cross-tenant RLS after every wave; do not defer.

## Standard Stack

No new core dependencies. Everything below is already installed by Phase 1.

### Core (inherited from Phase 1, verified in `01-RESEARCH.md`)

| Library                 | Version  | Purpose                                                      | Why Standard                               |
| ----------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------ |
| Drizzle ORM             | 0.36+    | Schema + `pgPolicy` for RLS, migrations generator            | First-class RLS primitives; Phase 1 proven |
| drizzle-kit             | matching | Migration generation for diff-checking the hand-authored SQL | Source-of-truth verification               |
| postgres (porsager)     | 3.x      | Postgres driver used by Drizzle + RLS test harness           | Required by transaction-mode pooler        |
| tRPC                    | 11.x     | Admin/people/aircraft/etc. routers                           | Phase 1 pattern                            |
| Zod                     | 3.23+    | Input validation on every mutation                           | tRPC input schemas                         |
| `@supabase/supabase-js` | 2.x      | Service-role admin client for auth user creation on approve  | Already wired in `auth.ts::inviteUser`     |
| `@supabase/ssr`         | latest   | Cookie session in App Router                                 | Already wired in `layout.tsx`              |
| Next.js 15 App Router   | 15.x     | Server Components for list pages, Client for forms           | Phase 1 pattern                            |
| date-fns-tz             | latest   | Due-soon/expired currency rendering in school TZ             | FND-06 contract                            |

### Supporting (Claude's discretion inside CONTEXT limits)

| Library             | Purpose                                                              | When to Use                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| react-hook-form     | Form state for the admin edit pages                                  | RECOMMENDED — 8+ forms in this phase (person edit, aircraft edit, currency add, qualification add, hold create, etc.); hand-rolled `useState` forms become unmaintainable at that count |
| @hookform/resolvers | Bridge react-hook-form to Zod schemas already defined in tRPC inputs | Keeps one schema source of truth                                                                                                                                                        |
| libphonenumber-js   | Phone input normalization                                            | OPTIONAL — plain `text` column is fine for v1, but normalizing on write prevents future display inconsistencies                                                                         |

**Installation (only if the planner accepts the RHF recommendation):**

```bash
pnpm --filter web add react-hook-form @hookform/resolvers
# optional: pnpm --filter web add libphonenumber-js
```

### Alternatives Considered

| Instead of                       | Could Use                                     | Tradeoff                                                                                                                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tRPC mutations from client forms | Next.js Server Actions                        | Server Actions look cleaner for forms, BUT Phase 1 chose tRPC (`inviteUser`, documents router) and CONTEXT says "pick one pattern" — **stay with tRPC**. Switching mid-project fragments the RLS/tenant-context story (Server Actions don't go through `withTenantTx` unless explicitly wrapped) |
| react-hook-form                  | Native uncontrolled FormData + Server Actions | Scales worse across the 8+ forms; loses inline validation UX                                                                                                                                                                                                                                     |
| Cursor pagination                | Offset pagination                             | CONTEXT allows both. Recommend **offset** (`limit`/`offset`) for v1 — simpler, partner school has <500 people per role. Cursor pays off at 10k+ rows                                                                                                                                             |
| Separate `rental_customer` table | Extend role enum                              | Locked by CONTEXT — extend enum                                                                                                                                                                                                                                                                  |

## Architecture Patterns

### Recommended Schema Layout

```
packages/db/src/schema/
├── tenancy.ts              # existing — UNCHANGED (schools, bases)
├── users.ts                # existing — EXTEND: add users.status enum column; keep FK contract
├── enums.ts                # existing — EXTEND: add 'rental_customer' to roleEnum; add 'aircraft_photo' to documentKindEnum; add new enums (user_status, currency_kind, qualification_kind, hold_kind, flight_log_entry_kind, engine_position, citizenship_status, tsa_afsp_status, equipment_tag, experience_source)
├── documents.ts            # existing — EXTEND: add nullable aircraftId column; new RLS using OR clause (user_id match OR aircraft_id in same school)
├── audit.ts                # existing — UNCHANGED
├── personnel.ts            # NEW: person_profile, emergency_contact, info_release_authorization, instructor_experience
├── holds.ts                # NEW: person_hold
├── currencies.ts           # NEW: instructor_currency, currency_kind_config
├── qualifications.ts       # NEW: instructor_qualification
├── no_show.ts              # NEW: no_show
├── enrollment.ts           # NEW: student_course_enrollment
├── aircraft.ts             # NEW: aircraft, aircraft_engine, aircraft_equipment (join)
├── flight_log.ts           # NEW: flight_log_entry, flight_log_entry_engine
├── user_base.ts            # NEW: user_base join
└── views.ts                # NEW: aircraft_current_totals (hand-authored SQL mirrored in migration; export a Drizzle view binding for type-safe SELECTs)

packages/db/migrations/
└── 0002_phase2_personnel_aircraft.sql   # NEW: hand-authored
supabase/migrations/
└── 20260407000000_phase2_personnel_aircraft.sql   # mirror of above
```

### Pattern 1: New Table Template (copy-paste shape)

```ts
// packages/db/src/schema/holds.ts
import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { holdKindEnum } from './enums';
import { schools } from './tenancy';
import { users } from './users';

export const personHold = pgTable(
  'person_hold',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: holdKindEnum('kind').notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    clearedBy: uuid('cleared_by').references(() => users.id),
    clearedReason: text('cleared_reason'),
  },
  (t) => [
    index('person_hold_user_active_idx')
      .on(t.userId)
      .where(sql`cleared_at is null`),
    pgPolicy('person_hold_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated', // STRING, not sql`authenticated` (Phase 1 bug — see Pitfall 1)
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('person_hold_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);
```

And in the hand-authored migration SQL, after table creation:

```sql
alter table public.person_hold enable row level security;
select audit.attach('person_hold');   -- adds audit trigger + hard-delete blocker
```

### Pattern 2: Combined school_id + base_id RLS with Admin Cross-Base Read

Base-scoped tables (`aircraft`, `flight_log_entry`, `instructor_qualification.base_id`, `user_base`) need RLS that:

1. Hard-enforces school isolation (primary safety invariant — never relaxed)
2. Scopes non-admin reads to the active base (from `app.base_id` GUC)
3. **Admins** see all bases within their school

The cleanest way is to read `active_role` from the JWT (which is already in `request.jwt.claims` per the Phase 1 access token hook, and mirrored in `app.active_role` by `withTenantTx`) and widen the WHERE clause for admins:

```ts
pgPolicy('aircraft_select_own_school_base', {
  as: 'permissive',
  for: 'select',
  to: 'authenticated',
  using: sql`
    school_id = (auth.jwt() ->> 'school_id')::uuid
    AND (
      (auth.jwt() ->> 'active_role') = 'admin'
      OR base_id::text = current_setting('app.base_id', true)
    )
  `,
}),
```

**Notes:**

- `current_setting('app.base_id', true)` with `missing_ok=true` returns NULL if unset, so operations that need to span bases (nightly jobs, service-role seeds) simply don't set it and get NULL, which the `OR base_id::text = NULL` clause yields unknown → no match. **Combine with the admin branch** so admin-context tRPC calls that intentionally go cross-base (e.g. fleet dashboard rolled up across bases in Phase 8) still work.
- For INSERT/UPDATE, the `withCheck` should still pin `base_id` to the active base UNLESS active role is admin (admin can create aircraft at any base in the school).
- Non-base-scoped tables (`person_profile`, `person_hold`, `instructor_currency`, `student_course_enrollment`, `no_show`, `instructor_experience`) use school-only RLS, same shape as `person_hold` above.

**Decision on nullable `app.base_id`:** Keep it OPTIONAL (read via `current_setting('app.base_id', true)`). Set it when the cookie is present; leave unset otherwise. This lets the first login after account creation (before the user picks a base, or auto-default) still execute school-scoped queries against non-base tables without failing.

### Pattern 3: Extending `withTenantTx` for `app.base_id`

Extend `packages/db/src/tx.ts::withSchoolContext` to accept an optional `baseId`:

```ts
export interface SchoolContext {
  schoolId: string;
  userId: string;
  activeRole: 'student' | 'instructor' | 'mechanic' | 'admin' | 'rental_customer';
  baseId?: string | null;
}

export async function withSchoolContext<T>(
  tx: ExecutorLike,
  ctx: SchoolContext,
  fn: () => Promise<T>,
): Promise<T> {
  await tx.execute(sql`select set_config('app.school_id', ${ctx.schoolId}, true)`);
  await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
  await tx.execute(sql`select set_config('app.active_role', ${ctx.activeRole}, true)`);
  if (ctx.baseId) {
    await tx.execute(sql`select set_config('app.base_id', ${ctx.baseId}, true)`);
  }
  return fn();
}
```

Then in `packages/api/src/middleware/tenant.ts`, read the base cookie in the tRPC context factory (happens in `apps/web` tRPC handler, not in `@part61/api` — the context builder reads `cookies()` and attaches `baseId`) and pass it through. The server-side layout (`apps/web/app/(app)/layout.tsx`) already reads `part61.active_role` cookie — add a parallel `part61.active_base_id` read there + in the tRPC `createContext`.

**Cookie refresh semantics:** cookie is a plain HTTP cookie. Changes via the `BaseSwitcher` server action write a new cookie; the NEXT request picks it up via `cookies()`; `withTenantTx` sets the new `app.base_id` for that transaction. No session invalidation needed. Same model as Phase 1's role switcher.

### Pattern 4: Append-Only Flight Log Event Store

```ts
// packages/db/src/schema/flight_log.ts
export const flightLogEntry = pgTable(
  'flight_log_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    kind: flightLogEntryKindEnum('kind').notNull(), // 'flight' | 'baseline' | 'correction'
    flownAt: timestamp('flown_at', { withTimezone: true }).notNull(),
    hobbsOut: numeric('hobbs_out', { precision: 10, scale: 1 }), // nullable for baseline-only rows
    hobbsIn: numeric('hobbs_in', { precision: 10, scale: 1 }),
    tachOut: numeric('tach_out', { precision: 10, scale: 1 }),
    tachIn: numeric('tach_in', { precision: 10, scale: 1 }),
    airframeDelta: numeric('airframe_delta', { precision: 10, scale: 1 }).notNull().default('0'),
    // For kind='baseline': store initial totals here as the first "delta"
    correctsId: uuid('corrects_id').references((): AnyPgColumn => flightLogEntry.id),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
  } /* ...RLS policies per Pattern 2 (base-scoped)... */,
);
```

Append-only enforcement happens three ways:

1. **No UPDATE policy** → RLS denies updates
2. **Hard-delete trigger** via `audit.attach('flight_log_entry')` → can't DELETE
3. **Corrections** are NEW rows with `kind='correction'` and `corrects_id` → audit trail intact

### Pattern 5: RLS-Aware VIEW for Derived Totals

The `aircraft_current_totals` view is the single most technically sensitive artifact in this phase. **CRITICAL:** Postgres views created by a superuser default to `security_invoker = false`, meaning queries through the view execute with the view **owner's** permissions, which **bypasses RLS on the base table**. That would leak flight log entries across tenants.

Hand-author the view in the migration with `security_invoker = true` (Postgres 15+):

```sql
-- packages/db/migrations/0002_phase2_personnel_aircraft.sql
create view public.aircraft_current_totals
with (security_invoker = true)
as
select
  fl.aircraft_id,
  a.school_id,
  a.base_id,
  sum(coalesce(fl.hobbs_in, 0) - coalesce(fl.hobbs_out, 0)) +
    coalesce(max(case when fl.kind = 'baseline' then fl.hobbs_in else null end), 0) as current_hobbs,
  sum(coalesce(fl.tach_in, 0) - coalesce(fl.tach_out, 0)) +
    coalesce(max(case when fl.kind = 'baseline' then fl.tach_in else null end), 0) as current_tach,
  sum(fl.airframe_delta) as current_airframe,
  max(fl.flown_at) filter (where fl.kind in ('flight','correction')) as last_flown_at
from public.flight_log_entry fl
join public.aircraft a on a.id = fl.aircraft_id
group by fl.aircraft_id, a.school_id, a.base_id;

-- Grant SELECT to the authenticated role (views need explicit grants — RLS alone is not a grant)
grant select on public.aircraft_current_totals to authenticated;
```

**Key points:**

- `security_invoker = true` makes the view respect RLS on `flight_log_entry` AND `aircraft`, so cross-tenant queries return zero rows naturally. **Verify with a cross-tenant test targeting the view directly.**
- The baseline-row math: baseline rows have `kind='baseline'` and carry initial totals in `hobbs_in` / `tach_in` with `hobbs_out`/`tach_out` NULL. The view sums `(hobbs_in - hobbs_out)` over flight rows and adds the baseline's `hobbs_in` separately via the `MAX FILTER`. (If there can be more than one baseline — e.g. engine swap resets tach — you need a more sophisticated model, but CONTEXT's "initial baseline per aircraft" implies one per aircraft.)
- Drizzle exposes views via `pgView` in `drizzle-orm/pg-core`. You can either (a) hand-author the SQL in the migration and mirror with `pgMaterializedView` / `pgView` in schema for type-safe reads, or (b) only declare the SELECT result shape in TypeScript. **Recommendation: hand-author the SQL in the migration; declare a Drizzle `pgView` shape in `packages/db/src/schema/views.ts` with `.existing()` so drizzle-kit doesn't try to regenerate the DDL.**

```ts
// packages/db/src/schema/views.ts
import { pgView, uuid, numeric, timestamp } from 'drizzle-orm/pg-core';
export const aircraftCurrentTotals = pgView('aircraft_current_totals', {
  aircraftId: uuid('aircraft_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  baseId: uuid('base_id').notNull(),
  currentHobbs: numeric('current_hobbs', { precision: 10, scale: 1 }),
  currentTach: numeric('current_tach', { precision: 10, scale: 1 }),
  currentAirframe: numeric('current_airframe', { precision: 10, scale: 1 }),
  lastFlownAt: timestamp('last_flown_at', { withTimezone: true }),
}).existing();
```

### Pattern 6: Multi-Engine Aggregation

Two options for returning per-engine times with the view:

- **Option A (recommended):** A companion view `aircraft_engine_current_totals` grouped by `(aircraft_id, engine_id)`. Application joins it to `aircraft` when a per-engine breakdown is needed. Keeps the main view one row per aircraft.
- **Option B:** Add a `jsonb_agg` column to `aircraft_current_totals` producing `[{engine_id, position, hours}, ...]`. Works but obscures the RLS path (RLS still applies because the view is `security_invoker`, but the jsonb aggregate is harder to test and index).

**Recommendation: Option A.** Two small views are clearer than one view with embedded jsonb.

```sql
create view public.aircraft_engine_current_totals
with (security_invoker = true)
as
select
  ae.aircraft_id,
  a.school_id,
  a.base_id,
  ae.id as engine_id,
  ae.position,
  sum(fle.delta_hours) as current_engine_hours
from public.aircraft_engine ae
join public.aircraft a on a.id = ae.aircraft_id
left join public.flight_log_entry_engine fle on fle.engine_id = ae.id
group by ae.aircraft_id, a.school_id, a.base_id, ae.id, ae.position;
```

### Pattern 7: Computed-Status SQL Function for Currencies

```sql
create or replace function public.currency_status(
  p_expires_at timestamptz,
  p_warning_days integer
) returns text
language sql
immutable
as $$
  select case
    when p_expires_at is null then 'unknown'
    when p_expires_at < now() then 'expired'
    when p_expires_at < now() + (p_warning_days || ' days')::interval then 'due_soon'
    else 'current'
  end;
$$;
```

- **`IMMUTABLE` vs `STABLE`:** `now()` makes this function depend on the current time, which technically means it is NOT immutable across transactions. But within one query it's consistent, and marking `IMMUTABLE` lets the planner inline it in `SELECT` lists. **Use `STABLE`** — safer, still inlines in most cases, and correctly reflects that the function's output depends on transaction time.
- **Generated column vs runtime function:** Do NOT use a `GENERATED ALWAYS AS ... STORED` column — stored generated columns cannot depend on `now()`. A VIRTUAL generated column would work but Postgres doesn't yet support virtual generated columns (as of PG 17). **Keep it a runtime function.** Due-soon queries use an indexed range scan on `expires_at` directly: `WHERE expires_at BETWEEN now() AND now() + interval '30 days'`; the function is only for presentation, not indexing.

### Pattern 8: Self-Registration with Deferred Auth User Creation

The unusual shape: `public.users` row exists with `status='pending'` but NO `auth.users` row. This means:

1. **FK contract:** `public.users.id` currently says "mirrors `auth.users.id`" (Phase 1 comment). Relax this: during self-registration, generate a UUID client-side (server-side actually — use `gen_random_uuid()`) and store it in `public.users.id`. **Do NOT add a physical FK `references auth.users(id)` on `public.users`** (the Phase 1 migration comments already note this FK was deferred — good). On approval, the `supabase.auth.admin.createUser(..., { id: <existingPublicUserId> })` call (or `inviteUserByEmail` with a pre-specified id) creates the `auth.users` row with the SAME id — Supabase supports providing a custom `id` at admin creation.
2. **Access token hook must handle `status='pending'`:** the hook runs on login. A pending user cannot log in because no `auth.users` row exists, so the hook never fires for pending rows. **But** after approval, the access token hook must join to `public.users` and check `status = 'active'`; if status is `rejected` or `inactive`, the hook should either raise an error or emit empty role claims so role-gated procedures reject the request. Recommend: the hook raises with a message so the login UX can show "Your account has been deactivated." **This is a critical Phase 1 contract change — verify before writing code.**
3. **Approval flow (tRPC `adminProcedure`):** `people.approveRegistration({ userId, role })` does: (a) re-read the pending row, (b) call `supabase.auth.admin.inviteUserByEmail(email, { ..., data: { invited_role, invited_school_id, existing_user_id: userId }})` — BUT Supabase's `inviteUserByEmail` does NOT let you specify the auth user id; it always creates a fresh one. So the cleaner path is: (a) call `supabase.auth.admin.createUser({ email, id: userId, email_confirm: false })` to create the auth user with the pre-existing public.users id, then (b) call `supabase.auth.admin.generateLink({ type: 'invite', email })` to send the activation email. OR (simpler): when creating the pending row, DO NOT pre-assign an id; on approve, call `inviteUserByEmail`, capture the new `auth.users.id`, and UPDATE `public.users.id` to match. **Problem with the update path:** `id` is the primary key and may already be referenced by `emergency_contact`, `info_release_authorization`, etc. So: either cascade the update (messy) or pre-assign the id (requires `createUser` + `generateLink`).
4. **Recommendation:** Pre-assign id; use `auth.admin.createUser({ email, id, email_confirm: false, user_metadata: { invited_role, invited_school_id }})` + `auth.admin.generateLink({ type: 'invite', email })`. This path is documented in Supabase Auth admin API docs. **Verify the exact method signatures against supabase-js v2 at task time** (these APIs have been stable since 2.40 but evolve).
5. **Rejection:** set `status='rejected'`, write `rejection_reason`, do NOT touch auth. Audit trigger captures the state change.

### Pattern 9: Drizzle Enum Alteration in a Migration

Adding a value to an existing Postgres enum requires `ALTER TYPE ... ADD VALUE`. **Gotcha:** in PG < 12, `ALTER TYPE ... ADD VALUE` could not run inside a transaction block. **PG 15+ (including Supabase's PG 15/17) supports it inside transactions**, so the standard Drizzle-kit migration runner (which wraps each migration in a transaction by default) works fine.

In the hand-authored migration:

```sql
-- Extend existing enums
alter type public.role add value if not exists 'rental_customer';
alter type public.document_kind add value if not exists 'aircraft_photo';
```

**Drizzle-kit caveat:** Drizzle-kit's `generate` diff detects enum additions and emits `ALTER TYPE ... ADD VALUE`. Good. But Drizzle-kit's generator **does NOT** emit `IF NOT EXISTS`, which makes the migration non-idempotent. Hand-edit the generated SQL to add `IF NOT EXISTS` so re-applying the migration during local dev doesn't fail.

**New enums** (`user_status`, `currency_kind`, `qualification_kind`, `hold_kind`, `flight_log_entry_kind`, `engine_position`, `citizenship_status`, `tsa_afsp_status`, `aircraft_equipment_tag`, `experience_source`) are created fresh via `create type ... as enum (...)` — Drizzle generates these from `pgEnum(...)` declarations.

### Pattern 10: Aircraft Photo Reuse of documents Flow

Add a nullable `aircraft_id` column to `documents`:

```ts
// extend documents.ts
aircraftId: uuid('aircraft_id').references(() => aircraft.id),   // nullable; present only for kind='aircraft_photo'
```

RLS widening — current Phase 1 policy is `school_id = jwt.school_id`, which is ALREADY correct for aircraft photos because `school_id` is still populated. The application-level filter (`where kind='aircraft_photo' and aircraft_id=?`) happens in the tRPC router.

**Critical:** Phase 1's `storagePath(schoolId, userId, documentId, ext)` puts files under `school_<s>/user_<u>/<doc>`. For aircraft photos, the `uploaded_by` is still a user, but the logical owner is the aircraft. **Options:**

- **A (simpler, recommended):** keep the same path shape — the uploader is the "user" segment. Access is gated by `school_id` anyway, and admins can read all school objects per the Phase 1 admin branch in `createSignedDownloadUrl`.
- **B:** extend `storagePath` to a `school_<s>/aircraft_<a>/<doc>` shape, requiring a new storage.objects RLS policy. More work, no safety benefit, since the photo is already school-scoped.

**Recommendation: Option A.** Add a new tRPC procedure `documentsRouter.uploadAircraftPhoto({ aircraftId, ... })` that: validates the aircraft is in the caller's school, then delegates to `createSignedUploadUrl` + `finalizeUpload` with `kind='aircraft_photo'` and the new `aircraftId` field. No storage RLS changes needed.

### Pattern 11: tRPC Router Shape for Admin CRUD

```
packages/api/src/routers/
├── admin/
│   ├── _root.ts         # export adminRouter = router({ people, aircraft, school, dashboard })
│   ├── people.ts        # people: list, getById, create, update, softDelete, approveRegistration, rejectRegistration
│   ├── aircraft.ts      # aircraft: list, getById, create, update, softDelete, listEngines, addEngine, removeEngine, listEquipment, setEquipment
│   ├── school.ts        # school: get, update
│   └── dashboard.ts     # dashboard: fleetStatus (reads aircraft_current_totals)
├── people/
│   ├── _root.ts         # peopleRouter = router({ profile, emergencyContacts, infoReleases, holds, currencies, qualifications, noShows, enrollments, experience })
│   └── ...subrouters...
├── flightLog.ts         # flightLog: list, create (close-out), createCorrection
├── baseSwitch.ts        # switchActiveBase (server action writes cookie; this validates)
└── register.ts          # public: submitRegistration
```

All mutations use `adminProcedure` except `submitRegistration` (publicProcedure — no session required). Every mutation accepts a Zod-validated input. Delegate the actual DB work to functions in `packages/db/src/repositories/*` only if the business logic gets complex; for Phase 2 most handlers are straightforward Drizzle calls.

### Pattern 12: Server Component List + Client Component Form

Match Phase 1 `/profile/documents` layout:

```
apps/web/app/(app)/admin/people/
├── page.tsx                        # Server Component: Drizzle SELECT + filter chips
├── PeopleTable.tsx                 # Client Component — filter state, links
├── new/
│   ├── page.tsx                    # Server Component shell
│   └── CreatePersonForm.tsx        # Client Component — react-hook-form + tRPC mutation
├── pending/
│   └── page.tsx                    # Server Component: filtered SELECT where status='pending' + approve buttons
└── [id]/
    ├── page.tsx                    # Server Component: Drizzle SELECTs for profile, emergency contacts, holds, currencies, etc.
    ├── EditProfileForm.tsx         # Client
    ├── HoldsPanel.tsx              # Client (create hold, clear hold)
    ├── CurrenciesPanel.tsx         # Client
    ├── QualificationsPanel.tsx     # Client
    ├── EmergencyContactsPanel.tsx  # Client
    ├── InfoReleasePanel.tsx        # Client
    ├── NoShowsPanel.tsx            # Server (read-only list)
    ├── EnrollmentsPanel.tsx        # Server (read-only list)
    └── ExperiencePanel.tsx         # Client
```

Server Components read directly via Drizzle (not tRPC) — Phase 1 `/profile/documents/page.tsx` establishes this pattern. Use tRPC only for mutations from client components.

### Pattern 13: Pagination (Offset-based, Recommended)

```ts
// packages/api/src/routers/admin/people.ts
list: adminProcedure
  .input(z.object({
    roleFilter: z.enum(['student','instructor','mechanic','admin','rental_customer','pending']).optional(),
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(100).default(25),
  }))
  .query(async ({ ctx, input }) => {
    const { tx } = ctx;
    // ...build the filtered query against users/person_profile/user_roles
    // return { rows, total, page, pageSize }
  }),
```

If the partner school grows beyond ~1000 users per role, switch to cursor (on `(created_at, id)`). V1 is fine with offset.

### Anti-Patterns to Avoid

- **Storing current Hobbs on `aircraft`** — the whole point of FLT-03 is that this is wrong. Use the view exclusively.
- **Using a VIEW without `security_invoker`** — silently bypasses RLS. This is THE sharp edge in Phase 2. Cross-tenant test MUST assert zero rows through the view.
- **Mixing Server Actions and tRPC for forms** — CONTEXT says pick one. Stay with tRPC.
- **Updating `users.status` from anywhere but the approval/rejection procedures** — keeps the state machine auditable.
- **Reading `app.base_id` in SELECTs against non-base-scoped tables** — don't; those policies only read `school_id`. Mixing causes confusing failures.
- **Storing Hobbs/tach as `integer * 10` pseudo-fixed-point** — use Postgres `numeric(10,1)`. Display-layer rounding is a UI concern.
- **Adding a FK from `documents.aircraft_id` to `aircraft` without NULL permission** — it MUST be nullable so existing medicals/licenses keep working.

## Don't Hand-Roll

| Problem                                         | Don't Build                                   | Use Instead                                                                                                                              | Why                                                                                       |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Timezone-aware status comparison in app code    | JS `Date` math                                | `currency_status(expires_at, warning_days)` SQL function + `now() AT TIME ZONE school.timezone` when displaying                          | Single source of truth; indexable range scans                                             |
| Current totals via app-side `SUM()`             | `SELECT * FROM flight_log_entry; sum in Node` | `aircraft_current_totals` VIEW                                                                                                           | RLS coverage, query pushdown, atomic per-transaction view of totals                       |
| Form state for admin pages                      | Hand-rolled `useState`/`useReducer`           | `react-hook-form` + zod resolver                                                                                                         | Dirty tracking, error focus, nested field arrays for engines/equipment/emergency contacts |
| Custom admin user creation path                 | Write a new admin-client wrapper              | Reuse `packages/api/src/routers/auth.ts::inviteUser` — or its `supabase.auth.admin.createUser` sibling — with the pattern from Pattern 8 | Already handles lazy env read, service-role client, audit context through `withTenantTx`  |
| Audit logging for new tables                    | App-level logging calls                       | `select audit.attach('new_table')` in the migration                                                                                      | Triggers cannot be bypassed by application bugs                                           |
| Cross-tenant isolation per-query                | `WHERE school_id = ?` in every Drizzle call   | RLS + `withTenantTx`                                                                                                                     | Missing WHERE = cross-tenant leak. RLS is the only place it can't be forgotten            |
| Flight log corrections via UPDATE               | Mutable flight log entries                    | Append-only: new row `kind='correction'` with `corrects_id`                                                                              | Append-only is the FND-04 contract; triggers enforce it                                   |
| Custom password reset for self-registered users | Side-channel                                  | The approval flow triggers Supabase's built-in invite/activation email                                                                   | Already email-verified by the Phase 1 contract                                            |

## Common Pitfalls

### Pitfall 1: `pgPolicy` `to:` must be a string, not `sql\`authenticated\``

**What goes wrong:** Drizzle accepts `to: sql\`authenticated\``but emits incorrect migration SQL or policy SQL that fails at runtime.
**Why it happens:** Phase 1 hit this bug and locked the fix in STATE.md (01-02 decisions).
**How to avoid:** ALWAYS`to: 'authenticated'`as a plain string in every new`pgPolicy`. Grep the new schema files before committing.
**Warning signs:** `drizzle-kit generate`output that has`to` with raw SQL inside.

### Pitfall 2: VIEW without `security_invoker = true` bypasses RLS

**What goes wrong:** A view created by a superuser owner and queried by the `authenticated` role executes as the owner and sees ALL rows across all tenants. Cross-tenant data leak through `aircraft_current_totals`.
**Why it happens:** Postgres default for views is owner-invoked, not invoker-invoked. Supabase docs flag this; beginners miss it.
**How to avoid:** EVERY view in this phase is declared `with (security_invoker = true)`. The cross-tenant test must SELECT from the view (not the base table) to prove RLS flows through.
**Warning signs:** A cross-tenant test that passes on `flight_log_entry` directly but fails on `aircraft_current_totals` — or worse, PASSES because both leak.

### Pitfall 3: Adding an enum value inside Drizzle-kit's wrapped transaction without `IF NOT EXISTS`

**What goes wrong:** Re-running the migration during local dev (after a partial failure) errors because the enum value already exists.
**Why it happens:** Drizzle-kit's generated `ALTER TYPE ... ADD VALUE` omits `IF NOT EXISTS`.
**How to avoid:** Hand-edit the generated SQL to add `IF NOT EXISTS`. Verify the migration is idempotent by running it twice locally.

### Pitfall 4: `current_setting('app.base_id')` raises when unset

**What goes wrong:** Calling `current_setting('app.base_id')` (without the second arg) raises `unrecognized configuration parameter` if the GUC was never set in the session, breaking every query.
**Why it happens:** Postgres's default behavior. The two-arg form `current_setting('app.base_id', true)` returns NULL on missing, which is what we want.
**How to avoid:** ALWAYS use `current_setting('app.base_id', true)` (the `missing_ok=true` form) in RLS policies. Same applies to `app.active_role` if policies read it directly rather than `auth.jwt()`.

### Pitfall 5: `users.status = 'pending'` row with no `auth.users` sibling blocks login of ALL users if the access token hook joins wrong

**What goes wrong:** If the Phase 1 custom access token hook does a `JOIN public.users` that assumes a 1:1 with `auth.users` and the join is INNER, a pending row without auth sibling is harmless — BUT if someone later adds a reverse assumption (querying `public.users` and expecting every row to have a matching `auth.users`), login breaks for everyone until the dangling pending rows are cleaned up.
**How to avoid:** Document the invariant `public.users.status='pending' <=> no auth.users row`. Add a cross-tenant test assertion that a pending user's access token hook invocation (simulated) returns an error or no-role claim. Do NOT write reports or jobs that assume `public.users.id IN (SELECT id FROM auth.users)` unless they explicitly filter `status != 'pending'`.

### Pitfall 6: Cookie value from `BaseSwitcher` ignored until next request

**What goes wrong:** User switches base, but the current page still renders with old base because the layout has already read cookies for THIS request.
**How to avoid:** After `switchActiveBase` server action, call `redirect()` or `router.refresh()` — same pattern as RoleSwitcher.

### Pitfall 7: Numeric columns returned as strings by postgres-js

**What goes wrong:** `numeric(10,1)` comes back as a JavaScript string, not a number. Passing it to `.toFixed(1)` works by accident; passing it to arithmetic silently concatenates.
**How to avoid:** Cast to number in the application layer OR use Drizzle's built-in `numeric` mode. For display (CONTEXT: "always 1 decimal"), format via `Number(x).toFixed(1)` consistently.

### Pitfall 8: Missing `grant select on <view> to authenticated`

**What goes wrong:** Views are created fine, RLS flows through fine, but the `authenticated` role has no SELECT grant on the view itself → every query fails with "permission denied for view aircraft_current_totals."
**How to avoid:** Every `create view` in the migration is followed by `grant select on public.<view> to authenticated;`

### Pitfall 9: Cross-tenant test for the view passes trivially because no data exists in school B

**What goes wrong:** The test seeds school A with flight log entries and forgets to seed school B with entries, then asserts "school A cannot see school B entries" — which passes vacuously.
**How to avoid:** Seed BOTH schools with `flight_log_entry` rows and aircraft, then assert the positive (school A sees its own totals) AND negative (school A sees ZERO rows from school B's aircraft ids).

### Pitfall 10: `flight_log_entry_engine` delta_hours sign on corrections

**What goes wrong:** A correction row attempts to "undo" an earlier entry by inserting a negative `delta_hours`. This is legal in the append-only model but the view's `sum()` happily allows it, which is correct — BUT the UI must show the original AND the correction together (audit trail), not net them silently.
**How to avoid:** The aircraft detail page's "recent flights" list shows all rows including corrections, with correction rows visually linked to their `corrects_id`. The `aircraft_current_totals` view returns the net (which is what you want displayed as current totals).

### Pitfall 11: Unique constraint on `user_roles(user_id, role)` blocks rental_customer + student dual role

**Self-check:** CONTEXT says dual-role (student + rental) is two rows. The existing Phase 1 constraint is `uniqueIndex('user_roles_user_role_unique').on(t.userId, t.role)` — that's `(user_id, role)`, not `(user_id)`, so two rows with different `role` values are allowed. No change needed. Verify in testing.

### Pitfall 12: Adding `base_id NOT NULL` column to non-existing tables is fine; retrofit would need defaults

**Self-check:** All base-scoped tables are NEW in Phase 2. No existing data, no need for `DEFAULT` → `ALTER COLUMN SET NOT NULL` dance. Just declare NOT NULL from the start.

### Pitfall 13: `adminProcedure` in Phase 1 only checks `active_role === 'admin'`

**What goes wrong:** If a user holds `admin` but has switched active role to `student`, `adminProcedure` rejects them even though they are an admin. Current behavior is correct by design — "active role is the effective role." But admin approval of a pending registration is a thing admins do, so ensure the `/admin/*` pages also verify the user's ACTIVE role is admin in the layout guard (not just "holds admin").
**How to avoid:** `/admin` routes render a `<AdminGuard>` server component that reads the session's active role and 403s if not admin.

## Code Examples

### Example 1: Hand-authored migration skeleton

```sql
-- packages/db/migrations/0002_phase2_personnel_aircraft.sql
-- mirror at supabase/migrations/20260407000000_phase2_personnel_aircraft.sql

begin;

-- 1. Extend existing enums
alter type public.role add value if not exists 'rental_customer';
alter type public.document_kind add value if not exists 'aircraft_photo';

-- 2. New enums
create type public.user_status as enum ('pending','active','inactive','rejected');
create type public.hold_kind as enum ('hold','grounding');
create type public.currency_kind as enum ('cfi','cfii','mei','medical','bfr','ipc');
create type public.qualification_kind as enum ('aircraft_type','sim_authorization','course_authorization');
create type public.flight_log_entry_kind as enum ('flight','baseline','correction');
create type public.engine_position as enum ('single','left','right','center','n1','n2','n3','n4');
create type public.citizenship_status as enum ('us_citizen','us_national','foreign_national','unknown');
create type public.tsa_afsp_status as enum ('not_required','pending','approved','expired');
create type public.experience_source as enum ('self_reported','imported','derived');
create type public.aircraft_equipment_tag as enum (
  'ifr_equipped','complex','high_performance','glass_panel','autopilot',
  'ads_b_out','ads_b_in','gtn_650','gtn_750','g1000','g3x',
  'garmin_530','kln_94','tail_dragger','retractable_gear'
);

-- 3. Extend users
alter table public.users add column status public.user_status not null default 'active';
create index users_status_idx on public.users (status);

-- 4. Extend documents
alter table public.documents add column aircraft_id uuid;
-- FK added after aircraft table exists:
-- alter table public.documents add constraint documents_aircraft_id_fkey
--   foreign key (aircraft_id) references public.aircraft(id);

-- 5. Create all Phase 2 tables (order respecting FKs)
-- ... person_profile, emergency_contact, info_release_authorization,
--     user_base, aircraft, aircraft_engine, aircraft_equipment,
--     flight_log_entry, flight_log_entry_engine,
--     person_hold, instructor_currency, currency_kind_config,
--     instructor_qualification, no_show, student_course_enrollment,
--     instructor_experience
-- (drizzle-kit generate produces the CREATE TABLE statements; hand-author
--  the RLS + audit.attach + view blocks)

-- 6. Now wire documents.aircraft_id FK
alter table public.documents add constraint documents_aircraft_id_fkey
  foreign key (aircraft_id) references public.aircraft(id);

-- 7. Enable RLS + attach audit triggers
alter table public.person_profile enable row level security;
alter table public.emergency_contact enable row level security;
-- ... (for every new table)

select audit.attach('person_profile');
select audit.attach('person_hold');
select audit.attach('instructor_currency');
select audit.attach('instructor_qualification');
select audit.attach('flight_log_entry');
select audit.attach('flight_log_entry_engine');
select audit.attach('aircraft');
select audit.attach('aircraft_engine');
select audit.attach('no_show');
select audit.attach('student_course_enrollment');
select audit.attach('instructor_experience');
select audit.attach('user_base');
-- (emergency_contact, info_release_authorization, aircraft_equipment,
--  currency_kind_config: audit yes, hard-delete blocker no — these are
--  not training-record tables, they can be hard-deleted. Use a split
--  helper audit.attach_audit_only('tbl') or skip the block trigger.)

-- 8. Create the currency_status function
create or replace function public.currency_status(
  p_expires_at timestamptz, p_warning_days integer
) returns text language sql stable as $$
  select case
    when p_expires_at is null then 'unknown'
    when p_expires_at < now() then 'expired'
    when p_expires_at < now() + (p_warning_days || ' days')::interval then 'due_soon'
    else 'current'
  end;
$$;

-- 9. Create the views
create view public.aircraft_current_totals with (security_invoker = true) as
  -- (see Pattern 5)
  select 1;  -- placeholder

grant select on public.aircraft_current_totals to authenticated;

create view public.aircraft_engine_current_totals with (security_invoker = true) as
  -- (see Pattern 6)
  select 1;  -- placeholder

grant select on public.aircraft_engine_current_totals to authenticated;

commit;
```

### Example 2: Extending `withSchoolContext` for base_id

See Pattern 3. Apply the change to `packages/db/src/tx.ts` and mirror the context-builder change in `apps/web/app/api/trpc/[trpc]/route.ts` (or wherever the tRPC context is constructed) to read `cookies().get('part61.active_base_id')`.

### Example 3: approveRegistration tRPC procedure

```ts
// packages/api/src/routers/admin/people.ts (excerpt)
approveRegistration: adminProcedure
  .input(z.object({ userId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Supabase admin not configured' });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false }});

    // Read the pending row from within the tenant-scoped transaction
    const tx = ctx.tx as { execute: (q: ReturnType<typeof sql>) => Promise<any> };
    const rows = await tx.execute(sql`
      select id, email, school_id from public.users where id = ${input.userId} and status = 'pending'
    `);
    // ... validate row exists and belongs to this school ...

    // Create the auth user with the SAME id as the pending public.users row
    const { data, error } = await admin.auth.admin.createUser({
      id: input.userId,
      email: rows[0].email,
      email_confirm: false,
      user_metadata: { invited_school_id: rows[0].school_id },
    });
    if (error) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });

    // Generate + send the invite/recovery link
    const { error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: rows[0].email,
    });
    if (linkErr) throw new TRPCError({ code: 'BAD_REQUEST', message: linkErr.message });

    // Flip status to active — audit trigger fires
    await tx.execute(sql`
      update public.users set status = 'active', updated_at = now() where id = ${input.userId}
    `);

    return { ok: true };
  }),
```

**Verify at task time:** `supabase.auth.admin.createUser` accepting a custom `id` parameter. If the version in use does not support it, fall back to the "create auth user first, then insert public.users with matching id" flow, which means the self-registration collector only stores registration requests in a separate `registration_request` table, NOT in `public.users`. That's a meaningful schema change — flag early if the admin API is restrictive.

## State of the Art

| Old Approach                                        | Current Approach                 | When Changed                      | Impact                                                                           |
| --------------------------------------------------- | -------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| Views default owner-invoked                         | `security_invoker = true` opt-in | Postgres 15 (Oct 2022)            | Required for RLS flow-through; opt-in syntax must be declared explicitly         |
| `ALTER TYPE ... ADD VALUE` forbidden in transaction | Allowed since PG 12              | PG 12 (2019)                      | Drizzle-kit's transactional migration wrapper works on current Supabase Postgres |
| Storing current totals on aircraft                  | Append-only event log + view     | CAMP best practices; CONTEXT lock | Derived reads; no retrofit pain later                                            |
| `@supabase/auth-helpers-nextjs`                     | `@supabase/ssr`                  | 2024 (Phase 1 decision)           | Already used in Phase 1 layout                                                   |
| Supabase GoTrue hooks                               | Auth Hooks: Custom Access Token  | 2024                              | Phase 1 already uses the new mechanism                                           |

**Deprecated/outdated:**

- Pre-PG 15 view patterns (no `security_invoker`) — do not copy from older tutorials.
- The Drizzle `authenticatedRole` helper from `drizzle-orm/supabase` — Phase 1 chose NOT to use it and the migration is now broken if you try. Use `to: 'authenticated'` string literal.

## Open Questions

1. **Does `supabase.auth.admin.createUser` accept a custom `id` on the supabase-js version currently installed?**
   - What we know: The Supabase Auth Admin REST API (`POST /auth/v1/admin/users`) accepts an `id` field in recent versions.
   - What's unclear: Whether the supabase-js 2.x method signature exposes it or silently drops it.
   - Recommendation: Verify in Wave 0 by reading the installed version's TypeScript types. If not supported, pivot to a `registration_request` table pattern (see Pattern 8 fallback) and update plans before coding.

2. **Should `currency_kind_config` be a table or domain constants?**
   - What we know: CONTEXT says "small `currency_kind_config` table OR hardcoded in domain code."
   - What's unclear: Will the partner school want to customize `warning_days` per currency kind?
   - Recommendation: Start with a table (cheap to create, easier to change at runtime than a code deploy), seed with defaults (`medical=30`, `bfr=60`, `cfi=30`, `cfii=30`, `mei=30`, `ipc=30`). If the partner never customizes it, no harm done.

3. **Does `pgView().existing()` in Drizzle correctly suppress DDL generation for views hand-authored in the migration?**
   - What we know: Drizzle docs mention `.existing()` for views already present in the DB; it stops drizzle-kit from trying to CREATE them.
   - What's unclear: Whether drizzle-kit's diff correctly ignores the view entirely or tries to drop-and-recreate.
   - Recommendation: After authoring the migration, run `drizzle-kit generate --name phase2_verify` against a clean DB that has the migration applied. If it emits view-related DDL, the `.existing()` call is wrong and you need to adjust.

4. **Cross-base admin reads — should they require explicitly unsetting `app.base_id`, or does the `active_role='admin'` branch suffice?**
   - What we know: Pattern 2's policy uses `OR active_role='admin'` which lets admins see all bases regardless of `app.base_id`.
   - What's unclear: Whether Phase 3 scheduling (which will read `aircraft` as an instructor, not admin) will need a way to query all bases.
   - Recommendation: Ship the admin branch only in Phase 2. If Phase 3 needs wider reads, add a "cross-base" context bit to `withTenantTx` (e.g. `baseId: null` explicitly meaning "no filter").

5. **Should `user_base` carry its own `role`, or just `base_id` + `user_id`?**
   - What we know: CONTEXT says "a user can hold roles at multiple bases." That implies per-base role rows.
   - What's unclear: Whether the existing `user_roles` table already carries the role, and whether an `(user_id, base_id, role)` triple is needed or if `(user_id, base_id)` + querying `user_roles` separately is enough.
   - Recommendation: `user_base(user_id, base_id)` join only. Role is still on `user_roles`. Cross-join at query time. Simpler, keeps the role enum in one place. Revisit if scheduling needs per-base role filtering.

## Sources

### Primary (HIGH confidence) — existing codebase

- `packages/db/src/schema/*.ts` — Phase 1 Drizzle pattern (tenancy, users, documents, audit, enums) — all confirmed via Read
- `packages/db/src/tx.ts` — `withSchoolContext` pattern
- `packages/db/src/functions/{audit_attach,fn_block_hard_delete}.sql` — trigger helpers
- `packages/api/src/procedures.ts`, `packages/api/src/middleware/tenant.ts`, `packages/api/src/routers/auth.ts` — tRPC composition and service-role admin client pattern
- `apps/web/app/(app)/layout.tsx`, `apps/web/app/(app)/profile/documents/page.tsx`, `apps/web/components/RoleSwitcher.tsx` — Next.js App Router Server/Client split, cookie-based role switching
- `tests/rls/{harness,cross-tenant}.ts` — RLS test pattern to replicate for every new table
- `.planning/phases/01-foundation-terminology-contract/01-RESEARCH.md` — Phase 1 pitfalls (pgPolicy `to:` bug, RLS invariants, access token hook)
- `.planning/phases/02-personnel-admin-fleet-primitives/02-CONTEXT.md` — all locked decisions
- `.planning/REQUIREMENTS.md` — ADM/FLT/PER/IPF/MUL requirement text

### Secondary (MEDIUM confidence) — documented Postgres/Supabase behavior from training data

- Postgres 15 `security_invoker` view option — official PG 15 release notes
- `ALTER TYPE ... ADD VALUE` inside transactions — PG 12+ release notes
- `current_setting(name, missing_ok)` two-arg form — standard PG docs
- Supabase Auth Admin API `createUser` with custom `id` — flagged as Open Question 1 for in-task verification
- Drizzle `pgView(...).existing()` — flagged as Open Question 3

### Tertiary (LOW confidence)

- Exact current supabase-js v2 admin API method signatures — verify at task time
- Drizzle-kit diff behavior around hand-authored views — verify in Wave 0

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new dependencies, all patterns inherited from Phase 1
- Architecture: HIGH for schema/RLS/audit/tRPC extension patterns; MEDIUM for the novel `security_invoker` view + `app.base_id` combined RLS + deferred auth user creation flow (three surfaces that need in-task verification)
- Pitfalls: HIGH — drawn from direct Read of Phase 1 code and locked CONTEXT decisions; the view-RLS and `createUser` custom-id issues are the only places where training data is the sole source

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — stable phase built on already-proven Phase 1 surface; re-verify open questions at task time)
