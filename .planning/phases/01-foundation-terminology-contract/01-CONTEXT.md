# Phase 1: Foundation & Terminology Contract - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the safety-relevant, multi-tenant-ready chassis that everything else in the project bolts onto: Postgres + Next.js monorepo, RLS-enforced multi-tenancy, four-role auth, append-only audit, banned-term lint, document storage, and timezone discipline. This phase ships **no business features** — no aircraft, no scheduling, no syllabus. It produces a deployable empty shell that a user can sign up to, log into, upload a document, and have every action audited.

Covers requirements: FND-01..07, AUTH-01..08.

</domain>

<decisions>
## Implementation Decisions

### Stack & Hosting
- **Monorepo:** pnpm + Turborepo. Workspaces: `apps/web` (Next.js), `packages/db` (Drizzle schema + migrations + RLS policies), `packages/api` (tRPC), `packages/domain` (shared TS types/zod), `packages/config` (shared tsconfig/eslint/banned-term lint)
- **Web framework:** Next.js (App Router), TypeScript strict mode
- **Database + storage + auth:** Supabase (managed Postgres + Storage + Auth + Realtime in one). Free tier covers v1
- **ORM:** Drizzle. Chosen for first-class RLS primitives (`pgPolicy`), thin SQL-like ergonomics, and migration story compatible with Supabase
- **Mobile:** **Not in this phase** — Expo workspace is added in v2; do not scaffold it now
- **Hosting target:** Vercel for the web app, Supabase managed everything-else. Confirm with partner school before production deploy

### Authentication
- **Provider:** Supabase Auth — JWT claims feed RLS policies natively, zero glue code for multi-tenant isolation
- **Method:** Email + password only in v1. No OAuth, no magic link, no MFA in this phase
- **Email verification:** Required before account is active (AUTH-02)
- **Password reset:** Supabase built-in flow (AUTH-03)
- **Email transport:** Supabase's built-in SMTP for v1 — adequate for partner school volume; swap to Resend later if deliverability issues arise
- **Session:** 30-day refresh token, 1-hour access token (Supabase defaults). Persists across browser refresh (AUTH-04)
- **Sign-up policy:** **Admin-invited only.** Admin creates the user record, system emails an activation link, user sets password on first visit. No public sign-up route in v1. (Self-register-with-approval flow PER-02 lands in Phase 2.)

### Multi-Tenancy & Multi-Base
- **Tenant key:** `school_id` on every business table
- **Enforcement:** Postgres Row Level Security (RLS) policies driven by JWT claim `school_id` set via Supabase Auth custom claims
- **Test harness:** A required CI test that creates two schools with seed data and asserts that a JWT for school A cannot read or write any row belonging to school B — for every business table. This test must exist before any business table is added (it gates the schema PR template)
- **`SET LOCAL` middleware:** All tRPC procedures wrap their DB call in a transaction that `SET LOCAL app.school_id = ?` from the verified JWT before any query, as defense-in-depth
- **Multi-base:** Add `base_id` column on relevant business tables and seed `bases` table now (schema only). Base-management UI lands in Phase 2. Rationale: cannot retrofit `base_id` cleanly later

### Roles & Authorization
- **Roles:** Student, Instructor, Mechanic, Admin
- **Mechanic sub-attribute:** `mechanic_authority` enum: `none | a_and_p | ia` (IA implies A&P). Used by Phase 4 sign-off rules
- **Multiple roles per user:** Yes — `user_roles` join table. A user can be e.g. Instructor + Mechanic (A&P)
- **Active role UX:** **Active-role switcher.** User picks active role at login (or via menu) when they hold more than one. Server uses the active role for all permission checks. Stored in session, not URL
- **Server-side enforcement:** All role-gated tRPC procedures check role server-side via middleware. UI hiding is treated as cosmetic only — never the only line of defense (AUTH-08)
- **Admin role:** Admin always has read access to everything in their school, but write actions are still audited

### Audit Trail
- **Storage:** Single Postgres `audit_log` table in the same database. Columns: `id`, `school_id`, `user_id`, `actor_role`, `table_name`, `record_id`, `action` (insert/update/soft_delete), `before` (jsonb, null on insert), `after` (jsonb, null on delete), `at` (timestamptz). Indexed on (`table_name`, `record_id`), (`user_id`, `at`), (`school_id`, `at`)
- **Mechanism:** Postgres trigger function `audit.fn_log_change()` attached via `CREATE TRIGGER` to every safety-relevant table. Triggers are append-only — no application code path can write to `audit_log` directly
- **Append-only enforcement:** RLS policy on `audit_log` permits INSERT only (no UPDATE, no DELETE). Even superuser deletes are revoked at the role level
- **Soft-delete contract:** Maintenance and training tables get a `deleted_at` column from day one (FND-04). A `BEFORE DELETE` trigger raises an exception on those tables — hard delete is impossible. Soft delete sets `deleted_at` and writes an audit row
- **What's "safety-relevant":** Any table that ends up holding aircraft, maintenance, training, schedule, sign-off, or document data. The `audit.fn_log_change()` trigger is mandatory for those tables; the schema-PR template checks it's attached

### Banned-Term Lint
- **Banned terms (v1):** "Part 141", "approved", "certified course" (case-insensitive, word-boundary). Lint config lives in `packages/config/banned-terms.json` so the list can grow without code changes
- **Scope of scan:** UI source files (`apps/web/**/*.{ts,tsx,jsx}`) plus any export template directories (`apps/web/templates/**`, `packages/exports/**`). Excludes: `node_modules`, tests, comments (so devs can document the rule), and this `.planning/` directory
- **Implementation:** Custom ESLint rule `no-banned-terms` that fails the file if any banned term appears in a string literal or JSX text node, with a code-frame message linking to the rule rationale
- **CI gate:** GitHub Actions workflow runs `pnpm lint` on every PR; ESLint failure blocks merge (FND-05)
- **Pre-commit:** Lint-staged + Husky run the same rule pre-commit so developers see it before push
- **Allowlist mechanism:** A line-level `// allow-banned-term: <reason>` comment can permit one occurrence (e.g. for an internal admin-only diagnostic), but the comment itself is logged in CI output for audit

### Timezones
- **Storage:** Always `timestamptz` in Postgres. No `timestamp without time zone` anywhere in the schema
- **App-level:** `date-fns-tz` for all formatting; never use `Date.toLocaleString()` without an explicit zone
- **School default:** `schools.timezone` column holding an IANA name (e.g. `America/Chicago`). Set at school creation
- **Per-user override:** `users.timezone` nullable; if null, fall back to school timezone. Display logic uses the user's effective TZ
- **DST safety:** All recurring/duration math uses zoned date library functions, never raw millisecond arithmetic across day boundaries

### Document Storage
- **Backend:** Supabase Storage. Bucket per school is overkill — single `documents` bucket with object-name prefix `school_{id}/user_{id}/{document_id}` and RLS on the bucket policies keyed off the prefix
- **Document types in v1:** `medical`, `pilot_license`, `government_id`, `insurance`. Enum stored in `documents.kind`
- **Metadata:** `documents` table holds `school_id`, `user_id`, `kind`, `expires_at` (nullable), `uploaded_at`, `uploaded_by`, `storage_path`, `mime_type`, `byte_size`
- **Access:** Files served only via short-lived signed URLs (5 minute TTL) generated server-side after a tRPC permission check. No public bucket
- **Expiration tracking:** `expires_at` column populated at upload (medicals especially); a background job in a later phase will surface expiring documents — for Phase 1, only the column + endpoint exist

### CI / Tooling
- **Test runner:** Vitest (project-wide)
- **Linter:** ESLint flat config in `packages/config`
- **Formatter:** Prettier (Tailwind plugin even though no Tailwind classes in Phase 1 — installed for future phases)
- **CI:** GitHub Actions workflow on push/PR: install → typecheck → lint (banned-term rule included) → test (RLS cross-tenant harness must pass) → build
- **Migrations:** Drizzle Kit `migrate` script. Migrations are checked into git; CI applies pending migrations against a throwaway Supabase branch and runs the test suite there

### Claude's Discretion
- Exact Drizzle schema column types beyond what's specified above
- Folder layout inside `apps/web/app` (route grouping conventions)
- ESLint rule severity tuning beyond banned-term (which must be `error`)
- Whether to use Drizzle's Relations API or raw joins
- Exact Husky/lint-staged config wiring
- Whether to use Supabase CLI for local dev or just point at a hosted dev project
- Test fixture / factory pattern for the RLS test harness
- Whether tRPC procedures use `protectedProcedure` / `adminProcedure` / `mechanicProcedure` naming or composable middleware
- How to surface the "active role" switcher visually (header dropdown vs separate page)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None in this repo** — Phase 1 is greenfield bootstrap of a new monorepo at `/Users/christopher/Desktop/Part 61 School/`
- **External reference:** The owner's existing ADS-B Tracker at `/Users/christopher/Desktop/ADS-B Data/` is Next.js 16 / React 19 / TypeScript / Tailwind / MapLibre / Deck.gl / TanStack Query — same family, useful as a styling and dependency-version reference. Do **not** copy code wholesale; just match versions where reasonable so Phase 7 integration is seamless

### Established Patterns
- None — this phase establishes the patterns

### Integration Points
- Future: Phase 7 will call the ADS-B Tracker REST API at `http://localhost:3002/api/*` (configurable). Phase 1 should reserve an env var slot `ADSB_API_BASE_URL` in the env schema even though nothing reads it yet — establishes the contract
- Future: All later phases will add tables, RLS policies, audit triggers, and tRPC routers on top of the foundation laid here. The schema-PR template should require: (1) audit trigger attached, (2) RLS policy added, (3) cross-tenant test added, (4) migration generated

</code_context>

<specifics>
## Specific Ideas

- The whole point of Phase 1 is "things you can't retrofit." If a decision in Phase 1 looks heavy-handed (like the cross-tenant test harness as a gate), that's intentional — it costs nothing now and is impossible to add cleanly after the schema has 40 tables
- Emulate the quality bar of the existing ADS-B Tracker's TypeScript strictness and tooling discipline
- Keep Phase 1 boring on purpose. No clever abstractions. The Drizzle schema should read like the SQL it generates
- A user finishing Phase 1 should be able to: sign up via an admin invite, verify email, log in, see an empty role-appropriate dashboard, upload a document to their profile, log out — and everything they did should be in `audit_log`

</specifics>

<deferred>
## Deferred Ideas

- **Self-registration with approval queue (PER-02)** — Phase 2, with the rest of Personnel Management
- **OAuth / magic link / MFA** — out of scope for v1 entirely; revisit in v2 if partner school requests
- **Per-school custom subdomains** — Phase 8 / multi-school SaaS expansion
- **Background job for expiring-document notifications** — Phase 8 (Notifications)
- **Audit log retention / archival policy** — defer until partner school weighs in on retention requirements
- **Mechanic billing / labor tracking** — out of scope per PROJECT.md
- **Localization beyond English** — not in v1
- **Switching email transport to Resend/Postmark** — defer until v1 deliverability issues observed

</deferred>

---

*Phase: 01-foundation-terminology-contract*
*Context gathered: 2026-04-06*
