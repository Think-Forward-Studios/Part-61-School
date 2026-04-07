# Architecture Research

**Domain:** Flight school operations platform (scheduling + CAMP maintenance + syllabus + ADS-B)
**Researched:** 2026-04-06
**Confidence:** HIGH (established patterns for Next.js + Expo + Postgres multi-tenant SaaS); MEDIUM for ADS-B-specific realtime fanout

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                    │
│  ┌──────────────────┐        ┌───────────────────────────┐          │
│  │ Next.js Web      │        │ Expo React Native         │          │
│  │ (admin/mech/CFI) │        │ (students/CFI in-aircraft)│          │
│  └────────┬─────────┘        └──────────────┬────────────┘          │
│           │                                  │                       │
│           │  HTTPS (tRPC/HTTP)     WebSocket (realtime)              │
│           │                                  │                       │
├───────────┴──────────────────────────────────┴──────────────────────┤
│                     EDGE / API LAYER                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Next.js App Router (Vercel or Node)                          │    │
│  │  ├─ Route handlers (REST for webhooks, file uploads)         │    │
│  │  ├─ tRPC router (typed RPC for web + mobile)                 │    │
│  │  └─ Auth middleware (tenant resolution, role check)          │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│  ┌──────────────────────────┴──────────────────────────────────┐    │
│  │ Realtime Gateway (Supabase Realtime OR Soketi/Pusher)        │    │
│  │  ├─ Schedule change channels (per-tenant)                    │    │
│  │  └─ ADS-B position channels (per-tenant)                     │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
├─────────────────────────────┴───────────────────────────────────────┤
│                     DOMAIN / SERVICE LAYER                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Scheduling│ │Maintenance│ │ Syllabus │ │ ADS-B   │ │  Auth   │   │
│  │ Service  │ │   (CAMP) │ │  Service │ │ Service │ │ /Tenant │   │
│  └────┬─────┘ └─────┬────┘ └─────┬────┘ └────┬────┘ └────┬────┘   │
│       │             │             │            │            │       │
├───────┴─────────────┴─────────────┴────────────┴────────────┴───────┤
│                     WORKER / JOBS LAYER                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Background jobs (BullMQ/Inngest/Trigger.dev)                 │    │
│  │  ├─ ADS-B poller (every ~5s, fetch OpenSky/ADSBx per tenant) │    │
│  │  ├─ Maintenance prediction (nightly, regression on Hobbs)    │    │
│  │  ├─ AD/SB compliance checker (nightly)                       │    │
│  │  ├─ Notification dispatcher (email/push/SMS)                 │    │
│  │  └─ Document scan processor (thumbnails, OCR optional)       │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
├─────────────────────────────┴───────────────────────────────────────┤
│                        DATA LAYER                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐    │
│  │ Postgres         │  │ Redis            │  │ S3 / R2         │    │
│  │ (Supabase or     │  │ (BullMQ queue,   │  │ (medicals,      │    │
│  │  Neon or RDS)    │  │  ADS-B hot cache,│  │  licenses,      │    │
│  │  + RLS policies  │  │  rate limits)    │  │  logbook scans) │    │
│  └──────────────────┘  └──────────────────┘  └─────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Next.js Web | Admin console, mechanic work orders, CFI gradebook, fleet map | App Router, Server Components, tRPC client |
| Expo Mobile | Student booking, CFI on-ramp lesson debrief, fleet map | Expo SDK 51+, Expo Router, tRPC client, React Native Maps |
| tRPC Router | Typed RPC shared between web + mobile | `packages/api` in monorepo |
| Auth/Tenant Middleware | Resolve tenant from subdomain/JWT claim, inject RLS context | Clerk/Better-Auth + Postgres `SET app.tenant_id` |
| Scheduling Service | Reservation CRUD, conflict detection, maintenance gating | Postgres with exclusion constraint on tstzrange |
| Maintenance (CAMP) Service | Hobbs/tach, components, ADs, work orders, sign-offs | Postgres + append-only audit log |
| Syllabus Service | Template syllabi, lesson instances, stage checks, signatures | Postgres with JSONB for flexible lesson criteria |
| ADS-B Service | Poll feed, normalize, cache, fan out positions | Worker + Redis + Realtime channel |
| Realtime Gateway | Push schedule + ADS-B updates to clients | Supabase Realtime (recommended) or Soketi |
| Workers | ADS-B polling, predictions, notifications, AD checks | Inngest (recommended) or BullMQ |
| Postgres | Single source of truth | Supabase Postgres with RLS |
| Object Storage | Medicals, licenses, insurance scans, logbook PDFs | Cloudflare R2 or S3 with signed URLs |

## Recommended Project Structure

**Monorepo: Turborepo + pnpm workspaces** (Nx is overkill for a 4-app monorepo; Turborepo is the standard for Next.js + Expo shared-type setups in 2026).

```
part-61-school/
├── apps/
│   ├── web/                    # Next.js 15 App Router
│   │   ├── app/
│   │   │   ├── (auth)/         # Login, tenant selection
│   │   │   ├── (app)/          # Authed app shell
│   │   │   │   ├── schedule/
│   │   │   │   ├── maintenance/
│   │   │   │   ├── syllabus/
│   │   │   │   ├── fleet/      # ADS-B map
│   │   │   │   └── admin/
│   │   │   └── api/
│   │   │       ├── trpc/[trpc]/route.ts
│   │   │       ├── webhooks/
│   │   │       └── upload/     # Signed URL issuer
│   │   └── next.config.ts
│   ├── mobile/                 # Expo Router
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   └── (tabs)/
│   │   │       ├── schedule.tsx
│   │   │       ├── lessons.tsx
│   │   │       └── fleet.tsx
│   │   └── app.json
│   └── workers/                # Background jobs (Node or Inngest functions)
│       ├── adsb-poller.ts
│       ├── maintenance-predict.ts
│       └── notifications.ts
├── packages/
│   ├── api/                    # tRPC routers (the contract)
│   │   └── src/routers/
│   │       ├── scheduling.ts
│   │       ├── maintenance.ts
│   │       ├── syllabus.ts
│   │       ├── fleet.ts
│   │       └── admin.ts
│   ├── db/                     # Drizzle schema + migrations
│   │   ├── schema/
│   │   │   ├── tenants.ts
│   │   │   ├── users.ts
│   │   │   ├── aircraft.ts
│   │   │   ├── maintenance.ts
│   │   │   ├── scheduling.ts
│   │   │   ├── syllabus.ts
│   │   │   └── fleet.ts
│   │   └── migrations/
│   ├── domain/                 # Pure business logic (no DB, no HTTP)
│   │   ├── scheduling/         # Conflict detection, maint gating
│   │   ├── maintenance/        # Hobbs rollups, AD matching, prediction
│   │   └── syllabus/           # Progression rules, stage check logic
│   ├── ui/                     # Shared RN+web primitives (tamagui or nativewind)
│   ├── auth/                   # Auth client wrappers
│   └── config/                 # tsconfig, eslint, tailwind presets
└── turbo.json
```

### Structure Rationale

- **`apps/` vs `packages/`:** Apps are deployable; packages are consumed. This is the standard Turborepo split.
- **`packages/api` as the tRPC router:** This is the contract between web, mobile, and workers. One source of typed endpoints, imported by both clients — this is the whole reason for the monorepo.
- **`packages/db` separate from `packages/api`:** Drizzle schema is reused by workers that don't need tRPC. Keeping DB access out of `api` lets jobs import the schema without pulling the HTTP layer.
- **`packages/domain`:** Pure TypeScript business logic with no IO. Makes scheduling conflict rules and maintenance predictions testable without a DB. Critical for safety-sensitive code (scheduling, maint gating).
- **`apps/workers`:** Runs Inngest functions or a BullMQ worker. Kept as its own app so it scales independently of the web app and doesn't inflate Next.js cold starts.

## Architectural Patterns

### Pattern 1: tRPC as the Shared Contract

**What:** Define all API endpoints as tRPC procedures in `packages/api`. Both Next.js server actions and the Expo app consume the same router via `@trpc/client` / `@trpc/react-query`.

**When to use:** Any time you have web + mobile sharing TypeScript. This is the single biggest productivity lever in this stack.

**Trade-offs:** Couples clients to TypeScript (fine here — both are TS). Public third-party integrations still need REST — handle those via Next.js route handlers separately.

```typescript
// packages/api/src/routers/scheduling.ts
export const schedulingRouter = router({
  createReservation: tenantProcedure
    .input(reservationSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx has tenant_id injected from auth middleware
      return ctx.db.transaction(async (tx) => {
        await assertNoConflict(tx, input);          // domain logic
        await assertAircraftAirworthy(tx, input);   // maintenance gate
        return tx.insert(reservations).values(...).returning();
      });
    }),
});
```

### Pattern 2: Multi-Tenancy via Postgres Row-Level Security

**What:** Every tenant-scoped table has a `tenant_id uuid not null` column. RLS policies enforce that queries only see rows matching the current session's tenant. The tRPC context sets `SET LOCAL app.tenant_id = $1` at the start of every request.

**When to use:** Always, from day one. Do not build "single-tenant now, multi-tenant later" — retrofitting tenant_id across a safety-sensitive schema is a rewrite.

**Trade-offs:**
- RLS has ~5-10% query overhead; negligible at this scale.
- You must NEVER bypass it with a service role in application code except in explicit admin migration scripts.
- Schema-per-tenant was considered and rejected: migrations become N-times more expensive, and a Part 61 SaaS will never have enough tenants to justify it. Shared schema + RLS is the 2026 standard.

```sql
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reservations
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Pattern 3: Exclusion Constraint for Scheduling Conflicts

**What:** Use Postgres `EXCLUDE USING gist` with a tstzrange to make double-booking structurally impossible at the DB level.

**When to use:** Any resource-booking system. Application-level conflict checks have race conditions; this eliminates them.

```sql
CREATE TABLE reservations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  aircraft_id uuid NOT NULL,
  period tstzrange NOT NULL,
  status reservation_status NOT NULL DEFAULT 'confirmed',
  EXCLUDE USING gist (
    tenant_id WITH =,
    aircraft_id WITH =,
    period WITH &&
  ) WHERE (status = 'confirmed')
);
```

### Pattern 4: Append-Only Maintenance Ledger

**What:** Maintenance events (Hobbs entries, component installs/removes, work order sign-offs) are immutable rows in an `aircraft_events` table. Derived state (current Hobbs, component TT, next-due) is computed by rollup queries or materialized views.

**When to use:** CAMP systems must have an audit trail for FAA inspection. "Edit Hobbs" is never a thing — you append a correction event.

**Trade-offs:** Slightly more complex reads. Worth it: the audit requirement is non-negotiable, and this pattern makes "what was the state of N12345 on July 3?" a trivial query.

### Pattern 5: Realtime Fanout via Supabase Realtime (Postgres WAL)

**What:** Schedule updates flow through Postgres as normal writes. Supabase Realtime tails the WAL and broadcasts changes to subscribed clients on per-tenant channels. ADS-B positions bypass Postgres (too much write volume) and publish directly to Realtime broadcast channels.

**When to use:** Supabase Realtime is chosen because (a) it's the lowest-ops option matching the Postgres host, (b) it supports RLS-aware subscriptions so tenants cannot see each other's data, and (c) broadcast channels handle ADS-B without bloating the DB.

**Alternatives rejected:**
- **Postgres LISTEN/NOTIFY direct:** Works, but you still need a gateway to fan out to browsers — re-building Realtime.
- **Pusher/Ably:** Paid per-connection; Supabase Realtime is bundled with the DB host.
- **Convex:** Would require abandoning Postgres — the whole reason for this stack is relational integrity for maint/syllabus data.

### Pattern 6: Inngest for Background Jobs

**What:** Inngest functions for ADS-B polling, maintenance prediction, AD checks, notifications. Triggered by cron or by database events.

**When to use:** Inngest over BullMQ because: (a) no Redis to run, (b) built-in retries + observability, (c) step functions fit "poll → normalize → broadcast → cache" cleanly, (d) works locally with one command.

**Trade-offs:** Vendor lock-in on the trigger/observability layer. The function code itself is plain TypeScript, so escape is cheap. If self-hosting is mandatory, fall back to BullMQ + a small Node worker.

### Pattern 7: Domain Logic in Pure Packages

**What:** Scheduling conflict rules, maintenance gating ("is this airplane legal right now?"), Hobbs rollups, and stage check progression rules live in `packages/domain` as pure functions with no DB imports. tRPC handlers compose DB reads + domain calls + DB writes.

**When to use:** Any safety-relevant logic. A unit test that can run in 10ms without a database is the difference between "we have tests" and "we actually run them before every commit."

## Data Flow

### Request Flow (Schedule a Flight)

```
Student taps "Book" (Expo)
    ↓
tRPC call scheduling.createReservation
    ↓
Auth middleware → resolve tenant, role
    ↓
SET LOCAL app.tenant_id (RLS activates)
    ↓
Domain: assertAircraftAirworthy(aircraftId, period)
    ↓ reads maintenance state
Domain: no-overlap check enforced by EXCLUDE constraint
    ↓
INSERT reservation (WAL event)
    ↓
Supabase Realtime fans out to tenant channel
    ↓
All connected clients (web schedule view, CFI mobile) update live
    ↓
Inngest: dispatch notification to instructor
```

### ADS-B Flow

```
Inngest cron (every 5s per tenant)
    ↓
Fetch ADSBexchange/OpenSky for tenant's watch box
    ↓
Match hex codes → school aircraft (by tail→hex map)
    ↓
Write to Redis (hot cache, 60s TTL) — NOT Postgres
    ↓
Broadcast to `tenant:${id}:fleet` Realtime channel
    ↓
Web map + mobile map subscribe and render
    ↓
Nightly rollup: compress positions → flight tracks → Postgres (for history)
```

### Maintenance Prediction Flow

```
Nightly Inngest job
    ↓
For each aircraft: query Hobbs events from last 90 days
    ↓
Linear regression: hours/day
    ↓
For each upcoming inspection: project due date
    ↓
UPDATE aircraft_predictions table
    ↓
Schedule service reads predictions when gating future bookings
```

### Key Data Flows

1. **Reservation → Realtime:** DB write → WAL → Realtime → all tenant clients.
2. **ADS-B tick → Clients:** Poller → Redis + Realtime broadcast → clients (bypasses DB).
3. **Work order sign-off → Airworthiness:** Mechanic signs → append event → recompute next-due → invalidate prediction → scheduling gate updates on next booking attempt.
4. **Lesson completion → Syllabus progress:** CFI signs lesson → append to lesson_events → derived view updates student's stage progress.
5. **Document upload:** Client requests signed URL from route handler → uploads directly to R2 → callback persists metadata row.

## Database Schema (Core Tables)

```
-- Tenancy
tenants(id, name, subdomain, created_at)
users(id, tenant_id, email, name, created_at)  -- synced from Clerk
memberships(user_id, tenant_id, roles[])       -- multi-role: instructor+mechanic etc.

-- Fleet
aircraft(id, tenant_id, tail, make, model, year, hex_icao, status)
components(id, tenant_id, aircraft_id, type, part_number, serial, installed_at, tt_at_install)
aircraft_events(id, tenant_id, aircraft_id, type, payload_jsonb, effective_at, recorded_by, recorded_at)
  -- type: hobbs_reading, tach_reading, inspection_complete, ad_complied, component_install, component_remove, discrepancy_open, discrepancy_close

-- Maintenance
maintenance_items(id, tenant_id, aircraft_id, kind, interval_hours, interval_days, last_done_at, last_done_hobbs)
  -- kind: 100hr, annual, oil_change, transponder_check, etc.
airworthiness_directives(id, tenant_id, ad_number, applies_to_jsonb, recurring, interval)
ad_compliance(id, tenant_id, aircraft_id, ad_id, complied_at, complied_hobbs, method)
work_orders(id, tenant_id, aircraft_id, opened_at, closed_at, status, mechanic_id, signoff_jsonb)
work_order_items(id, work_order_id, description, parts_used_jsonb)
parts_inventory(id, tenant_id, part_number, qty, location)

-- Scheduling
reservations(id, tenant_id, aircraft_id, instructor_id, student_id, period tstzrange, status, purpose, EXCLUDE ...)
reservation_events(id, reservation_id, type, at, by)  -- request, approve, cancel, check_out, check_in

-- Syllabus
syllabus_templates(id, tenant_id NULL for system templates, name, rating, version, structure_jsonb)
enrollments(id, tenant_id, student_id, template_id, started_at, completed_at)
lesson_instances(id, enrollment_id, template_lesson_id, scheduled_at, completed_at, instructor_id, reservation_id)
lesson_grades(id, lesson_instance_id, task_code, grade, notes)
stage_checks(id, enrollment_id, stage, result, examiner_id, signed_at)

-- Documents
documents(id, tenant_id, owner_type, owner_id, kind, r2_key, uploaded_at, expires_at)
  -- kind: medical, license, insurance, logbook_page, ad_paperwork

-- Fleet tracking (history only; live in Redis)
flight_tracks(id, tenant_id, aircraft_id, started_at, ended_at, path_geojson)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 school, ~20 aircraft, ~100 users | Single Supabase instance. Single Inngest account. One Next.js deployment. Total infra cost <$100/mo. |
| 10 schools, ~200 aircraft, ~1000 users | Same architecture. Add connection pooler (PgBouncer/Supavisor — usually included). Move ADS-B polling to dedicated worker dyno. |
| 100+ schools | Partition `aircraft_events` by tenant_id. Consider moving ADS-B history out of Postgres to Timescale or ClickHouse. Add read replica for reporting. |

### Scaling Priorities

1. **First bottleneck: ADS-B position writes.** Never store live positions in Postgres — use Redis + Realtime broadcast. Only persist compressed tracks nightly.
2. **Second bottleneck: `aircraft_events` table growth.** Mitigate with materialized views for "current state" queries and partitioning by tenant once any tenant crosses ~1M events.
3. **Third bottleneck: Realtime channel count.** Supabase Realtime handles thousands of channels; if fanout becomes an issue, shard channels by tenant.

## Anti-Patterns

### Anti-Pattern 1: Storing ADS-B Positions in Postgres Live

**What people do:** INSERT every 5-second position update into a `positions` table.
**Why it's wrong:** 20 aircraft × 0.2 Hz × 86400s = ~350k rows/day/tenant. Kills write throughput, bloats WAL, makes Realtime tail unhappy.
**Do this instead:** Redis for hot state (TTL'd), Realtime broadcast for delivery, nightly compression to `flight_tracks` as a geojson linestring.

### Anti-Pattern 2: "Single-Tenant Now, Multi-Tenant Later"

**What people do:** Skip `tenant_id` columns in v1 to "ship faster."
**Why it's wrong:** Retrofitting tenant_id into reservations, events, and RLS policies across a live safety-sensitive schema is a multi-month project. PROJECT.md explicitly says the partner school is step 1 of a SaaS.
**Do this instead:** Add `tenant_id` and RLS from the first migration. Single-tenant v1 just means one row in `tenants`.

### Anti-Pattern 3: Mutable Hobbs / Editable Maintenance Records

**What people do:** UPDATE aircraft.current_hobbs on every flight.
**Why it's wrong:** No audit trail. FAA inspector asks "what was Hobbs on April 3?" and you have no answer. Also breaks the ability to correct a fat-finger entry without losing history.
**Do this instead:** Append-only `aircraft_events`. Current state is a query, not a column.

### Anti-Pattern 4: Application-Layer Schedule Conflict Detection

**What people do:** `SELECT ... WHERE overlaps ...; if (empty) INSERT ...`
**Why it's wrong:** Race condition. Two concurrent requests both see empty, both insert, airplane is double-booked. In a safety system this is unacceptable.
**Do this instead:** Postgres EXCLUDE constraint. The database rejects the second insert atomically.

### Anti-Pattern 5: Coupling Scheduling Directly to Maintenance State

**What people do:** Scheduling service does a giant join across maintenance tables on every booking request.
**Why it's wrong:** Slow, fragile, and the maintenance prediction logic ends up duplicated in the scheduling path.
**Do this instead:** Maintenance service exposes a single function `isAirworthyAt(aircraftId, instant) → {ok, reasons[]}` in `packages/domain`. Scheduling calls that. One place to change rules.

### Anti-Pattern 6: Mixing Next.js Server Actions and tRPC Inconsistently

**What people do:** Some mutations via Server Actions, some via tRPC, random mix.
**Why it's wrong:** Mobile app can't call Server Actions. You end up with two API surfaces.
**Do this instead:** All business mutations go through tRPC (callable from web + mobile). Server Actions only for form-progressive-enhancement wrappers that internally call tRPC.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Clerk (auth) | JWT with `tenant_id` + `roles` claims injected via Clerk's JWT templates | Chosen over Better-Auth for v1: org/multi-tenant primitives are built in. Better-Auth is the runner-up if self-hosting matters. |
| ADSBexchange / OpenSky | REST poll every 5s from Inngest function | Rate limits: cache in Redis, respect terms. OpenSky is free but rate-limited; ADSBexchange is paid but more reliable. |
| Cloudflare R2 | Signed URLs issued by Next.js route handler | S3-compatible, no egress fees — ideal for document storage. |
| Resend (email) | Inngest function for notification dispatch | Simple, cheap, good DX. |
| Expo Push Notifications | Token registered on app login, sent via EAS | Mobile schedule/maintenance alerts. |
| Supabase Realtime | WebSocket subscription from web + mobile | RLS-aware — cannot cross tenant boundaries. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Web ↔ API | tRPC over HTTP (in-process on Next.js server) | Type-safe, no network cost when colocated. |
| Mobile ↔ API | tRPC over HTTPS (httpBatchLink) | Same router as web. |
| Workers ↔ DB | Drizzle directly (no tRPC) | Workers don't need the HTTP layer. |
| Scheduling ↔ Maintenance | Function call into `packages/domain/maintenance` | Never cross-service HTTP calls — this is a monolith. |
| API ↔ Realtime | Supabase Realtime reads WAL automatically for DB tables; explicit `broadcast()` for ADS-B | Two channel types intentionally. |

## Recommended Build Order

This is the most important output of this research. The build order is driven by (a) what unblocks the next phase and (b) what the partner school can validate first.

### Phase 0: Foundation (weeks 1-2)
1. Turborepo scaffold with apps/web, apps/mobile, packages/{api,db,domain,ui}
2. Supabase project; Drizzle schema for tenants/users/memberships
3. Clerk auth wired to web + mobile; tenant_id claim in JWT
4. tRPC router skeleton with `tenantProcedure` middleware setting RLS context
5. RLS policies on every base table
6. CI: typecheck + migrations + smoke test on every PR

**Why first:** Nothing else works without multi-tenant isolation and a shared type contract. Getting RLS right on day one is an order of magnitude cheaper than later.

### Phase 1: Fleet + Admin (week 3)
1. `aircraft` and `components` tables
2. Admin CRUD for users, aircraft, roles (web only)
3. Append-only `aircraft_events` with Hobbs/tach entry UI
4. Basic "current Hobbs" derived query

**Why next:** Every other pillar references aircraft and users. This is the smallest thing that feels real and proves RLS + tRPC end-to-end.

### Phase 2: Scheduling (weeks 4-5)
1. `reservations` table with EXCLUDE constraint
2. Request → approve workflow (tRPC mutations)
3. Web calendar view; mobile "request flight" screen
4. Supabase Realtime subscription for live schedule updates
5. Simple maint gate stub: `isAirworthy` returns true unless aircraft.status = 'grounded'

**Why before maintenance:** Scheduling is the most visible daily-use feature. Ships real value to the partner school fast. The maint gate is a stub that Phase 3 replaces.

### Phase 3: Maintenance / CAMP (weeks 6-9 — the biggest phase)
1. `maintenance_items` with interval tracking
2. Work orders + mechanic sign-off flow
3. AD table + compliance records
4. Parts inventory
5. Replace Phase 2's airworthiness stub with real `isAirworthyAt()` domain function
6. Nightly prediction job (Inngest) → `aircraft_predictions` table
7. Document upload (R2) for AD paperwork, logbooks

**Why after scheduling:** The domain function contract is what scheduling consumes. Building scheduling first forces you to design the contract before implementing CAMP internals. Also the biggest phase — deserves to come after easier wins validate the architecture.

### Phase 4: Syllabus + Training Records (weeks 10-12)
1. `syllabus_templates` with PPL/IR/Comm seeded from Part 141 structure
2. `enrollments`, `lesson_instances`, `lesson_grades`
3. Link lesson_instance → reservation (completed flight lessons auto-associate)
4. CFI gradebook (web) and lesson debrief (mobile)
5. Stage check workflow with digital signature
6. FAA-exportable training record PDF

**Why after scheduling + maint:** Lessons are scheduled flights — needs reservations. Training records reference aircraft state — needs maint. Building this earlier means re-wiring associations later.

### Phase 5: ADS-B Fleet Map (weeks 13-14)
1. Tail → hex ICAO mapping on aircraft
2. Inngest ADS-B poller (OpenSky first, free)
3. Redis hot cache + Supabase Realtime broadcast
4. Web map (MapLibre GL) + mobile map (react-native-maps or MapLibre Native)
5. Nightly flight track compression → `flight_tracks`

**Why last:** Genuinely independent of the other pillars — can be built anytime after Phase 1 gives us aircraft. Pushed to last because (a) it's the most novel/uncertain piece so we want all contract surface stable before diving in, (b) it's demo-flashy which is good for partner school buy-in at the end, (c) the ADS-B feed choice may need real-world tuning that's easier when nothing else is in flux.

### Why NOT a different order
- **ADS-B first (flashy demo):** Doesn't unblock anything else, and if the feed choice has issues it stalls everything.
- **Syllabus before scheduling:** Lessons are scheduled flights. Syllabus without scheduling is a disconnected CRUD app.
- **Maintenance before scheduling:** CAMP is the biggest, riskiest phase. Burning 4 weeks before any user-facing feature ships means the partner school sees nothing for a month.
- **Parallelizing pillars:** Tempting but the domain coupling (maint → scheduling, scheduling → syllabus) means you'd build against stubs and rework contracts.

## Sources

- Turborepo docs, Next.js + Expo starter: https://turbo.build/repo/docs
- Supabase RLS patterns: https://supabase.com/docs/guides/auth/row-level-security — HIGH confidence, official
- Postgres EXCLUDE constraint for reservations: https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT — HIGH, official
- tRPC + monorepo: https://trpc.io/docs/client/react/server-components — HIGH, official
- Inngest + Next.js: https://www.inngest.com/docs/getting-started/nextjs-quick-start — HIGH, official
- Drizzle + Supabase: https://orm.drizzle.team/docs/get-started-postgresql — HIGH, official
- CAMP system concepts (FAA 14 CFR Part 91 recordkeeping, append-only audit): domain knowledge from PROJECT.md + general FAA guidance — MEDIUM, not from single canonical source
- ADS-B network feeds (OpenSky/ADSBx): owner domain expertise per PROJECT.md — MEDIUM confidence on ops characteristics

---
*Architecture research for: Part 61 flight school operations platform*
*Researched: 2026-04-06*
