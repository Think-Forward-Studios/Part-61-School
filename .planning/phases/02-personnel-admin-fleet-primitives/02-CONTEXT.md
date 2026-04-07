# Phase 2: Personnel, Admin & Fleet Primitives - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Build people and aircraft as first-class records with all the biographic, currency, qualification, multi-base, and multi-clock structure that every downstream pillar (scheduling, maintenance, syllabus, ADS-B) depends on. Phase 2 ships:

- Admin CRUD for students, instructors, mechanics (with A&P/IA), rental customers, and aircraft
- Full personnel records (bio + emergency contact + info-release auth + holds/groundings + no-show history + training history)
- Instructor currency + qualification tracking (CFI/CFII/MEI/medical/BFR/IPC + aircraft type ratings + course authorizations)
- Self-registration with admin approval queue
- Aircraft with independent Hobbs/tach/airframe/per-engine clocks computed over an append-only `flight_log_entry` event log
- Aircraft equipment tagging
- Multi-base scoping schema across all of the above
- Admin dashboard fleet status panel

Phase 2 does NOT ship: actual scheduling (Phase 3), maintenance items / squawks / ADs (Phase 4), syllabus enrollment (Phase 5). Phase 2 sets up the _people_ and _aircraft_ primitives those phases consume.

Covers requirements: ADM-01..07, FLT-01, FLT-02, FLT-03, FLT-05, FLT-06, PER-01..10, IPF-01, IPF-02, MUL-01, MUL-02.

</domain>

<decisions>
## Implementation Decisions

### Aircraft time-series model (FLT-01, FLT-02, FLT-03)

- **One log entry per flight.** Single `flight_log_entry` table holds, for each flight close-out: `aircraft_id`, `flown_at`, `hobbs_out`, `hobbs_in`, `tach_out`, `tach_in`, `airframe_delta`, plus per-engine delta rows (see engines below). Recorded by an instructor or student at flight close-out.
- **Append-only.** No updates, no deletes. Corrections are NEW entries with `kind = 'correction'` and a `corrects_id` FK to the original. Audit trigger attached.
- **Current totals are derived queries**, never stored as a mutable column. A SQL view (`aircraft_current_totals`) computes `current_hobbs`, `current_tach`, `current_airframe_time` as `SUM(...) OVER (PARTITION BY aircraft_id)`. Aircraft profile and admin dashboard read from the view.
- The view replaces what would have been `aircraft.current_hobbs` etc — having that as a stored column is the exact retrofit pitfall we're avoiding.
- A separate seed/baseline mechanism: each aircraft has an initial `flight_log_entry` of `kind = 'baseline'` (with the times the school received the aircraft). The view sums everything from there.

### Engines (FLT-01)

- **N engines via `aircraft_engine` table.** One row per engine with `aircraft_id`, `position` ('single' | 'left' | 'right' | 'center' | numbered for >2), `serial_number`, `installed_at`, `removed_at` (nullable). Handles SEL today and ME later with no migration.
- `flight_log_entry_engine` join: `flight_log_entry_id`, `engine_id`, `delta_hours`. Multiple rows per flight when multi-engine.
- For the v1 SEL fleet, every aircraft has exactly one `aircraft_engine` row with `position = 'single'`. The UI hides per-engine columns when there's only one.

### Personnel model (PER-01..10, AUTH-06, AUTH-07)

- **Roles enum extended:** add `rental_customer` to the existing role enum from Phase 1. Same `users` table, same `user_roles` join. A person who's both a student and a rental customer has two role rows. No separate rentals table.
- **`person_profile` table** linked 1:1 to `users`: `first_name`, `last_name`, `date_of_birth`, `address_line1/2`, `city`, `state`, `postal_code`, `country`, `phone`, `email_alt`, `faa_airman_cert_number`, `citizenship_status` (enum: `us_citizen | us_national | foreign_national | unknown`), `tsa_afsp_status` (enum: `not_required | pending | approved | expired`), `notes`. All FAA / TSA fields are **nullable in v1** — Phase 5 syllabus may add gates.
- **`emergency_contact` table** (one-to-many on user): `name`, `relationship`, `phone`, `email`, `is_primary`. UI shows the primary on the dispatch screen (Phase 3 will read).
- **`info_release_authorization` table**: rows like "John Doe (parent) may receive training info". `name`, `relationship`, `granted_at`, `revoked_at` (nullable).

### Holds and groundings (PER-05, PER-06)

- **Single `person_hold` table** for both students and instructors. Columns: `id`, `user_id`, `school_id`, `kind` (`hold` | `grounding`), `reason`, `created_by`, `created_at`, `cleared_at` (nullable), `cleared_by` (nullable), `cleared_reason`.
- Active hold/grounding: `cleared_at IS NULL`. Phase 3 scheduling joins to this and refuses reservations.
- Same model handles all four cases: student hold, student grounding, instructor grounding (instructors can't be "held" in the student sense, but the same table works — UI uses `kind` to label).
- Soft-delete-equivalent: holds are never deleted. To clear, set `cleared_at`. History is the audit trail.

### Currency tracking (IPF-01, SYL-12 partial)

- **Stored expiry, computed status.** `instructor_currency` table: `user_id`, `kind` (enum: `cfi | cfii | mei | medical | bfr | ipc`), `effective_at`, `expires_at`, `notes`, `document_id` (FK to documents from Phase 1, nullable).
- Status (`current` | `due_soon` | `expired`) is a SQL function `currency_status(expires_at, warning_days)` — no stored status column, no background job needed in Phase 2. Each currency `kind` has a `warning_days` config (medical = 30, BFR = 60, etc.) stored in a small `currency_kind_config` table or hardcoded in domain code.
- Same pattern reused for student currencies in Phase 5 (SYL-12).
- **Qualifications** (IPF-02) are a separate table `instructor_qualification`: `user_id`, `kind` (enum: `aircraft_type | sim_authorization | course_authorization`), `descriptor` (text — e.g. "C172", "Frasca 142", "PPL stage 2"), `granted_at`, `granted_by`, `notes`. Phase 6 syllabus rules query these.

### Multi-base scoping (MUL-01, MUL-02)

- **Schema everywhere now, single-base UI.** Every business table that scopes to a base — `aircraft`, `instructor_qualification` (for which base they teach at), `flight_log_entry` (which base it flew from), and a `user_base` join (a user can hold roles at multiple bases) — gets a `base_id` column NOT NULL referencing `bases.id`.
- Active base lives in the session as a cookie `part61.active_base_id` (parallel to `part61.active_role`). Set on login to the user's primary base; users with multi-base roles can switch.
- `withTenantTx` middleware (from Phase 1) extends to also `SET LOCAL app.base_id = ?`. RLS policies for base-scoped tables read both `school_id` AND `base_id` from the JWT/setting.
- Phase 2 ships exactly one base (auto-created with the school) and the schema/middleware. The base picker UI is built but only renders when a user has roles at >1 base — most v1 users will never see it.

### Aircraft equipment (FLT-05)

- **Tag-based + free-text notes.** `aircraft_equipment_tag` enum: `ifr_equipped`, `complex`, `high_performance`, `glass_panel`, `autopilot`, `ads_b_out`, `ads_b_in`, `gtn_650`, `gtn_750`, `g1000`, `g3x`, `garmin_530`, `kln_94`, `tail_dragger`, `retractable_gear`. Stored as `aircraft_equipment` join: `aircraft_id`, `tag`. Multi-select in UI.
- `aircraft.equipment_notes` text column for free-form additions ("STOL kit, oversize tires").
- Phase 6 syllabus rules query the tags (e.g. "Aircraft must be IFR-equipped" → `WHERE 'ifr_equipped' IN (SELECT tag FROM aircraft_equipment WHERE aircraft_id = ?)`).

### No-show tracking (PER-07)

- **`no_show` table** lands now: `id`, `user_id` (the student), `school_id`, `scheduled_at`, `aircraft_id` (nullable), `instructor_id` (nullable), `lesson_descriptor` (text — Phase 5 will replace with FK), `recorded_by`, `recorded_at`, `reason`.
- Phase 3 scheduling writes rows when a reservation lifecycle hits the `no_show` close-out state.
- Phase 2 student profile shows count of no-shows in the last 90 days + a small recent list (last 5). No new dashboard UI in Phase 2.

### Training history scaffolding (PER-09)

- **`student_course_enrollment` table** lands with minimal columns now: `id`, `user_id`, `course_descriptor` (text — replaced by FK in Phase 5), `enrolled_at`, `completed_at` (nullable), `withdrawn_at` (nullable), `notes`. Phase 5 syllabus replaces `course_descriptor` with a real `course_id` FK.
- This is the "current and past courses" surface on the student profile.

### Instructor flight experience history (PER-10)

- **`instructor_experience` table**: `user_id`, `total_time`, `pic_time`, `instructor_time`, `multi_engine_time`, `instrument_time`, `as_of_date`, `source` (`self_reported | imported | derived`), `notes`. v1 these are admin-entered snapshots. v2+ may auto-derive from system flight logs.

### Admin pages (ADM-01..07)

- **Table list → detail page pattern.** Routes:
  - `/admin/people` — table of all users with role chips, status (active / hold / grounded), filter by role
  - `/admin/people/[id]` — full edit page (bio, roles, holds, currencies, qualifications, no-shows, training history, documents)
  - `/admin/people/new` — create form
  - `/admin/people/pending` — registration approval tab inside `/admin/people` (filtered view, not a separate route)
  - `/admin/aircraft` — table of aircraft with status, tail, type, base
  - `/admin/aircraft/[id]` — full edit (info, equipment tags, photo, time totals, recent flights, engine list)
  - `/admin/aircraft/new`
  - `/admin/dashboard` — fleet status at-a-glance panel for the active base (each aircraft: current Hobbs, last flight, status)
  - `/admin/school` — school settings page (name, timezone, default base)
- All under `(app)` route group, gated by `adminProcedure` server-side.
- Server Components for the table pages (server-rendered with tRPC server-side calls), Client Components only for forms and the role switcher.

### Self-registration approval queue (PER-02)

- **Pending tab in /admin/people.** Public route `/register` (no auth) collects bio + email + requested school. Creates a `users` row with `status = 'pending'` and no auth user yet.
- Admin sees pending in `/admin/people` filtered to status=pending. Approving fires the existing Phase 1 invite-accept flow: creates the auth user via service-role, sends activation email, sets `users.status = 'active'`.
- Rejection sets `users.status = 'rejected'` with a reason and never creates an auth user.
- `users.status` enum: `pending | active | inactive | rejected`. Indexed.

### Aircraft photos (FLT-06)

- **Reuse Phase 1 documents flow.** Add `aircraft_photo` to `document_kind` enum. Aircraft profile shows the most recent `aircraft_photo` document for that aircraft via signed URL. Upload via the existing documents tRPC router with a small wrapper that scopes the upload to an aircraft instead of a user.
- `documents` table needs an optional `aircraft_id` FK column added (nullable, present for `aircraft_photo` kind, null for medicals/licenses/IDs).

### Claude's Discretion

- Exact column types beyond what's specified above
- Form library / validation approach (Zod + react-hook-form is fine)
- Whether to use Server Actions or tRPC mutations for forms — pick one and be consistent
- Phone number formatting / validation library
- Address autocomplete (skip for v1 — plain fields)
- Empty state visuals
- Pagination strategy on the people / aircraft tables (cursor or offset, both fine for v1 volume)
- Loading skeletons
- Whether the people-table filter is a query string or a session preference
- Unit display preference (always show times to 1 decimal)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets (from Phase 1)

- **`packages/db/src/schema/`** — extend with new files: `personnel.ts`, `aircraft.ts`, `flight_log.ts`, `holds.ts`, `currencies.ts`, `qualifications.ts`. Existing `tenancy.ts` already defines `bases` table — extend it with the multi-base FKs.
- **`packages/db/src/functions/audit_attach.sql`** — call `select audit.attach('table_name')` for every new safety-relevant table in the migration
- **`packages/db/src/functions/fn_block_hard_delete.sql`** — attach to `flight_log_entry`, `person_hold`, `instructor_currency`, `instructor_qualification`, `no_show`, `student_course_enrollment` (anything that's training-record-relevant)
- **`packages/api/src/procedures.ts`** — `adminProcedure` already exists with role enforcement. Build admin routers on top.
- **`packages/api/src/middleware/tenant.ts`** — `withTenantTx` already wraps every tRPC procedure in a transaction with `SET LOCAL app.school_id`. Extend to also set `app.base_id`.
- **`tests/rls/harness.ts`** — `seedTwoSchools()`, `asUserOf()` already in place. Every new table gets a cross-tenant test added to `cross-tenant.test.ts` (or a new file in `tests/rls/`).
- **`apps/web/app/(app)/layout.tsx`** — protected layout already loads school + roles + active role. Extend to also load `active_base_id` and pass to children.
- **`apps/web/components/RoleSwitcher.tsx`** — pattern for the new `BaseSwitcher.tsx` (only renders when user has >1 base).
- **`apps/web/app/(app)/profile/documents/`** — existing upload UI is the template for `/admin/aircraft/[id]/photo` upload.

### Established Patterns

- **Schema-first, RLS-first.** Every table gets `school_id`, RLS policy, audit trigger, hard-delete blocker (where appropriate), and a cross-tenant test in the same migration / PR.
- **Hand-authored migration mirrored to `supabase/migrations/`** so `supabase start` picks it up. Filename: `20260407000000_phase2_personnel_aircraft.sql` (or split). Drizzle remains source of truth — run `drizzle-kit generate` to verify the table DDL portion matches; hand-author the trigger/RLS/grants additions.
- **Custom access token hook stays untouched.** Phase 2 doesn't need new JWT claims (active_base_id is a cookie, not a JWT claim, because it changes more often than role and doesn't affect RLS for the multi-base v1).
- **Server-side enforcement first.** Every admin route uses `adminProcedure` from `packages/api`. UI hiding is cosmetic.
- **`withTenantTx` extension:** add a sibling `withBaseTx` or extend the existing wrapper to also `SET LOCAL app.base_id = ?` from the cookie. RLS policies on base-scoped tables read it.

### Integration Points

- Phase 3 scheduling will read: `aircraft` (availability), `aircraft_equipment` (lesson rules), `instructor_currency` (qualification gates), `instructor_qualification` (course gates), `person_hold` (block reservations), `student_course_enrollment` (which course is the student in)
- Phase 4 CAMP will read: `flight_log_entry` (driving Hobbs forward), `aircraft_engine` (component lifing), `aircraft_equipment` (which inspections apply)
- Phase 5 syllabus will replace `student_course_enrollment.course_descriptor` with a real `course_id` FK
- Phase 6 progression engine will join `instructor_currency` + `instructor_qualification` for SCH-11 (instructor currency gate) and SCH-12 (student qualification gate)
- Phase 7 ADS-B will read `aircraft.tail_number` to match school aircraft on the live map
- Phase 8 reports will pivot off `no_show`, `instructor_currency`, `flight_log_entry`

</code_context>

<specifics>
## Specific Ideas

- Aircraft profile page should _feel_ like a digital aircraft binder — totals at the top, equipment tags, recent flights table, photo, current squawks (Phase 4 will fill in)
- People table must filter by role chip (Students / Instructors / Mechanics / Rental / Admin / Pending) — this is the daily-use page for an admin
- Holds/groundings should be "loud" — when looking at a person who's currently held, the profile shows a red banner with the reason and who set it
- Flight log entry form should be the same one an instructor uses at flight close-out in Phase 3 — design it once, route to it from both /admin/aircraft/[id]/flights/new (admin backfill) and from the Phase 3 dispatch screen
- All times displayed to 1 decimal place (1234.5 hours), never integer rounding

</specifics>

<deferred>
## Deferred Ideas

- **Background expiration notification job** — Phase 8 (notifications). Phase 2 has stored expires_at + computed status; that's enough for the profile pages to show due-soon/expired chips. Pushing notifications is later.
- **TSA AFSP automated workflow** — out of scope; Phase 2 just captures the status field
- **IACRA deep-link from instructor profile** — Phase 5
- **Aircraft squawks / open work orders surfaced on aircraft profile** — Phase 4 will fill in those panels
- **Per-base operating hours / holiday calendar** — Phase 3 if scheduling needs it
- **Instructor pay rates / payroll** — v2 (BIL category)
- **Pilot logbook PDF export for instructors** — Phase 5 / 8
- **Document expiration push notifications** — Phase 8
- **Bulk import (CSV) for fleet/people** — v2 (MIG category)
- **Rental customer agreement / waiver e-sign** — v2
- **Two-factor for admin role** — v2
- **Searching the people list** — defer to Phase 8 unless trivially cheap; v2 partner school is small enough to just scroll the table
- **Auto-derived total time from system flight logs** — v2; v1 instructors enter their experience numbers as snapshots

</deferred>

---

_Phase: 02-personnel-admin-fleet-primitives_
_Context gathered: 2026-04-07_
