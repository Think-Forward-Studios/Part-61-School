# Stack Research — Part 61 School

**Domain:** Flight school ops SaaS (scheduling + CAMP maintenance + 141-style syllabus + ADS-B fleet tracking)
**Researched:** 2026-04-06
**Overall confidence:** MEDIUM-HIGH
  - HIGH for framework/DB/ORM/map choices (verified against multiple 2026 sources)
  - MEDIUM for exact version pins (pnpm/npm registry is ground truth at install time)
  - MEDIUM for ADS-B provider pricing (providers negotiate commercial deals privately; public tier info is partial)

---

## TL;DR (Prescriptive)

- **Monorepo:** pnpm + Turborepo. Apps: `apps/web` (Next.js 15 App Router), `apps/mobile` (Expo SDK 52+). Shared: `packages/db` (Drizzle schema + types), `packages/api` (tRPC routers), `packages/ui` (headless logic; platform-specific primitives).
- **Backend on Next.js:** tRPC over Next.js Route Handlers. No separate Node server in v1.
- **Database:** **Supabase (managed Postgres)** — picked over Neon specifically because the built-in Realtime + RLS + Auth stack covers three hard requirements at once (live ADS-B fan-out, per-school tenancy, role-based access). Postgres 16.
- **ORM:** **Drizzle ORM** — the only ORM with first-class, ergonomic Postgres RLS support, which is non-negotiable for multi-tenant isolation of training records.
- **Auth:** **Supabase Auth** (email/password + magic link) with JWT claims carrying `school_id` + `role`, consumed by RLS policies. Avoid Clerk/Auth.js in v1 to keep one less dependency and get RLS integration for free.
- **Mobile:** Expo SDK 52+ (SDK 53 if available at kickoff), Expo Router, EAS Build.
- **Realtime:** Supabase Realtime (Postgres CDC + broadcast channels). One system for scheduling conflict invalidation AND ADS-B position fan-out.
- **Maps:** **MapLibre GL JS** (web) + **`@maplibre/maplibre-react-native`** (mobile). Tiles from **MapTiler** (commercial, predictable pricing) or **Protomaps** (self-hostable PMTiles).
- **ADS-B provider (v1):** **FlightAware AeroAPI** for school-aircraft-of-interest polling, budgeted ~$100–$500/mo at partner-school scale. See ADS-B section for rationale; this is the hard decision.
- **Background jobs:** **Trigger.dev v3** (managed, no Redis to run). Used for: ADS-B polling loop, maintenance downtime prediction recomputes, AD compliance nightly sweeps, inspection-due notifications.
- **Hosting:** Vercel (web) + Supabase (DB/auth/realtime) + Trigger.dev Cloud (jobs) + EAS (mobile builds). Zero servers to administer in v1.
- **UI:** Tailwind + shadcn/ui on web; NativeWind + Tamagui (or plain RN components) on mobile. Do NOT attempt to share rendered UI components — share types, validators, and tRPC clients only.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| **Next.js** | 15.x (App Router) | Web app + API routes | Server Components + Route Handlers let us host tRPC on the same deploy; Vercel-native; RSC reduces client JS for admin dashboards (which are table-heavy). |
| **React** | 19.x | UI runtime | Required by Next 15; ships with use/Suspense improvements that matter for data-heavy screens. |
| **TypeScript** | 5.6+ | Type safety across web + mobile | Single source of truth for Drizzle-inferred types flowing into tRPC flowing into both clients. Non-negotiable for a safety-relevant domain. |
| **Expo SDK** | 52 (or 53 at project start) | React Native mobile | First-class monorepo support since SDK 52, Expo Router mirrors Next.js file conventions, EAS Build removes native toolchain hell. |
| **Expo Router** | 4.x | Mobile navigation | File-system routing parallel to Next.js App Router — reduces mental model switching. |
| **PostgreSQL** | 16 (Supabase default) | Primary database | Relational model fits maintenance lifing, syllabus prerequisites, and scheduling constraints. RLS = the multi-tenant isolation boundary. PostGIS available if we ever do geofenced airspace queries. |
| **Supabase** | platform (cloud) | Managed Postgres + Auth + Realtime + Storage | Bundles four independent needs (DB, auth, realtime, file storage for logbook scans / sign-off PDFs). Alternative would be gluing 4+ services. |
| **Drizzle ORM** | 0.36+ | Type-safe SQL layer | **Critical:** has first-class `pgPolicy` / RLS primitives. Zero-runtime cost. Fast cold starts on Vercel. Migrations via `drizzle-kit`. |
| **tRPC** | 11.x | End-to-end typed API | Removes the need for OpenAPI + codegen. Web and mobile clients get inferred types directly from server routers. Huge DX win for a small team. |
| **Zod** | 3.23+ | Runtime validation | Shared schemas between tRPC inputs, form validation (React Hook Form), and Drizzle insert checks. |
| **Tailwind CSS** | 4.x | Web styling | shadcn/ui ecosystem; fast iteration for admin-heavy screens. |
| **NativeWind** | 4.x | Mobile styling | Tailwind syntax on React Native; keeps web/mobile class names mentally aligned even though they don't literally share components. |
| **MapLibre GL JS** | 4.x | Web map rendering | Open-source fork of Mapbox GL v1; GPU-driven, handles thousands of moving markers at 60fps; no per-map-load fees. |
| **@maplibre/maplibre-react-native** | 10.x | Mobile map rendering | Same styles/tiles as web, native performance. |
| **Trigger.dev** | v3 | Background jobs & schedules | Managed, TypeScript-native, no Redis. Scheduled tasks (cron) + long-running tasks (ADS-B polling loop, maintenance recompute) in one place. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| **@tanstack/react-query** | 5.x | Client data cache | Comes with tRPC; drives optimistic updates on scheduling. |
| **React Hook Form** | 7.x | Forms | All the CRUD-heavy admin and maintenance forms. |
| **date-fns-tz** | latest | Timezone math | **Critical.** Flight schools span timezones and Hobbs/tach entries are legal records — no `Date` arithmetic without TZ awareness. |
| **Luxon** | alt to date-fns-tz | Timezone math | Use if team prefers Luxon ergonomics. Pick one, not both. |
| **pdf-lib** | 1.17+ | PDF generation (logbook export, 8710, training records) | FAA inspection-ready exports. |
| **@react-pdf/renderer** | 4.x | Alt PDF generation | Use if we want JSX-based PDF templates for training record printouts. |
| **shadcn/ui** | latest (copy-paste, not versioned) | Web component primitives | Tables, dialogs, command palettes for admin UI. |
| **TanStack Table** | 8.x | Data tables | Aircraft lists, squawks, AD compliance grids, student progress matrices. |
| **Recharts** or **Tremor** | latest | Dashboard charts | Fleet utilization, maintenance forecasting. |
| **Resend** | SDK 4.x | Transactional email | Inspection-due alerts, schedule confirmations, password resets (complements Supabase Auth). |
| **Twilio** | SDK 5.x | SMS (optional) | Schedule change alerts to students. Defer to v2 if budget-constrained. |
| **Sentry** | 8.x | Error monitoring | Safety-relevant domain — silent failures are unacceptable. Must be in v1. |
| **PostHog** | latest | Product analytics + session replay | Feature usage for the design-partner feedback loop. |
| **turbo** | 2.x | Monorepo task runner | Parallelizes build/lint/test across apps/packages. |

### Development Tools

| Tool | Purpose | Notes |
|---|---|---|
| **pnpm** | Package manager | Required for clean Expo monorepo resolution; disk-efficient; strict by default. |
| **Turborepo** | Build orchestration | Remote caching on Vercel for CI speed. |
| **Biome** or **ESLint + Prettier** | Lint/format | Biome is faster and one tool; ESLint is more ecosystem-mature. Pick Biome unless team has strong ESLint config already. |
| **Vitest** | Unit tests | Faster than Jest for TS codebases; Drizzle schema tests, maintenance-math tests. |
| **Playwright** | Web E2E | Scheduling conflict flows, role-gated routes. |
| **Maestro** | Mobile E2E | Lightweight RN E2E, better than Detox in 2026. |
| **drizzle-kit** | Migrations | `drizzle-kit generate` + `drizzle-kit migrate`. |

---

## ADS-B Provider Decision (the hard one)

This is a hard external dependency and cost driver. Public pricing is incomplete for all three; the following reflects publicly-documented tiers plus community reports. **All three require written commercial confirmation before shipping to a paying school.**

| Provider | Data quality | Commercial license | Rough cost (school-scale) | Viable for v1? |
|---|---|---|---|---|
| **OpenSky Network** | Good (crowdsourced + network coverage) | **Commercial use requires a negotiated license** — no self-serve commercial tier. As of March 2026, API auth migrated to OAuth2 client credentials. | Unknown (negotiated). Free tier is research/non-profit only. | **NO** — can't ship a paid SaaS on the free tier; license timeline unpredictable. |
| **ADSBexchange** | Excellent (unfiltered, includes military / LADD) | RapidAPI "API Lite" is personal/non-commercial only. Commercial needs **Enterprise API** (negotiated). | RapidAPI tier ~$10/mo for 10k req is non-commercial. Enterprise deals reportedly start in the several-hundred to low-thousands $/mo range (community-reported, verify). | **MAYBE** — only if we commit to an Enterprise contract. Best data quality of the three. |
| **FlightAware AeroAPI** | Excellent (FlightAware's own fusion of ADS-B + radar + schedules) | Self-serve commercial license; per-query billing. Pricing starts around **$0.002/query** (lowest published tier; minimums and tier step-ups apply). | At 5-second polling for ~10 school aircraft over a 10-hour operating day: ~7,200 queries/day = ~216k queries/mo. At $0.002 = **~$432/mo** before any multi-page costs. Fewer polls or only-when-airborne polling brings it toward ~$100–200/mo. | **YES** — self-serve license, predictable per-query billing, documented public pricing. **Recommended for v1.** |

### Recommendation: FlightAware AeroAPI for v1

**Why:**
1. **Self-serve commercial license.** No negotiation blocking launch.
2. **Public pricing.** We can model costs before building.
3. **Data fusion.** AeroAPI is not just raw ADS-B — it also has flight-plan data and arrival/departure info, which is useful for syllabus correlation (did this flight actually happen, when did it land).
4. **Acceptable latency.** ~5s target matches what AeroAPI supports on targeted queries.

**Cost-control tactics (must implement day 1):**
- Only poll aircraft whose schedule status is "checked out" or "flight in progress."
- Poll idle aircraft (on-ground, no active reservation) on a 60-second cadence or not at all.
- Cache responses in Supabase for 4–5 seconds; multiple clients read from cache, not the API.
- Budget alarm in Trigger.dev if daily query count exceeds threshold.

**Upgrade paths (later milestones, not v1):**
- ADSBexchange Enterprise for broader traffic context around school aircraft (surrounding traffic on the map, not just the fleet).
- Local dump1090/PiAware receiver at the home airport — explicitly out of scope per PROJECT.md, but a v2 cost-cut opportunity.

**Confidence:** MEDIUM. All pricing requires a direct quote from FlightAware before production commitment. The recommendation is robust to price variance because it's the only provider with a self-serve commercial path.

**Abstraction requirement:** Build an `AdsbProvider` interface from day 1 so we can swap providers without rewriting the fleet-tracking feature. Non-negotiable.

---

## Multi-Tenancy Approach

**Row-Level Security in Postgres, keyed by `school_id`.** Single database, single schema, one tenant column on every tenant-scoped table.

**Why RLS over schema-per-tenant or DB-per-tenant:**
- v1 ships single-tenant (one partner school) but needs to be ready for a second school without a migration — RLS gives us that for free.
- Schema-per-tenant makes cross-tenant analytics (for us as operators) painful and explodes migration complexity.
- DB-per-tenant is wildly over-engineered for <50 tenants.

**Implementation:**
- Every tenant-scoped table has `school_id uuid not null references schools(id)`.
- Supabase Auth JWT carries a custom claim `school_id` set at signup/invite.
- Drizzle `pgPolicy` on each table: `using (school_id = (auth.jwt() ->> 'school_id')::uuid)`.
- Role claim in JWT (`student` / `instructor` / `mechanic` / `admin`) additionally gates write policies (e.g., only `mechanic` and `admin` can UPDATE `maintenance_work_orders`).
- **Test harness:** a Vitest suite that connects as each role and asserts cross-tenant reads fail. Run on every PR.

**Non-tenant tables:** `schools`, `adsb_provider_cache`, `audit_log` (cross-tenant in the operator view, but RLS-filtered in the school view).

**Confidence:** HIGH. This is the standard, battle-tested pattern on Supabase + Drizzle in 2026.

---

## Alternatives Considered

| Recommended | Alternative | When the Alternative Wins |
|---|---|---|
| Supabase (DB+Auth+Realtime) | Neon + Clerk + Ably | If you want the "best of breed per layer" model and are willing to manage 3 billing relationships. Neon's branching is nicer for dev, but we lose the integrated realtime+RLS story, which is the whole reason we picked Supabase. |
| Drizzle ORM | Prisma | If the team is already Prisma-fluent and multi-tenant RLS support is acceptable via escape-hatch raw SQL. Drizzle's `pgPolicy` is materially better DX here. Prisma 7 closed the perf gap, but RLS ergonomics still favor Drizzle. |
| tRPC | GraphQL (Apollo/Yoga) | If a third-party will consume the API or we need persisted queries. For a closed web+mobile client pair, tRPC is strictly simpler. |
| FlightAware AeroAPI | ADSBexchange Enterprise | If we want unfiltered traffic (including LADD) and are willing to negotiate a commercial contract. Consider for v2. |
| MapLibre GL | Mapbox GL JS | If we need Mapbox-proprietary features (3D buildings, specific navigation SDK). For fleet dots on a basemap, MapLibre is strictly sufficient and free. |
| MapLibre | Google Maps Platform | If the partner school specifically expects a Google Maps look. Google's per-load pricing is hostile for a 5-second-refresh fleet tracker. |
| Trigger.dev | BullMQ + Redis (Upstash) | If you want full self-hosted control. BullMQ is excellent but adds Redis as a dependency and requires a worker process — friction we don't want for a small team on Vercel. |
| Trigger.dev | Inngest | Inngest is a credible alternative with a similar model. Pick Trigger.dev for longer-running tasks (ADS-B polling loop); pick Inngest if you prefer its step-function DX. Either would work. |
| Expo + Next.js separate apps | Solito / Expo Router for Web | If you want literally one codebase for web and mobile UI. Rejected because the web UI is admin-dashboard-heavy (tables, keyboard shortcuts, multi-pane) and forcing it through RN primitives is a known trap. Share the API layer, not the views. |
| Supabase Auth | Clerk | Clerk is nicer for B2C auth UIs. Supabase Auth wins here because its JWT integrates directly with our RLS policies with zero glue code. |
| Resend | Postmark / SendGrid | If you need advanced deliverability features. Resend has the best DX in 2026 and plenty of deliverability for a single school. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| **OpenSky free tier in production** | Non-commercial license; cannot ship a paid SaaS on it. | FlightAware AeroAPI. |
| **ADSBexchange RapidAPI "API Lite" in production** | Explicitly personal/non-commercial. | ADSBexchange Enterprise (negotiated) or AeroAPI. |
| **Sharing React components between web and mobile** (react-native-web for admin UI) | The admin/maintenance UI is table-heavy and keyboard-driven; forcing it through RN primitives fights the platform. Share *logic*, not *views*. | Share `packages/api` (tRPC), `packages/db` (types), `packages/validators` (Zod). Build views per-platform. |
| **Prisma for multi-tenant RLS** | Works, but RLS needs raw-SQL escape hatches; you lose type safety on the exact thing that keeps tenants separated. | Drizzle with `pgPolicy`. |
| **Vercel Cron for ADS-B polling** | 60s minimum interval, 10s–60s execution cap depending on plan, not designed for long-lived loops. | Trigger.dev scheduled tasks or long-running tasks. |
| **Raw `Date` / `Date.now()` for Hobbs / flight time math** | Training and maintenance records are legal — off-by-one-hour errors across DST are not acceptable. | `date-fns-tz` or Luxon; store all timestamps as `timestamptz` in Postgres; store the airport TZ on the aircraft/school record. |
| **SQLite / Turso for primary DB** | We need RLS, mature realtime CDC, and multi-tenant isolation. | Postgres. |
| **Firebase** | Document model is the wrong shape for maintenance lifing, syllabus prerequisites, and conflict-checked scheduling. | Postgres + Drizzle. |
| **Mapbox GL JS (the new, post-v1 license)** | Proprietary license since v2; you're paying per map load for a 5-second refresh fleet map. | MapLibre GL JS. |
| **Storing scanned logbook PDFs in Postgres bytea** | Bloats the DB, kills backup speed. | Supabase Storage (S3-compatible). |
| **`react-native-maps` with Google provider** for the fleet map | Per-load pricing and Google TOS restrictions on rebroadcast of tracking data. | MapLibre React Native. |
| **Amending auth logic into tRPC procedures ad-hoc** | Will drift from RLS policies, causing auth bugs or worse, silent tenant leaks. | Single source of truth: RLS at the DB; tRPC procedures only check role/shape, never tenant. |

---

## Stack Patterns by Variant

**If the partner school asks for Google SSO (likely):**
- Supabase Auth supports Google OAuth out of the box; add it as a provider. No architectural change.

**If ADS-B costs exceed budget at pilot:**
- Drop polling frequency for on-ground aircraft to 0 (status from scheduling system, not ADS-B).
- Only render "surrounding traffic" on-demand (user taps the map), not as a continuous feed.
- If still too high: switch `AdsbProvider` implementation to a dump1090 receiver at the home airport. This is the v2 path and the reason for the provider abstraction on day 1.

**If we need offline mobile for pre-flight on the ramp:**
- Expo SQLite + a sync layer (Supabase's offline kit, WatermelonDB, or custom change-log sync). Defer to v2; flag in PITFALLS.

**If Vercel costs become an issue at scale:**
- Next.js on a Node host (Railway, Fly) is fine; the app is not deeply Vercel-coupled except for ISR and preview envs. Supabase + Trigger.dev are host-agnostic.

---

## Installation

```bash
# Monorepo bootstrap
pnpm dlx create-turbo@latest part-61-school
cd part-61-school

# Web app
cd apps/web
pnpm add next@15 react@19 react-dom@19
pnpm add @trpc/server @trpc/client @trpc/react-query @trpc/next
pnpm add @tanstack/react-query zod
pnpm add drizzle-orm postgres
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add maplibre-gl
pnpm add tailwindcss @tailwindcss/postcss
pnpm add react-hook-form @hookform/resolvers
pnpm add @tanstack/react-table recharts
pnpm add date-fns date-fns-tz
pnpm add pdf-lib
pnpm add @sentry/nextjs
pnpm add resend
pnpm add -D drizzle-kit @types/node typescript vitest @playwright/test

# Mobile app
cd ../mobile
npx create-expo-app@latest . --template default
pnpm add expo-router
pnpm add @supabase/supabase-js
pnpm add @trpc/client @trpc/react-query @tanstack/react-query
pnpm add @maplibre/maplibre-react-native
pnpm add nativewind tailwindcss
pnpm add react-hook-form @hookform/resolvers zod
pnpm add @sentry/react-native

# Shared packages
# packages/db: drizzle-orm, drizzle-kit, zod
# packages/api: @trpc/server, zod, references packages/db
# packages/validators: zod schemas shared everywhere

# Jobs
pnpm add @trigger.dev/sdk
pnpm dlx trigger.dev@latest init
```

Exact versions should be pinned at `pnpm install` time; the above installs latest on each line.

---

## Version Compatibility Notes

| Concern | Notes |
|---|---|
| **React 19 + Next.js 15** | Required pairing. Some third-party libs still ship React 18 peer deps — use `pnpm.overrides` to force. |
| **Expo SDK 52+ monorepo** | SDK 52 simplified Metro monorepo config significantly; don't try this on SDK <=51 without reading the old monorepo guide. |
| **Drizzle + Supabase RLS** | Requires Drizzle 0.36+ for `pgPolicy` helpers. Older Drizzle works but forces raw SQL for policies. |
| **tRPC 11 + React Query 5** | Use `@trpc/react-query` v11. Do not mix with v10 docs — API changed. |
| **MapLibre GL JS 4.x + React Native 10.x** | Both track the same Mapbox GL v1 fork; style JSON is cross-compatible so the same basemap JSON works on web and mobile. |
| **Next.js Route Handlers + Trigger.dev** | Trigger.dev webhooks land on a Route Handler; make sure it's in the Node runtime, not Edge. |
| **Supabase Realtime + RLS** | Realtime respects RLS but only if you enable it per-publication. Easy to forget; add a CI check. |

---

## Sources

Confidence tags: [H]=HIGH, [M]=MEDIUM, [L]=LOW.

**Framework & monorepo**
- [M] Expo monorepo guide — https://docs.expo.dev/guides/monorepos/
- [M] Expo + Next.js monorepo examples — https://github.com/tao101/nextjs15-expo-monorepo , https://github.com/rphlmr/expo-nextjs-monorepo
- [M] Expo "going universal" blog — https://expo.dev/blog/from-a-brownfield-react-native-and-next-js-stack-to-one-expo-app

**ORM & multi-tenancy**
- [M] Drizzle vs Prisma 2026 (multiple analyses) — https://www.bytebase.com/blog/drizzle-vs-prisma/ , https://makerkit.dev/blog/tutorials/drizzle-vs-prisma , https://dev.to/pockit_tools/drizzle-orm-vs-prisma-in-2026-the-honest-comparison-nobody-is-making-3n6g
- [M] Prisma's own Drizzle comparison — https://www.prisma.io/docs/orm/more/comparisons/prisma-and-drizzle

**Database platform**
- [M] Supabase vs Neon 2026 — https://www.getautonoma.com/blog/supabase-vs-neon , https://www.leanware.co/insights/supabase-vs-neon , https://www.bytebase.com/blog/neon-vs-supabase/
- [M] Neon acquired by Databricks (2025) — cited in multiple comparisons above; long-term stewardship signal.

**Maps**
- [M] Mapbox GL vs MapLibre vs Leaflet 2026 — https://www.pkgpulse.com/blog/mapbox-vs-leaflet-vs-maplibre-interactive-maps-2026
- [M] React Native map options 2026 — https://www.pkgpulse.com/blog/react-native-maps-vs-mapbox-rn-vs-maplibre-rn-mobile-2026
- [H] MapLibre project site — https://maplibre.org/
- [M] Mapbox license change context — https://www.geoapify.com/mapbox-gl-new-license-and-6-free-alternatives/

**ADS-B providers**
- [H] OpenSky commercial terms FAQ — https://opensky-network.org/about/faq
- [H] OpenSky terms of use — https://opensky-network.org/about/terms-of-use
- [H] OpenSky API docs — https://openskynetwork.github.io/opensky-api/rest.html  (note: OAuth2 migration as of March 2026)
- [H] ADSBexchange API Lite (personal/non-commercial) — https://www.adsbexchange.com/api-lite/
- [H] ADSBexchange Enterprise API — https://www.adsbexchange.com/products/enterprise-api/
- [M] ADSBexchange on RapidAPI — https://rapidapi.com/adsbx/api/adsbexchange-com1/pricing
- [H] FlightAware AeroAPI product page — https://www.flightaware.com/commercial/aeroapi/
- [H] FlightAware AeroAPI developer portal — https://www.flightaware.com/aeroapi/portal
- [M] FlightAware AeroAPI quote request (confirms self-serve + quote-based paths coexist) — https://support.flightaware.com/hc/en-us/articles/33213921155351
- [M] FlightAware AeroAPI community on per-query cost estimation — https://discussions.flightaware.com/t/estimating-the-cost-of-execution-of-an-aeroapi-call-apriori/84408

**Background jobs**
- [H] BullMQ site — https://bullmq.io/
- [M] Next.js background jobs comparison — https://www.hashbuilds.com/articles/next-js-background-jobs-inngest-vs-trigger-dev-vs-vercel-cron
- [M] Trigger.dev vs BullMQ — https://trigger.dev/vs/bullmq

---

## Open Questions for Roadmap / Later Phases

1. **Actual AeroAPI quote for partner school usage pattern.** Needs a real conversation with FlightAware sales before we commit architecturally. Budget range (~$100–$500/mo) is an estimate, not a quote.
2. **Surrounding-traffic display (non-fleet aircraft on the map).** If we want this, AeroAPI's "aircraft in a bounding box" endpoint is expensive. May push us toward ADSBexchange Enterprise for v2.
3. **Digital logbook legal sufficiency.** FAA accepts electronic records, but specific Part 61/43 record formats (8710-1, 337s, AD compliance) need a compliance review before we commit to a PDF export schema. Flag as a research task for the maintenance phase.
4. **Offline mode for mobile pre-flight.** Not in v1 scope, but architectural choices (Drizzle-on-SQLite, sync layer) need to be made before mobile ships if we want a clean path to it.
5. **Audit log retention / immutability.** Safety-relevant domain implies WORM-ish audit records. Decide: Postgres append-only table with triggers, or external (e.g., S3 object-lock). Flag for architecture phase.

---
*Stack research for: FAA Part 61 flight school ops platform*
*Researched: 2026-04-06*
