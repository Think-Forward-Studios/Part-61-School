# Project Research Summary

**Project:** Part 61 School
**Domain:** Flight school ops SaaS (scheduling + CAMP maintenance + 141-style syllabus + ADS-B fleet tracking)
**Researched:** 2026-04-06
**Confidence:** MEDIUM-HIGH

## Executive Summary

Part 61 School is a multi-pillar flight school operations platform that unifies four domains — scheduling, CAMP-grade maintenance, 141-style syllabus/training records, and live ADS-B fleet visibility — into one role-gated web + mobile app. Research confirms that no incumbent (Flight Schedule Pro, Flight Circle, TalonETA, FlightLogger) covers all four pillars; that three-way gap (real maintenance + 141-grade records + ADS-B) IS the product thesis and the partner-school wedge.

The prescriptive stack is a pnpm + Turborepo monorepo with Next.js 15 (web) and Expo SDK 52+ (mobile) sharing a tRPC API layer over Supabase Postgres. Drizzle ORM is chosen specifically for first-class RLS primitives, which are non-negotiable for the multi-tenant-ready-but-single-tenant-deployed architecture mandated by PROJECT.md. Supabase Auth + Realtime + Storage consolidate auth, live schedule fanout, and document vault needs. ADS-B ingestion uses FlightAware AeroAPI via Trigger.dev scheduled jobs, behind a provider-abstraction interface so the feed can be swapped later.

The dominant risks are regulatory/safety, not technical: (1) any use of "Part 141" branding risks FAA enforcement against the partner school, (2) mutable training records or Hobbs columns create FAA-inspection failures and liability in post-incident investigations, (3) Hobbs-vs-tach confusion silently violates §91.409, (4) ADS-B feed TOS violations can blank the map mid-flight, and (5) scheduling concurrency bugs double-book safety-critical resources. Each of these must be designed in from day one — none can be retrofitted after the partner school goes live.

## Key Findings

### Recommended Stack

Single-language (TypeScript) monorepo sharing types, validators, and tRPC routers between a Next.js 15 web app and an Expo mobile app. Postgres (Supabase) with Drizzle ORM and Row-Level Security is the tenant isolation boundary. Trigger.dev handles ADS-B polling and nightly recomputes without a Redis dependency.

**Core technologies:**
- **Next.js 15 + React 19** — web + Route Handlers host tRPC
- **Expo SDK 52+ with Expo Router** — mobile, file-routing mirrors App Router
- **Supabase (Postgres 16 + Auth + Realtime + Storage)** — bundles four needs; JWT claims feed RLS directly
- **Drizzle ORM 0.36+** — first-class `pgPolicy` RLS primitives (the reason over Prisma)
- **tRPC 11 + Zod** — end-to-end typed API across web + mobile
- **MapLibre GL JS / @maplibre/maplibre-react-native** — shared style JSON, GPU-driven, no per-load fees
- **FlightAware AeroAPI** — only ADS-B provider with self-serve commercial licensing (~$100–$500/mo at school scale); must sit behind an `AdsbProvider` interface from day 1
- **Trigger.dev v3** — managed background jobs for ADS-B polling and nightly maintenance recomputes
- **Sentry + PostHog** — non-negotiable for a safety-relevant domain

See STACK.md for the full matrix and "What NOT to Use" list.

### Expected Features

No single incumbent unifies (a) maintenance-aware scheduling, (b) CAMP-grade maintenance, (c) 141-structured training records, (d) live ADS-B. That gap is the product.

**Must have (table stakes — partner school won't adopt without these):**
- Auth + RBAC (student/instructor/mechanic/admin) with multi-tenant schema from day 1
- Aircraft CRUD with Hobbs/tach, document vault, grounded flag
- Maintenance intervals (100hr, annual, ELT, transponder, ADs) with auto-ground on expiry
- Squawk manager (report → review → ground-or-defer → RTS sign-off)
- Scheduler: request/approve, no double-booking, dispatch block on grounded aircraft or non-current student
- PPL 141-style TCO syllabus template (cloneable, versioned) with lesson grading and stage checks
- Endorsement library + 141.101-shaped chronological training record + IACRA hours export with 61.51(e) buckets
- ADS-B fleet-only live map (~5s update)
- Audit trail on scheduling/maintenance/grading writes
- Mobile parity for: schedule view, booking, squawk, dispatch, grading

**Should have (differentiators — where the product wins):**
- Maintenance-aware scheduler as ONE query (not two systems bolted together)
- 141-shaped records on a 61 school (the product-in-one-sentence)
- Live ADS-B fleet map integrated with dispatch — no competitor does this
- Dispatch checklist that hard-blocks illegal flights with FAR citation
- Per-aircraft "next grounding event" countdown

**Defer (v1.x / v2+):**
- Downtime prediction (needs 3–6 months of Hobbs history)
- Surrounding traffic overlay, flight replay, geofence alerts
- IR and Commercial syllabus templates (PPL validates the shape first)
- Push notifications, offline mobile grading, post-flight auto-draft from ADS-B
- Billing/Stripe, weather, W&B, local ADS-B receivers — all explicit PROJECT.md out-of-scope

**Anti-features (deliberately avoid):**
- Integrated weather / W&B / flight planning (liability + ForeFlight exists)
- AI-authored grades (FAA records must be instructor-authored)
- Replacing the paper logbook (FAA still expects one at checkride)
- Per-user pricing (market complaint; plan per-aircraft)

### Architecture Approach

Modular monolith in a Turborepo: `apps/{web,mobile,workers}` + `packages/{api,db,domain,ui}`. Domain logic (scheduling conflict rules, maintenance gating, Hobbs rollups) lives in pure functions in `packages/domain` with no DB imports, so safety-critical rules are unit-testable in milliseconds. All mutations go through tRPC (callable from web + mobile); Server Actions are reserved for progressive-enhancement wrappers.

**Major components:**
1. **Next.js Web + Expo Mobile** — clients sharing the tRPC router
2. **tRPC API layer with `tenantProcedure`** — auth middleware resolves tenant + sets RLS context
3. **Scheduling Service** — Postgres `EXCLUDE USING gist` on `tstzrange` makes double-booking structurally impossible; separate exclusions for aircraft, instructor, student
4. **Maintenance (CAMP) Service** — append-only `aircraft_events`; current state is a query, never a column; exposes `isAirworthyAt(aircraftId, instant)` to the scheduler
5. **Syllabus Service** — versioned templates; enrollments bind to a syllabus *version*, not the template
6. **ADS-B Service** — Trigger.dev poller → Redis hot cache → Supabase Realtime broadcast (bypasses Postgres on writes); nightly compression to `flight_tracks`
7. **Supabase Realtime gateway** — WAL-tailed for DB changes (schedule), broadcast channels for ADS-B; RLS-aware subscriptions
8. **Object storage (Supabase Storage / R2)** — medicals, licenses, logbook PDFs, AD paperwork via signed URLs

### Critical Pitfalls

1. **"Part 141" terminology anywhere in the UI, templates, or exported PDFs** — risks FAA enforcement against the partner school. Fix: terminology contract + CI grep lint in Phase 1; every export carries "Training conducted under 14 CFR Part 61. Not an FAA-approved Part 141 course." footer.
2. **Mutable training records / hard deletes of students / instructors** — violates §61.189 3-year retention and kills FAA inspection readiness. Fix: append-only event model, soft-delete with 7-year floor, "Student Training File" PDF export built early as the inspector-facing artifact.
3. **Single `hours` column mixing Hobbs, tach, airframe, engine time** — silently violates §91.409 and grounds the fleet. Fix: independent time series per clock; every inspection/AD/component declares which clock it's measured against; monotonicity + plausibility checks.
4. **Unqualified maintenance sign-off (no A&P/IA authority check)** — forged return-to-service entries invalidate airworthiness. Fix: mechanic records store cert type + number + scope; work-order types declare minimum required authority; sign-offs snapshot cert info at time of signature.
5. **Scheduling double-booking under concurrency + timezone bugs** — naive timestamp columns and app-level conflict checks race. Fix: `tstzrange` + `EXCLUDE USING gist` at the DB; one exclusion per resource type (aircraft, instructor, student); UTC storage; test with Phoenix (no DST) + Indianapolis fixtures.
6. **ADS-B feed TOS violations** — OpenSky free + ADSBx RapidAPI are non-commercial only; commercial deployment on them triggers C&D and key revocation mid-flight. Fix: AeroAPI self-serve commercial license from day 1, behind a provider abstraction interface.
7. **AD compliance as free-text notes** — compliance dashboard falsely shows "green." Fix: ADs as first-class entities with applicability, recurrence, next-due calculation, signing mechanic cert number, and an explicit "ADs on file: N" count on every dashboard.

See PITFALLS.md for the full list including moderate and minor pitfalls.

## Implications for Roadmap

Research strongly supports a phased build ordered by domain coupling: foundation → fleet primitives → scheduling → maintenance → syllabus → ADS-B. This sequence ships user-visible value fast, defers the biggest (maintenance) phase until the contract surface is stable, and saves the flashy-but-independent ADS-B work for last so the feed choice can be tuned without blocking everything else.

### Phase 1: Foundation + Multi-Tenant + Terminology Contract
**Rationale:** RLS, tRPC context, and the "no Part 141" terminology contract must be in place before any user-facing feature. Retrofitting tenant_id or rewriting UI strings later is an order of magnitude more expensive. Safety domain means CI lint and audit scaffolding ship now, not later.
**Delivers:** Turborepo scaffold, Drizzle schema for tenants/users/memberships with RLS policies, Supabase Auth with `school_id` + `role` JWT claims, tRPC `tenantProcedure` middleware, banned-terminology CI check, Sentry wired end-to-end, cross-tenant RLS test harness.
**Addresses:** Auth + RBAC + multi-tenant schema (FEATURES P1); audit trail scaffolding.
**Avoids:** Pitfall 1 (Part 141 terminology), Pitfall 2 retrofitting immutability.

### Phase 2: Fleet Primitives + Admin CRUD
**Rationale:** Every downstream pillar references aircraft and users. Smallest real thing that proves RLS + tRPC end-to-end.
**Delivers:** `aircraft` + `components` + append-only `aircraft_events` with multi-clock Hobbs/tach/airframe/engine series, admin CRUD for users/aircraft/roles, document vault, derived "current state" queries.
**Addresses:** Aircraft CRUD + Hobbs/tach (P1), admin CRUD (P1), document vault (P1).
**Avoids:** Pitfall 3 (Hobbs/tach confusion) by establishing multi-clock model before any inspection logic depends on it.

### Phase 3: Scheduling + Maintenance-Aware Dispatch (stubbed)
**Rationale:** Most visible daily-use feature; ships real partner-school value fast. Stubs `isAirworthyAt()` so Phase 4 replaces the stub without changing the scheduler. Designs the domain function contract before CAMP is implemented.
**Delivers:** `reservations` with `EXCLUDE USING gist` on `tstzrange` (per-aircraft, per-instructor, per-student), request/approve workflow, calendar web view + mobile request screen, Supabase Realtime subscription for live schedule updates, basic cancellation, stubbed airworthiness gate.
**Addresses:** Scheduler + double-booking prevention + dispatch block (P1).
**Avoids:** Pitfall 6 (concurrency/timezone) via DB-level constraint and UTC-everywhere; Anti-pattern 4 (app-layer conflict detection).

### Phase 4: CAMP Maintenance (the biggest phase)
**Rationale:** Biggest, riskiest phase — comes after Phase 3 forces the `isAirworthyAt()` contract to exist. Replaces the Phase 3 stub with real rules. Partner school already has visible value from scheduling, so a multi-week maintenance build doesn't feel like a dark period.
**Delivers:** `maintenance_items` with interval tracking (declared against specific clocks), work orders with A&P/IA authority enforcement, AD table + compliance records as first-class entities (not notes), squawk manager, parts inventory, auto-ground on expiry, document upload for AD paperwork, canned 30-day maintenance-due report, per-aircraft "next grounding event" countdown.
**Addresses:** Maintenance intervals + auto-ground (P1), squawk manager (P1), audit trail (P1).
**Avoids:** Pitfalls 3, 4, 5, 7 — all maintenance-domain pitfalls concentrate here.

### Phase 5: Syllabus + Training Records + IACRA Export
**Rationale:** Lessons are scheduled flights — needs reservations. Records reference aircraft state — needs maintenance. Building earlier means re-wiring associations later. Training records are the inspector-facing artifact.
**Delivers:** Versioned `syllabus_templates` seeded with ONE PPL 141-style TCO, `enrollments` bound to a template version, `lesson_instances` linked to reservations, `lesson_grades` (1–4 scale), stage check workflow with digital signature, endorsement library with expiry → dispatch gating, 141.101-shaped chronological training record PDF export, IACRA-friendly hours export with 61.51(e) buckets.
**Addresses:** Syllabus + grading + stage checks (P1), endorsements (P1), 141.101 records (P1), IACRA export (P1).
**Avoids:** Pitfall 2 (immutable training records and on-demand export artifact built early).

### Phase 6: ADS-B Fleet Map
**Rationale:** Genuinely independent of the other pillars. Saved for last so the API contract surface is stable before the most novel/uncertain external dependency; demo-flashy for partner-school buy-in at the end; feed tuning happens when nothing else is in flux.
**Delivers:** Tail → hex ICAO mapping, `AdsbProvider` interface + FlightAware AeroAPI implementation, Trigger.dev poller (on-ground cadence + in-flight cadence), Redis hot cache, Supabase Realtime broadcast channel, web MapLibre GL map + mobile MapLibre Native map, "last seen" indicator, nightly track compression to `flight_tracks`, budget alarm on daily query count.
**Addresses:** ADS-B fleet-only live map (P1), fleet utilization reporting.
**Avoids:** Pitfall 7 (TOS violations) by using self-serve commercial AeroAPI from day 1 behind an abstraction.

### Phase 7: Hardening, Reports, Mobile Polish, Beta
**Rationale:** Cross-cutting polish that pulls from every phase: email notifications, canned admin reports, mobile parity gap-closing, end-to-end audit trail verification, CFI review of all templates + exports before beta with the partner school.
**Delivers:** Resend email notifications, canned reports (fleet utilization, maintenance-due, student progress, instructor load), mobile parity for dispatch/squawks/grading, Playwright + Maestro E2E coverage of safety-critical flows, CFI-reviewed export templates, partner school onboarding runbook.

### Phase Ordering Rationale

- **Foundation-first is non-optional** because RLS, terminology, and audit scaffolding are rewrites if deferred (Pitfalls 1, 2).
- **Fleet before scheduling** because the multi-clock Hobbs/tach model (Pitfall 3) must exist before maintenance depends on it, and scheduling needs aircraft records.
- **Scheduling before maintenance** ships visible value fast and forces the `isAirworthyAt()` contract before CAMP internals exist — this is the architectural hinge.
- **Maintenance before syllabus** because training records reference aircraft state, and the biggest/riskiest phase should sit on a proven contract surface.
- **Syllabus before ADS-B** because records are the compliance pillar — must be solid before demo-flashy features; ADS-B is independent and can slip without blocking anything.
- **Parallelization rejected** — domain coupling (maintenance ↔ scheduling ↔ syllabus) means parallel tracks would build against stubs and rework contracts.

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 4 (CAMP Maintenance):** AD compliance model, A&P/IA authority rules, digital logbook legal sufficiency for FAA inspection — needs a CFI + A&P review, not just documentation research.
- **Phase 5 (Syllabus + IACRA):** Exact 61.51(e) category/class breakdown mapping and 141.101-compatible export format need regulatory primary sources and ideally a real TCO from the partner school.
- **Phase 6 (ADS-B):** FlightAware AeroAPI actual quote for the partner school's polling pattern, re-display/attribution requirements in their current commercial TOS, and the `AdsbProvider` interface shape need confirmation before committing.

Phases with standard patterns (can skip deep research):
- **Phase 1 (Foundation):** Supabase + Drizzle + tRPC + RLS is the documented 2026 standard path.
- **Phase 2 (Fleet):** Straight CRUD + append-only event log.
- **Phase 3 (Scheduling):** `EXCLUDE USING gist` on `tstzrange` is textbook Postgres.
- **Phase 7 (Hardening):** Standard pre-beta checklist work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Framework/DB/ORM/map choices verified against multiple 2026 sources; exact version pins and AeroAPI pricing are MEDIUM (need install-time pnpm + vendor quote) |
| Features | MEDIUM-HIGH | Competitor feature sets verified via vendor docs; FAA 141.101 verified via eCFR primary source; pain-point synthesis is MEDIUM |
| Architecture | HIGH | Next.js + Expo + Postgres multi-tenant SaaS patterns are well-established; ADS-B realtime fanout specifics are MEDIUM |
| Pitfalls | MEDIUM-HIGH | Regulatory claims verified against 14 CFR primary sources; ADS-B feed terms verified against provider sites; some operational/UX pitfalls from community discussion |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **FlightAware AeroAPI actual quote** — the $100–$500/mo estimate is not a quote. Get a real conversation with FlightAware sales before committing architecturally (still safe because AeroAPI is the only self-serve commercial path regardless). Handle in Phase 6 planning.
- **Digital logbook legal sufficiency for FAA inspection** — electronic records are accepted but specific Part 61/43 record formats (8710-1, 337s, AD compliance) need a compliance review before committing to a PDF export schema. Handle in Phase 5 research.
- **Audit log retention / immutability mechanism** — safety-relevant domain implies WORM-ish audit records. Decide between Postgres append-only with triggers vs. external (S3 object-lock). Handle in Phase 1 planning.
- **Offline mobile for pre-flight on the ramp** — not in v1 scope, but architectural choices (Drizzle-on-SQLite, sync layer) need to be considered before mobile ships if v1.x wants a clean path to it.
- **Partner school's actual TCO / syllabus** — Phase 5 seeding assumes a generic PPL 141 TCO; the partner school almost certainly has preferences. Get this before Phase 5 planning, not during.
- **CFI / chief instructor review of all exports and templates** — pitfall mitigation for terminology and 141.101-shape compliance. Budget explicit review time in Phase 7.

## Sources

### Primary (HIGH confidence)
- 14 CFR 141.101, 61.51(e), 61.189, 91.409, Part 43 — regulatory primary via eCFR / Cornell LII
- FAA AC 141-1B — Pilot School Certification
- FlightAware AeroAPI product + developer portal
- ADSBexchange API Lite / Enterprise terms; OpenSky terms of use + FAQ
- MapLibre project site
- Supabase RLS docs, Postgres EXCLUDE constraint docs, tRPC, Drizzle, Inngest, Trigger.dev official docs
- Louisiana Tech PPL/IR/Commercial TCO documents (real 141 TCO examples)

### Secondary (MEDIUM confidence)
- Flight Schedule Pro, Flight Circle, TalonETA, FlightLogger vendor docs
- Drizzle vs Prisma 2026 comparisons, Supabase vs Neon 2026 comparisons
- Aviatize industry analyses of Part 61 vs 141 and scheduling software pricing
- Mapbox license change context + MapLibre / RN map comparison posts
- Community discussion on AeroAPI per-query cost estimation

### Tertiary (LOW confidence)
- Community-reported ADSBexchange Enterprise pricing ranges (needs direct quote)
- Rough AeroAPI cost projection for school-scale polling (needs direct quote)

See STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md for full source lists per area.

---
*Research completed: 2026-04-06*
*Ready for roadmap: yes*
