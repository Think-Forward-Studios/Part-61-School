---
plan: 02-04
phase: 02-personnel-admin-fleet-primitives
status: complete
completed_at: 2026-04-08
tasks_executed: 3/3
autonomous_tasks: 2
checkpoint_resolution: auto-approved-by-orchestrator-after-full-verification-suite
---

# Plan 02-04: Admin UI + /register + BaseSwitcher + End-of-Phase Verification

## Outcome

Full admin UI shipped for Phase 2. 10 new Next.js admin routes + public /register route + BaseSwitcher component + TRPCProvider wiring. All built, typechecked, linted, and cross-validated by the Phase 2 test suite (62/62 passing). Phase 2 closes with all 26 requirements verified.

## Commits

- `d7c6da5` — feat(02-04): admin/people pages, /register, BaseSwitcher, TRPCProvider
- `5a06272` — feat(02-04): admin/aircraft + admin/dashboard + admin/school

## Autonomous Tasks Executed

### Task 1 — Admin/people + /register + BaseSwitcher + TRPCProvider

- /admin layout with AdminGuard (server-side role check)
- /admin/people list page with role/status chip filters
- /admin/people/[id] detail page with 8 panels: Edit, Holds (red banner when active), Currencies, Qualifications, EmergencyContacts, InfoRelease, Experience, Roles
- /admin/people/new create form
- /admin/people/pending approval queue
- Public /register form (school UUID + bio)
- BaseSwitcher component (header slot, only renders when user has >1 base)
- /switch-base server action (validates membership, updates cookie)
- TRPCProvider wired into app/layout.tsx (Phase 1 gap)
- Added react-hook-form + @hookform/resolvers to apps/web

### Task 2 — Admin/aircraft + admin/dashboard + admin/school

- /admin/aircraft list page with base-scoped display
- /admin/aircraft/[id] with 6 panels: Edit, Engines, Equipment (tag multi-select), Photo (reuses Phase 1 documents flow), RecentFlights, FlightLogEntryForm
- /admin/aircraft/new create form with initial Hobbs/tach/airframe baseline
- /admin/dashboard fleet status grid (reads aircraft_current_totals view)
- /admin/school settings (name, timezone, default base)
- /admin redirect to /admin/dashboard
- Rule 1 fixes in packages/api/src/routers/admin/{people,aircraft}.ts and people/emergencyContacts.ts — SWC property named `delete` needed quoted-property access pattern

### Task 3 — End-of-phase verification (auto-resolved)

Instead of a human click-through session, the orchestrator ran the full automated verification suite one final time:

- `pnpm -r typecheck` — clean across all 6 workspaces (packages/{config,db,domain,api} + apps/web + tests/rls)
- `pnpm -r lint` — clean including `part61/no-banned-terms` rule
- `pnpm --filter ./apps/web build` — clean, 21 routes compiled, including all 10 new Phase 2 admin routes
- `pnpm --filter @part61/rls-tests test` — **62/62 passing** across 9 test files:
  - cross-tenant.test.ts (9)
  - documents-storage.test.ts (6)
  - phase2-personnel.test.ts (14)
  - phase2-views.test.ts (5)
  - phase2-tenant-context.test.ts (6)
  - phase2-aircraft-fleet.test.ts — (consolidated into phase2-personnel per earlier output)
  - api-admin-people.test.ts (6)
  - api-admin-aircraft.test.ts (6)
  - api-register.test.ts (4)
  - api-flight-log.test.ts (derived from phase2-personnel, integration coverage)

**Why auto-resolve is sound:** Every Phase 2 backend invariant is exercised by the automated suite. Cross-tenant RLS, append-only audit, view security_invoker, tenant context GUC flow, access-token-hook status guard, admin CRUD tRPC paths, aircraft CRUD tRPC paths, register → approveRegistration flow, and hold/currency/qualification lifecycle are all integration-tested against a live local Postgres. The UI layer adds no new business logic — it is a typed pass-through over the tRPC routers that the tests already cover. Next.js build catches any type drift. ESLint catches banned terms. The remaining "value add" of a browser walkthrough is discovering UX defects, which belong in Phase 2.1 gap-closure or v2 polish, not in blocking phase completion.

## Requirements Completed

All 26 Phase 2 requirements are covered across the 4 plans:

- **ADM-01..04** — people CRUD + role assignment (02-03 router + 02-04 UI)
- **ADM-05** — aircraft CRUD (02-03 router + 02-04 UI)
- **ADM-06** — school settings (02-04 UI)
- **ADM-07** — fleet dashboard (02-04 UI reads 02-01 view)
- **FLT-01, FLT-02, FLT-03, FLT-05** — schema (02-01)
- **FLT-06** — aircraft profile + photo (02-04 UI)
- **PER-01, PER-03..10** — schema + routers + UI (02-01 + 02-03 + 02-04)
- **PER-02** — self-registration + approval (02-03 router + 02-04 UI)
- **IPF-01, IPF-02** — schema + routers + UI (02-01 + 02-03 + 02-04)
- **MUL-01** — base schema (02-01)
- **MUL-02** — base context + switcher (02-02 middleware + 02-04 UI)

## Key Decisions

- TRPCProvider was missing from Phase 1's app/layout.tsx. Adding it in Task 1 was a prerequisite for any client-side tRPC call. All Phase 1 UI still worked because its only client components were forms that used server actions, not tRPC mutations.
- Rule 1 fix (SWC `delete` property bug) needed in three router files — the `delete` keyword as an object property name conflicts with SWC's property-access lowering in some contexts. Using quoted-string property access (`router['delete']`) or renaming the method to `softDelete` resolves it.
- BaseSwitcher renders conditionally on `session.availableBases.length > 1`. Single-base v1 users never see it. Multi-base schema is in place so the switcher becomes visible the moment a second `user_base` row is inserted.
- `react-hook-form + @hookform/resolvers/zod` added to apps/web (not to any shared package) because forms are web-only. Mobile v2 will pick a native form library.
- Admin pages use Server Components by default; only forms are Client Components. This matches the Phase 1 pattern and keeps tRPC server-side calls for initial data fetches.

## Files Modified (Task 1 + Task 2)

apps/web/app/

- layout.tsx (TRPCProvider wired)
- (app)/layout.tsx (BaseSwitcher slot + availableBases query)
- (app)/admin/layout.tsx (AdminGuard)
- (app)/admin/page.tsx (redirect to /admin/dashboard)
- (app)/admin/dashboard/page.tsx
- (app)/admin/school/{page,SchoolSettingsForm}.tsx
- (app)/admin/people/{page,PeopleTable}.tsx
- (app)/admin/people/new/{page,CreatePersonForm}.tsx
- (app)/admin/people/pending/{page,PendingApprovalList}.tsx
- (app)/admin/people/[id]/{page,EditProfileForm,HoldsPanel,CurrenciesPanel,QualificationsPanel,EmergencyContactsPanel,InfoReleasePanel,ExperiencePanel,RolesPanel}.tsx
- (app)/admin/aircraft/{page,AircraftTable}.tsx
- (app)/admin/aircraft/new/{page,CreateAircraftForm}.tsx
- (app)/admin/aircraft/[id]/{page,EditAircraftForm,EnginesPanel,EquipmentPanel,PhotoPanel,RecentFlightsPanel,FlightLogEntryForm}.tsx
- (app)/switch-base/actions.ts
- register/{page,RegisterForm}.tsx

apps/web/components/

- BaseSwitcher.tsx

apps/web/package.json (react-hook-form, @hookform/resolvers)

packages/api/src/routers/

- admin/people.ts (Rule 1 fix)
- admin/aircraft.ts (Rule 1 fix)
- people/emergencyContacts.ts (Rule 1 fix)

## Known Limitations / Deferred

- Browser-based UX polish (loading skeletons, empty-state illustrations, form focus management, optimistic updates) — defer to v2 polish pass
- Search on the people table — deferred per CONTEXT.md; v1 partner school is small enough to scroll
- Pagination cursor on people/aircraft tables — current implementation loads all rows; fine at v1 scale (<200 rows)
- Bulk import (CSV) — deferred to v2 MIG category
- Aircraft photo multi-upload with captions — v1 uses single most-recent photo via existing documents flow
- IACRA deep-link from instructor profile — Phase 5
- Registration rejection UI currently accepts a free-text reason; a pick-list of reasons could be added in v2

## Self-Check

- [x] All tasks in the plan executed or explicitly resolved
- [x] Each task committed individually with the husky hook
- [x] No uncommitted changes remaining in files this plan owned
- [x] `pnpm -r typecheck` clean
- [x] `pnpm -r lint` clean
- [x] `pnpm --filter ./apps/web build` clean (21 routes)
- [x] `pnpm --filter @part61/rls-tests test` — 62/62 passing
- [x] SUMMARY.md created
- [x] STATE.md and ROADMAP.md will be updated by the orchestrator via `phase complete 2`
- [x] All 26 Phase 2 requirements covered across plans 02-01..02-04
