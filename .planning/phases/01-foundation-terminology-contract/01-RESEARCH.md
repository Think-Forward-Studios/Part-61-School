# Phase 1: Foundation & Terminology Contract — Research

**Researched:** 2026-04-06
**Domain:** Multi-tenant Next.js + Supabase + Drizzle foundation, RLS, audit triggers, banned-term lint, document storage, timezone discipline
**Confidence:** HIGH for stack/architecture (verified by project research/STACK.md + ARCHITECTURE.md + official docs in training data); MEDIUM for the most current Drizzle `pgPolicy` syntax and Supabase custom-claims hook details (these APIs have moved fast through late 2025 — flag for in-task verification at install time)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stack & Hosting**
- **Monorepo:** pnpm + Turborepo. Workspaces: `apps/web` (Next.js), `packages/db` (Drizzle schema + migrations + RLS policies), `packages/api` (tRPC), `packages/domain` (shared TS types/zod), `packages/config` (shared tsconfig/eslint/banned-term lint)
- **Web framework:** Next.js (App Router), TypeScript strict mode
- **Database + storage + auth:** Supabase (managed Postgres + Storage + Auth + Realtime in one). Free tier covers v1
- **ORM:** Drizzle. Chosen for first-class RLS primitives (`pgPolicy`), thin SQL-like ergonomics, and migration story compatible with Supabase
- **Mobile:** Not in this phase — Expo workspace is added in v2; do not scaffold it now
- **Hosting target:** Vercel for the web app, Supabase managed everything-else

**Authentication**
- Supabase Auth with JWT claims feeding RLS
- Email + password only in v1. No OAuth, no magic link, no MFA
- Email verification required (AUTH-02)
- Password reset via Supabase built-in flow (AUTH-03)
- Email transport: Supabase built-in SMTP
- Session: 30-day refresh token, 1-hour access token (Supabase defaults). Persists across browser refresh (AUTH-04)
- **Sign-up policy:** Admin-invited only. Admin creates user, system emails activation link, user sets password on first visit. No public sign-up route in v1

**Multi-Tenancy & Multi-Base**
- Tenant key: `school_id` on every business table
- Enforcement: Postgres RLS driven by JWT claim `school_id` set via Supabase Auth custom claims
- Required CI cross-tenant test harness — gates schema PR template
- `SET LOCAL app.school_id = ?` from verified JWT in every tRPC procedure (defense-in-depth)
- Multi-base: `base_id` column + `bases` table now (schema only). Base UI lands Phase 2

**Roles & Authorization**
- Roles: Student, Instructor, Mechanic, Admin
- `mechanic_authority` enum: `none | a_and_p | ia` (IA implies A&P)
- Multiple roles per user via `user_roles` join table
- Active-role switcher: user picks active role at login when holding more than one. Stored in session, not URL
- All role-gated tRPC procedures check role server-side via middleware. UI hiding is cosmetic only (AUTH-08)
- Admin always has read access to everything in their school; writes still audited

**Audit Trail**
- Single Postgres `audit_log` table. Columns: `id`, `school_id`, `user_id`, `actor_role`, `table_name`, `record_id`, `action` (insert/update/soft_delete), `before` (jsonb), `after` (jsonb), `at` (timestamptz). Indexed on `(table_name, record_id)`, `(user_id, at)`, `(school_id, at)`
- Mechanism: Postgres trigger function `audit.fn_log_change()` attached via `CREATE TRIGGER`
- Append-only enforcement: RLS on `audit_log` permits INSERT only. UPDATE/DELETE revoked at role level
- Soft-delete: maintenance and training tables get `deleted_at` from day one. `BEFORE DELETE` trigger raises exception — hard delete impossible

**Banned-Term Lint**
- Banned terms (v1): "Part 141", "approved", "certified course" (case-insensitive, word-boundary)
- Config: `packages/config/banned-terms.json`
- Scope: `apps/web/**/*.{ts,tsx,jsx}` plus `apps/web/templates/**`, `packages/exports/**`. Excludes node_modules, tests, comments, `.planning/`
- Implementation: Custom ESLint rule `no-banned-terms` against string literals + JSXText nodes
- CI gate: GitHub Actions `pnpm lint` blocks merge
- Pre-commit: Husky + lint-staged
- Allowlist: line-level `// allow-banned-term: <reason>` comment, logged in CI output

**Timezones**
- Always `timestamptz` in Postgres
- App-level: `date-fns-tz` for all formatting
- `schools.timezone` (IANA) + `users.timezone` nullable override
- All recurring/duration math via zoned date library functions

**Document Storage**
- Single `documents` Supabase Storage bucket, prefix `school_{id}/user_{id}/{document_id}`
- Bucket RLS keyed off path prefix
- Document types v1: `medical | pilot_license | government_id | insurance` (enum on `documents.kind`)
- `documents` table: `school_id, user_id, kind, expires_at?, uploaded_at, uploaded_by, storage_path, mime_type, byte_size`
- Files served only via 5-minute signed URLs generated server-side after tRPC permission check

**CI / Tooling**
- Vitest, ESLint flat config, Prettier (Tailwind plugin), GitHub Actions: install → typecheck → lint → test (RLS harness must pass) → build
- Drizzle Kit migrations checked into git; CI applies pending migrations against a throwaway Supabase branch

### Claude's Discretion
- Exact Drizzle column types beyond what's specified
- Folder layout inside `apps/web/app` (route grouping conventions)
- ESLint rule severity tuning beyond banned-term (must be `error`)
- Drizzle Relations API vs raw joins
- Husky/lint-staged wiring
- Supabase CLI for local dev vs hosted dev project
- Test fixture/factory pattern for RLS test harness
- tRPC procedure naming (`protectedProcedure` vs composable middleware)
- "Active role" switcher visual surface (header dropdown vs separate page)

### Deferred Ideas (OUT OF SCOPE)
- Self-registration with approval queue (PER-02) — Phase 2
- OAuth / magic link / MFA — out of scope for v1
- Per-school custom subdomains — Phase 8
- Background job for expiring-document notifications — Phase 8
- Audit log retention/archival policy
- Mechanic billing / labor tracking
- Localization beyond English
- Switching email transport
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Multi-tenant Postgres schema with `school_id` on every business table, enforced by RLS | Drizzle `pgPolicy` pattern + JWT-claim policies (Architecture Patterns §RLS); cross-tenant test harness |
| FND-02 | Single-tenant deploy, architecture supports onboarding additional schools without schema changes | RLS pattern is inherently N-tenant; only data differs |
| FND-03 | Audit trail (who/what/when) on every mutation to safety-relevant data | `audit.fn_log_change()` trigger pattern (Code Examples §audit trigger) |
| FND-04 | Append-only event log for maintenance/training records (soft delete only) | `deleted_at` columns + `BEFORE DELETE` exception trigger |
| FND-05 | CI-enforced banned-term lint | Custom ESLint flat-config rule pattern (Code Examples §banned-term rule) |
| FND-06 | Timezone-correct date handling | `timestamptz` schema rule + `date-fns-tz`; per-school + per-user IANA |
| FND-07 | Document storage with expiration tracking | Supabase Storage + signed URL pattern + `documents` table |
| AUTH-01 | Email + password sign-up (admin-invited in v1) | `supabase.auth.admin.inviteUserByEmail()` pattern |
| AUTH-02 | Email verification before account active | Supabase Auth built-in email confirmation flow |
| AUTH-03 | Password reset via email | Supabase Auth built-in password reset flow |
| AUTH-04 | Session persists across browser refresh | `@supabase/ssr` cookie-based session in Next.js App Router |
| AUTH-05 | Log out from any page | `supabase.auth.signOut()` in shared header |
| AUTH-06 | Four roles (Student, Instructor, Mechanic, Admin), users may hold multiple | `user_roles` join table + active-role middleware |
| AUTH-07 | Mechanic distinguishes A&P vs IA | `mechanic_authority` enum on `user_roles` (or users) |
| AUTH-08 | All role-gated UI also enforced server-side | tRPC role-check middleware reading active role from JWT/session |
</phase_requirements>

## Summary

This phase is a "boring on purpose" greenfield bootstrap of the entire chassis: monorepo, Postgres schema with RLS, Supabase Auth wired into JWT claims, an append-only audit-log trigger applied to every safety-relevant table, a custom ESLint rule, document upload with signed URLs, and a CI pipeline that runs a cross-tenant attack test on every PR. Every locked decision is downstream of the project-level research already done (`.planning/research/STACK.md` and `ARCHITECTURE.md`) — this phase is implementation, not selection.

The technical risk concentrates in three places: (1) wiring a custom `school_id` claim into Supabase JWTs so RLS policies can read it (Supabase moved this from "GoTrue hooks" to "Auth Hooks: Custom Access Token" through 2024-2025; current API surface should be re-verified at task time), (2) ensuring `SET LOCAL app.school_id` is set on the **same connection** that runs the query (with Supabase's pooler this means using the **transaction-mode pooler** wrapped in an explicit `db.transaction()` per request), and (3) making the cross-tenant RLS test harness reproducible in CI without flake. Everything else is well-trodden ground.

**Primary recommendation:** Build the Phase 1 deliverable as nine sequential waves: (W0) monorepo skeleton + tooling, (W1) Drizzle schema for tenancy/users/roles/audit/documents/bases, (W2) audit trigger function + attachment helper + soft-delete BEFORE DELETE trigger, (W3) RLS policies + Supabase custom-claim auth hook, (W4) tRPC server with `SET LOCAL` transaction middleware, (W5) Supabase Auth integration + `@supabase/ssr` + admin-invite flow + active-role switcher, (W6) banned-term ESLint rule + Husky, (W7) Supabase Storage `documents` bucket + signed URL endpoint, (W8) cross-tenant RLS Vitest harness + GitHub Actions workflow. Wave 8 must be runnable before any business table is added in Phase 2.

## Standard Stack

### Core (locked by CONTEXT)

| Library | Version (target) | Purpose | Why Standard |
|---|---|---|---|
| Next.js | 15.x (App Router) | Web app + tRPC host route handler | Server Components reduce admin-table JS; same deploy hosts API |
| React | 19.x | UI runtime | Required by Next 15 |
| TypeScript | 5.6+ strict | Type safety | Non-negotiable for safety domain |
| pnpm | 9.x | Package manager | Workspace isolation; required by Turborepo monorepo conventions |
| Turborepo | 2.x | Build orchestration | Task graph + remote cache for CI speed |
| PostgreSQL | 16 (Supabase default) | Primary DB | RLS, `tstzrange`, JSONB |
| Supabase | platform (cloud) | Postgres + Auth + Storage + Realtime | Single vendor; JWT claims integrate with RLS with zero glue |
| Drizzle ORM | 0.36+ (latest at install) | Type-safe SQL + RLS primitives | First-class `pgPolicy` helper |
| drizzle-kit | matching | Migrations | `generate` + `migrate` + `studio` |
| `postgres` (porsager) | 3.x | Postgres driver | Drizzle's recommended driver for Node; supports prepared/transaction mode cleanly |
| `@supabase/supabase-js` | 2.x | Supabase client | Auth API + Storage API |
| `@supabase/ssr` | latest | Cookie-based Supabase session for Next.js App Router | **Replaces deprecated `@supabase/auth-helpers-nextjs`**. Verify at install — this package is the current 2025 standard |
| tRPC | 11.x | End-to-end typed API | Required by CONTEXT |
| `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@trpc/next` | 11.x | tRPC layers | Server, client, React bindings, Next adapter |
| Zod | 3.23+ | Runtime validation | tRPC input + form + Drizzle insert validation |
| `@tanstack/react-query` | 5.x | Client cache | Required by tRPC React bindings |
| date-fns | latest | Date math | Pair with date-fns-tz |
| date-fns-tz | latest | Timezone-aware formatting | Required by FND-06 |

### Supporting

| Library | Purpose | When to Use |
|---|---|---|
| ESLint (flat config) | Lint + custom rule host | `eslint.config.js` in `packages/config` |
| `@typescript-eslint/parser` + plugin | TS support for ESLint | All TS files |
| `eslint-plugin-react` + `eslint-plugin-react-hooks` | React lint | `apps/web` |
| Prettier + `prettier-plugin-tailwindcss` | Formatter | Workspace-wide |
| Husky | Git hooks | `pre-commit` runs lint-staged |
| lint-staged | Targeted lint on staged files | Pre-commit ESLint + Prettier |
| Vitest | Test runner | All packages, including RLS harness |
| `@vitest/coverage-v8` | Coverage | Optional but cheap to wire now |
| dotenv / `@t3-oss/env-nextjs` | Env validation | Type-safe env schema; reserves `ADSB_API_BASE_URL` slot |
| `pdf-lib` / `@react-pdf/renderer` | PDF export | NOT this phase — install in Phase 5 |

### Alternatives Considered (and rejected by CONTEXT)

| Instead of | Could Use | Why Locked Choice Wins |
|---|---|---|
| Drizzle | Prisma | Drizzle has first-class `pgPolicy`; Prisma needs raw-SQL escape hatches for RLS |
| Supabase Auth | Clerk / Auth.js | Supabase JWT integrates directly with RLS — zero glue code |
| `@supabase/ssr` | `@supabase/auth-helpers-nextjs` | Auth helpers package is **deprecated** — `@supabase/ssr` is the current path for App Router |
| Custom audit code in app | Postgres triggers | Triggers cannot be bypassed by application bugs; CONTEXT mandates |
| `timestamp` columns | `timestamptz` | Tz-naive timestamps are Pitfall #6 — silent DST bugs |

**Installation (target shape):**
```bash
# Monorepo bootstrap
pnpm dlx create-turbo@latest part-61-school --skip-install
cd part-61-school
# Configure pnpm-workspace.yaml: apps/*, packages/*

# apps/web
pnpm --filter web add next@15 react@19 react-dom@19 \
  @trpc/server @trpc/client @trpc/react-query @trpc/next \
  @tanstack/react-query zod \
  @supabase/supabase-js @supabase/ssr \
  date-fns date-fns-tz \
  @t3-oss/env-nextjs
pnpm --filter web add -D typescript @types/node @types/react vitest

# packages/db
pnpm --filter @part61/db add drizzle-orm postgres
pnpm --filter @part61/db add -D drizzle-kit @types/node typescript vitest

# packages/api
pnpm --filter @part61/api add @trpc/server zod
# (depends on packages/db)

# packages/config
pnpm --filter @part61/config add -D eslint @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks \
  prettier prettier-plugin-tailwindcss

# Root
pnpm add -Dw turbo husky lint-staged
```

## Architecture Patterns

### Recommended Project Structure

```
part-61-school/
├── apps/
│   └── web/                          # Next.js 15 App Router
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   ├── invite/[token]/page.tsx     # First-visit password set
│       │   │   ├── reset-password/page.tsx
│       │   │   └── verify/page.tsx
│       │   ├── (app)/
│       │   │   ├── layout.tsx                  # Auth gate + active-role switcher
│       │   │   ├── page.tsx                    # Empty role-appropriate dashboard
│       │   │   └── profile/
│       │   │       └── documents/page.tsx      # Upload UI
│       │   └── api/
│       │       ├── trpc/[trpc]/route.ts        # Node runtime
│       │       └── auth/
│       │           └── callback/route.ts       # Supabase OAuth/email callback
│       ├── lib/
│       │   ├── supabase/
│       │   │   ├── server.ts                   # createServerClient (@supabase/ssr)
│       │   │   ├── client.ts                   # createBrowserClient
│       │   │   └── middleware.ts               # Cookie refresh
│       │   └── trpc/
│       │       ├── client.ts
│       │       └── provider.tsx
│       ├── middleware.ts                       # Calls Supabase middleware helper
│       └── next.config.ts
├── packages/
│   ├── db/                                     # Drizzle schema + migrations + RLS
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── tenancy.ts                  # schools, bases
│   │   │   │   ├── users.ts                    # users, user_roles, mechanic_authority enum
│   │   │   │   ├── audit.ts                    # audit_log table + trigger DDL
│   │   │   │   ├── documents.ts                # documents table
│   │   │   │   └── index.ts
│   │   │   ├── policies/                       # pgPolicy definitions per table
│   │   │   ├── functions/                      # SQL files: audit.fn_log_change, BEFORE DELETE
│   │   │   ├── triggers.ts                     # helper to attach audit trigger to a table
│   │   │   ├── client.ts                       # postgres() + drizzle() factory
│   │   │   └── tx.ts                           # withSchoolContext(tx, schoolId, userId)
│   │   ├── migrations/                         # drizzle-kit generated SQL
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── api/                                    # tRPC routers
│   │   ├── src/
│   │   │   ├── trpc.ts                         # initTRPC + context shape
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts                     # Verifies Supabase JWT, loads user
│   │   │   │   ├── tenant.ts                   # Wraps in tx + SET LOCAL
│   │   │   │   ├── role.ts                     # Active-role check
│   │   │   │   └── audit.ts                    # Sets app.user_id for trigger
│   │   │   ├── routers/
│   │   │   │   ├── auth.ts                     # invite, switchRole, me
│   │   │   │   ├── documents.ts                # upload (signed URL), list, signedDownload
│   │   │   │   └── _root.ts
│   │   │   └── procedures.ts                   # publicProcedure, protectedProcedure, adminProcedure
│   │   └── package.json
│   ├── domain/                                 # Pure TS types + zod schemas
│   │   ├── src/
│   │   │   ├── roles.ts                        # Role enum + guards
│   │   │   ├── timezones.ts                    # IANA validation
│   │   │   └── documents.ts                    # DocumentKind enum + zod
│   │   └── package.json
│   └── config/                                 # Shared tsconfig, eslint, banned-term rule
│       ├── tsconfig.base.json
│       ├── eslint.config.js                    # Flat config, exports preset
│       ├── eslint-rules/
│       │   └── no-banned-terms.js              # Custom rule
│       ├── banned-terms.json                   # ["Part 141", "approved", "certified course"]
│       ├── prettier.config.js
│       └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml                              # install → typecheck → lint → test → build
├── tests/                                      # Cross-tenant RLS harness (top-level so any pkg can register)
│   └── rls/
│       ├── harness.ts                          # seedTwoSchools, asUser
│       ├── registry.ts                         # tables register here from packages/db
│       └── cross-tenant.test.ts
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .nvmrc
├── .env.example
└── CLAUDE.md
```

### Pattern 1: Drizzle `pgPolicy` for RLS Keyed on JWT Claim

**What:** Every business table declares its RLS policies inline in the Drizzle schema using `pgPolicy`. Policies read `auth.jwt() ->> 'school_id'` directly, so the policy is enforced regardless of how the query reaches Postgres (tRPC, Supabase client, or psql with the right JWT).

**When to use:** Every table that has a `school_id` column. Always.

**Example shape (verify exact API at install — Drizzle's RLS helpers were stabilized late 2024 / early 2025 and the import path may differ slightly):**
```typescript
// packages/db/src/schema/documents.ts
// Source: https://orm.drizzle.team/docs/rls (verify current syntax at install)
import { pgTable, uuid, text, timestamp, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authenticatedRole } from 'drizzle-orm/supabase'; // verify import path

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  kind: text('kind', { enum: ['medical', 'pilot_license', 'government_id', 'insurance'] }).notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  pgPolicy('documents_select_own_school', {
    as: 'permissive',
    for: 'select',
    to: authenticatedRole,
    using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
  }),
  pgPolicy('documents_insert_own_school', {
    as: 'permissive',
    for: 'insert',
    to: authenticatedRole,
    withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
  }),
  // ...update / delete policies
]);
```

**Critical:** Tables must have `ENABLE ROW LEVEL SECURITY` set. Drizzle's `pgPolicy` declaration triggers this automatically when migrations are generated, but verify the migration SQL on first run.

### Pattern 2: Custom `school_id` Claim via Supabase Auth Hook

**What:** Supabase JWTs do not include arbitrary application claims by default. To put `school_id`, `roles[]`, and `active_role` into the JWT (so RLS policies can read them with `auth.jwt() ->> 'school_id'`), register a **Custom Access Token hook** — a Postgres function that Supabase Auth invokes whenever it mints/refreshes an access token.

**When to use:** Once, in Wave 3. Every signed-in user gets the hook applied automatically.

**Example shape (verify against current Supabase docs at task time — this API surface stabilized in 2024 but specifics like the function signature, the JSON shape returned, and the dashboard registration UI vs SQL `ALTER FUNCTION` setup have iterated):**
```sql
-- Source: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook (verify at task time)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  v_school_id uuid;
  v_roles text[];
  v_active_role text;
begin
  -- Look up the user's school + roles
  select u.school_id, array_agg(ur.role), max(ur.role) filter (where ur.is_default)
    into v_school_id, v_roles, v_active_role
    from public.users u
    left join public.user_roles ur on ur.user_id = u.id
    where u.id = (event->>'user_id')::uuid
    group by u.school_id;

  claims := event->'claims';
  claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id));
  claims := jsonb_set(claims, '{roles}', to_jsonb(v_roles));
  claims := jsonb_set(claims, '{active_role}', to_jsonb(coalesce(v_active_role, v_roles[1])));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Grant + register the hook (via dashboard or SQL — verify mechanism)
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

**Active-role switching:** The active role is one of two patterns — pick one and document:

1. **Server-side cookie/session, NOT in JWT** (recommended for v1): the active role lives in a Next.js cookie set by a tRPC `auth.switchRole` mutation. The tRPC `tenant` middleware reads it, validates it against the JWT's `roles[]`, and `SET LOCAL app.active_role = ?`. Pro: no JWT refresh needed to switch. Con: RLS policies that key on role can't read it directly via `auth.jwt()` — they read `current_setting('app.active_role')` instead.
2. **JWT custom claim, refreshed on switch:** force a token refresh after switching roles so the new JWT carries `active_role`. RLS reads `auth.jwt() ->> 'active_role'`. Pro: single source of truth in the JWT. Con: a token-refresh round trip on every switch; tokens issued before the switch are still valid until they expire (1 hour).

**Recommendation:** Pattern 1 (cookie + `SET LOCAL`) for v1 because the `SET LOCAL` middleware exists anyway and the active role is mostly used by application/tRPC permission checks, not directly in RLS policy SQL. Document the choice.

### Pattern 3: `SET LOCAL` Tenant Context via Drizzle Transaction Middleware

**What:** Every tRPC procedure that touches the DB runs inside a `db.transaction()` whose first statements are `SET LOCAL app.school_id = ?`, `SET LOCAL app.user_id = ?`, `SET LOCAL app.active_role = ?`. This serves three purposes: (1) defense-in-depth — if RLS is mis-configured on a table, the app-supplied `school_id` filter still applies via any policy that reads `current_setting('app.school_id')`; (2) feeds the audit trigger function (`audit.fn_log_change()` reads `current_setting('app.user_id')` to populate the `user_id` column); (3) makes the active role available to triggers and check constraints.

**When to use:** Every authenticated tRPC call. Public procedures (login, password reset) skip the middleware.

**Critical:** `SET LOCAL` is scoped to the **current transaction**. With Supabase's connection pooler in **transaction mode** (port 6543), each transaction gets a fresh connection from the pool with no leakage — this is what you want. **Do NOT use session-mode pooling** for the app tier.

```typescript
// packages/api/src/middleware/tenant.ts
// Source: project research/ARCHITECTURE.md Pattern 2 + Drizzle docs
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db/client';
import { t } from '../trpc';

export const withTenantTx = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const { schoolId, userId, activeRole } = ctx.session;

  return await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`select set_config('app.active_role', ${activeRole}, true)`);
    return next({ ctx: { ...ctx, tx } });
  });
});

export const protectedProcedure = t.procedure.use(withTenantTx);
```

Note: `set_config(name, value, true)` is the function form of `SET LOCAL` and is parameterizable; raw `SET LOCAL` cannot bind parameters.

### Pattern 4: Generic Audit Trigger Function

**What:** A single PL/pgSQL function `audit.fn_log_change()` is attached as `AFTER INSERT OR UPDATE OR DELETE` (with the `DELETE` branch handling soft-delete by reading `OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL`) to every safety-relevant table. The function reads `TG_OP`, `TG_TABLE_NAME`, `OLD`, `NEW`, and `current_setting('app.school_id')` / `current_setting('app.user_id')` / `current_setting('app.active_role')`, then inserts a row into `audit_log`.

**When to use:** On every safety-relevant table. Helper function `attachAuditTrigger(tableName)` runs the same `CREATE TRIGGER` DDL so the schema-PR template can require it.

```sql
-- Source: composed from Postgres trigger docs + project decisions
create schema if not exists audit;

create table public.audit_log (
  id bigserial primary key,
  school_id uuid not null,
  user_id uuid,
  actor_role text,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','soft_delete')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_user_at_idx on public.audit_log (user_id, at);
create index audit_log_school_at_idx on public.audit_log (school_id, at);

create or replace function audit.fn_log_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_id uuid := nullif(current_setting('app.school_id', true), '')::uuid;
  v_user_id   uuid := nullif(current_setting('app.user_id',   true), '')::uuid;
  v_role      text := nullif(current_setting('app.active_role', true), '');
  v_record_id uuid;
  v_action    text;
  v_before    jsonb;
  v_after     jsonb;
begin
  if (tg_op = 'INSERT') then
    v_record_id := (to_jsonb(new) ->> 'id')::uuid;
    v_action := 'insert';
    v_before := null;
    v_after := to_jsonb(new);
  elsif (tg_op = 'UPDATE') then
    v_record_id := (to_jsonb(new) ->> 'id')::uuid;
    -- Soft-delete detection
    if (to_jsonb(old) ? 'deleted_at')
       and (old.deleted_at is null) and (new.deleted_at is not null) then
      v_action := 'soft_delete';
    else
      v_action := 'update';
    end if;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  elsif (tg_op = 'DELETE') then
    -- Hard delete should be impossible on protected tables (BEFORE DELETE trigger raises),
    -- but in case a non-protected table is attached, record it.
    v_record_id := (to_jsonb(old) ->> 'id')::uuid;
    v_action := 'soft_delete'; -- treat as soft for audit purposes; or extend enum
    v_before := to_jsonb(old);
    v_after := null;
  end if;

  insert into public.audit_log (school_id, user_id, actor_role, table_name, record_id, action, before, after)
  values (
    coalesce(v_school_id, (v_after->>'school_id')::uuid, (v_before->>'school_id')::uuid),
    v_user_id,
    v_role,
    tg_table_name,
    v_record_id,
    v_action,
    v_before,
    v_after
  );
  return coalesce(new, old);
end;
$$;

-- Append-only enforcement: revoke + RLS
revoke update, delete on public.audit_log from public, authenticated, anon;
alter table public.audit_log enable row level security;
create policy audit_log_select_own_school on public.audit_log
  for select to authenticated
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);
create policy audit_log_insert_trigger_only on public.audit_log
  for insert to authenticated
  with check (false); -- triggers run as definer, bypass; clients cannot insert
```

**Helper to attach:**
```sql
-- Run from migration or via packages/db helper
create or replace function audit.attach(table_name text)
returns void language plpgsql as $$
begin
  execute format(
    'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function audit.fn_log_change()',
    table_name, table_name);
end;
$$;
```

### Pattern 5: Hard-Delete Prevention Trigger

```sql
-- Source: composed from Postgres trigger docs + CONTEXT decision
create or replace function public.fn_block_hard_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Hard delete is not permitted on table %. Use soft delete (set deleted_at).', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- Attach to every protected table
create trigger documents_block_hard_delete before delete on public.documents
  for each row execute function public.fn_block_hard_delete();
```

For Phase 1, attach to: `documents` (and any other table that gets a `deleted_at`). The schema-PR template adds this requirement.

### Pattern 6: Banned-Term ESLint Rule (Flat Config)

**What:** A custom ESLint rule that walks `Literal` (string), `TemplateElement`, and `JSXText` AST nodes, matches them against a regex compiled from `banned-terms.json`, and reports failures with a code-frame message. Allowlist comments take the form `// allow-banned-term: <reason>` on the line above.

```javascript
// packages/config/eslint-rules/no-banned-terms.js
// Source: ESLint custom-rule docs https://eslint.org/docs/latest/extend/custom-rules
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TERMS = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'banned-terms.json'), 'utf8')
);
const PATTERN = new RegExp(
  '\\b(' + TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'i'
);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow banned terms in user-facing strings (Part 61 terminology contract)',
    },
    schema: [],
    messages: {
      banned: 'Banned term "{{term}}" found. See packages/config/banned-terms.json. Use "{{suggestion}}" or add // allow-banned-term: <reason>.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    function hasAllowComment(node) {
      const comments = sourceCode.getCommentsBefore(node);
      return comments.some(c => /allow-banned-term:\s*\S/.test(c.value));
    }

    function check(node, value) {
      if (typeof value !== 'string') return;
      const m = value.match(PATTERN);
      if (!m) return;
      if (hasAllowComment(node)) {
        // CI surfaces these for audit (collect via formatter or post-process)
        return;
      }
      context.report({
        node,
        messageId: 'banned',
        data: { term: m[1], suggestion: '141-style / structured / internal review' },
      });
    }

    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value && node.value.cooked);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
```

**Flat-config wiring:**
```javascript
// packages/config/eslint.config.js
import noBannedTerms from './eslint-rules/no-banned-terms.js';

export default [
  {
    files: ['apps/web/**/*.{ts,tsx,jsx}', 'apps/web/templates/**/*', 'packages/exports/**/*'],
    ignores: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*', '.planning/**'],
    plugins: {
      'part61': { rules: { 'no-banned-terms': noBannedTerms } },
    },
    rules: {
      'part61/no-banned-terms': 'error',
    },
  },
];
```

### Pattern 7: Cross-Tenant RLS Test Harness (Vitest)

**What:** A Vitest suite that, in `beforeAll`, spins up two test schools (A and B), seeds one row of every registered table for each, signs in as a user belonging to school A, and asserts that `select` and `update` against school B's rows returns 0 rows / 0 affected. Tables register themselves via a registry import so adding a new table to `packages/db` automatically gets coverage.

**Local DB:** Use the Supabase CLI (`supabase start`) to run a local Postgres + GoTrue stack. CI uses the same CLI to spin up the stack inside the GitHub Actions runner (the CLI works in CI; alternatively use `docker compose` against the official `supabase/postgres` image).

```typescript
// tests/rls/registry.ts
export interface RlsTestableTable {
  name: string;
  seed: (db: PgDatabase, schoolId: string, userId: string) => Promise<{ id: string }>;
}
export const tables: RlsTestableTable[] = [];
export function registerForRlsTest(t: RlsTestableTable) { tables.push(t); }

// tests/rls/cross-tenant.test.ts
import { describe, it, beforeAll, expect } from 'vitest';
import { tables } from './registry';
import { seedTwoSchools, asUserOf, dbAsAnon } from './harness';

let schoolA: string, schoolB: string, userA: string, userB: string;

beforeAll(async () => {
  ({ schoolA, schoolB, userA, userB } = await seedTwoSchools());
});

describe.each(tables)('cross-tenant isolation: $name', (table) => {
  it('user from school A cannot SELECT school B rows', async () => {
    const recA = await table.seed(dbAsAnon, schoolA, userA);
    const recB = await table.seed(dbAsAnon, schoolB, userB);

    const dbA = asUserOf(userA);
    const visible = await dbA.execute(
      sql`select id from ${sql.identifier(table.name)} where id = ${recB.id}`
    );
    expect(visible.rows).toHaveLength(0);

    // Sanity: school A user CAN see their own row
    const own = await dbA.execute(
      sql`select id from ${sql.identifier(table.name)} where id = ${recA.id}`
    );
    expect(own.rows).toHaveLength(1);
  });

  it('user from school A cannot UPDATE school B rows', async () => {
    // similar shape; assert 0 rows updated
  });
});
```

The harness `asUserOf(userId)` mints a JWT with `school_id` set, opens a Postgres connection with the JWT as `request.jwt.claims` via the `pgjwt` setting that Supabase uses, then runs queries through that connection. Reference Supabase's own RLS testing examples at https://github.com/supabase/supabase/tree/master/supabase/tests for the exact connection-setup pattern.

### Pattern 8: Supabase Storage with Path-Prefix RLS + Server-Side Signed URLs

**What:** A single `documents` bucket. Upload through tRPC (server validates permissions, computes the path `school_{id}/user_{id}/{document_id}.{ext}`, creates a signed **upload** URL via `supabase.storage.from('documents').createSignedUploadUrl(path)`, returns it to the client; client PUTs the file directly to Storage). Download is server-mediated: client calls a tRPC procedure, server checks the row in `documents` table against the requesting user's RLS, then calls `createSignedUrl(path, 300)` (5-minute TTL) and returns the URL.

Bucket-level RLS policies use Supabase Storage's SQL policy table `storage.objects` and key off the path prefix:

```sql
-- Source: https://supabase.com/docs/guides/storage/security/access-control
-- Verify exact policy syntax and that storage.foldername() / storage.filename() helpers exist
create policy "documents_select_own_school" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('school_' || (auth.jwt() ->> 'school_id'))
  );

create policy "documents_insert_own_school_user" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('school_' || (auth.jwt() ->> 'school_id'))
    and (storage.foldername(name))[2] = ('user_' || (auth.uid())::text)
  );
```

MIME-type allowlist and max-size are enforced both client-side (UI) and server-side (tRPC validates `mimeType` and `byteSize` against an allowlist of `image/jpeg`, `image/png`, `application/pdf` and a max of, say, 25 MB before issuing the signed upload URL).

### Pattern 9: Admin-Invited Signup Flow

```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
import { createClient } from '@supabase/supabase-js';

// SERVER ONLY — uses service role key
const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// In an admin tRPC procedure:
const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/invite/accept`,
  data: { invited_role: input.role, invited_school_id: ctx.session.schoolId },
});
```

The redirect lands on `/invite/accept`, which contains a Supabase-Auth-flow handler that prompts the new user to set a password via `supabase.auth.updateUser({ password })`. Custom email template is set in Supabase Dashboard → Authentication → Email Templates → "Invite user".

### Anti-Patterns to Avoid

- **Service-role key in app code:** Never use the service role key from `apps/web` server code except in tightly-scoped admin procedures (invite, role assignment). The service role bypasses RLS — using it as a default driver makes RLS theater.
- **`supabase-js` for normal data access from tRPC:** Use Drizzle for the app's data access. `supabase-js` is for Auth + Storage only. Two query paths means two RLS configurations to keep in sync.
- **`SET LOCAL` outside a transaction:** It's a no-op (or session-wide if a session existed). Always wrap in `db.transaction`.
- **Session-mode connection pooler for app tier:** Causes leaked `app.*` settings between requests.
- **Triggers attached only to some safety-relevant tables:** The schema-PR template enforces "every protected table has audit + (where applicable) hard-delete-block triggers." Make this a checklist item.
- **JSX text containing banned terms behind a variable:** The lint rule scans literals — if a banned term comes from a `t()` translation function or a constants file, the rule misses it. Mitigate by also linting `packages/config` constants files and any `i18n/` directory.
- **Auto-correcting allow-banned-term comments:** Allowlist must be explicit and reasoned. Never auto-fix.
- **Using the deprecated `@supabase/auth-helpers-nextjs` package:** It still installs but is no longer the recommended path for App Router. Use `@supabase/ssr`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Audit logging from app code | App-level "audit middleware" that writes to `audit_log` after each mutation | Postgres `audit.fn_log_change()` trigger | Triggers cannot be bypassed by an app bug or a bypass-RLS path. CONTEXT mandates |
| Multi-tenant isolation | `WHERE school_id = ?` in every query | Postgres RLS via `pgPolicy` | Single missed `WHERE` → cross-tenant leak. RLS is the only place the constraint can't be forgotten |
| JWT verification | Custom JWT verification | `@supabase/ssr` cookie-session helpers + Supabase's built-in JWT signing | Signing keys, refresh, expiry handled |
| Password reset / email verification flows | Custom email + token tables | Supabase Auth built-in flows | Battle-tested, includes rate limiting |
| Signed URL generation for downloads | Pre-signing AWS S3 URLs by hand | `supabase.storage.from(bucket).createSignedUrl(path, ttl)` | Correct signing, supports bucket RLS |
| Role-gating in UI only | Client-side `if (role === 'admin')` | tRPC role-check middleware (server) + UI hide for cosmetics | UI hiding is not security (AUTH-08) |
| Timezone math | `new Date(...)` arithmetic across DST | `date-fns-tz` `formatInTimeZone`, `zonedTimeToUtc`, `utcToZonedTime` | DST + non-DST zones (Phoenix, Indianapolis) are silent killers |
| Cross-tenant test fixtures | Hand-written per-table tests | A registry pattern (Pattern 7) where every new table auto-registers | Phase 2+ adds 40+ tables; manual coverage will rot |
| Custom ESLint rule loader | Importing rules through a plugin npm package | Inline rule + flat-config object literal | Local rule, no need to publish |
| Email transport | SMTP setup, SPF/DKIM tuning | Supabase built-in SMTP for v1 | Adequate for partner-school volume |

**Key insight:** Phase 1 should consist almost entirely of *configuration of existing primitives* (Drizzle, Supabase, ESLint, Postgres triggers, GitHub Actions), with custom code only at the seams (tenant middleware, banned-term rule, audit trigger function, RLS test harness). If a task starts looking like "let's build a small framework for X," reread CONTEXT.md.

## Common Pitfalls

### Pitfall 1: `SET LOCAL` does not survive across pooled connections in session mode
**What goes wrong:** `set_config('app.school_id', ..., true)` is set at the start of a tRPC call, but a subsequent statement in the same logical request lands on a different physical connection (because the Supabase pooler in session mode hands out connections per *connection*, not per *transaction*), and the new connection has no `app.school_id`. Audit rows get NULL school_id; RLS policies that read it deny everything.
**Why it happens:** Default Supabase URL is the session-mode pooler unless you explicitly choose the transaction-mode endpoint (`:6543`).
**How to avoid:** Use the **transaction-mode pooler** (`postgresql://...:6543/postgres?...`) for the app's runtime DB connection. Use the direct (non-pooled) connection only for migrations (drizzle-kit needs prepared statements which are unsupported in transaction mode).
**Warning signs:** Audit rows with NULL `school_id`; intermittent RLS failures under load; works in dev (single connection), fails in prod.

### Pitfall 2: RLS bypass via service role
**What goes wrong:** A developer reaches for `createClient(url, SERVICE_ROLE_KEY)` to "make a query work" while debugging. The service role bypasses RLS. The bypass ships to production.
**How to avoid:** Lint rule or grep gate in CI that fails any import of `SUPABASE_SERVICE_ROLE_KEY` outside an allowlisted set of files (admin invite procedure, migrations). Never read the service role key in `apps/web` client code under any circumstance.
**Warning signs:** New env var usage appearing in PRs; tests pass without RLS being enabled.

### Pitfall 3: Drizzle-generated migrations don't enable RLS
**What goes wrong:** `pgPolicy` declarations create policies, but if `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` isn't in the generated migration, policies sit dormant — every query succeeds without filtering.
**How to avoid:** Inspect every generated migration before applying. The cross-tenant test harness (Pattern 7) catches this immediately, which is why it must run on every PR. Add a SQL assertion to the harness: `select relname from pg_class where relrowsecurity = false and relkind = 'r' and relnamespace = 'public'::regnamespace` should return only allowlisted tables.

### Pitfall 4: Custom claim hook not registered or wrong shape
**What goes wrong:** The hook function exists but isn't registered with Supabase Auth (registration is a separate step in the Dashboard → Auth → Hooks UI, OR via SQL on the auth schema — the mechanism has shifted across Supabase versions). Users sign in but the JWT has no `school_id` claim. RLS denies everything.
**How to avoid:** Registration is part of the migration / setup script, not a manual step. Add a smoke test to the RLS harness: sign in as a seeded user, decode the JWT, assert `school_id` claim is present.
**Warning signs:** "Why am I locked out of my own data?" in dev; works after manually editing the Dashboard.

### Pitfall 5: Audit trigger fires during seed/migration with NULL `app.user_id`
**What goes wrong:** Drizzle migrations or test seeds insert rows; trigger fires and `current_setting('app.user_id', true)` returns empty; audit row has NULL `user_id`. Some columns may be NOT NULL → migration fails.
**How to avoid:** Either (a) the audit_log columns `school_id` and `user_id` are nullable (school_id falls back to row data), or (b) seed/migration code calls `set_config('app.user_id', '<system uuid>', false)` once per session before running. Document which.

### Pitfall 6: Banned-term rule misses interpolated strings
**What goes wrong:** `<p>{`Welcome to ${schoolName}'s ${courseType} course`}</p>` where `courseType` comes from a constants file containing "approved". The rule scans the JSX text and the literal — both look clean. The banned word ships.
**How to avoid:** Lint constants files and any string-table modules with the same rule. Add an end-to-end test that renders all role-default dashboards and greps the rendered HTML for banned terms (cheap belt-and-suspenders).

### Pitfall 7: Supabase Storage path policies don't match path generation
**What goes wrong:** Server generates path `school_uuid/user_uuid/file.pdf` (with the literal `school_uuid`/`user_uuid` strings dropped), but the policy expects `school_<uuid>/user_<uuid>/`. Upload succeeds (no policy violation), download policy fails. Or vice versa.
**How to avoid:** Path generation lives in a single helper in `packages/api`, not duplicated in client code. The signed-upload tRPC endpoint is the **only** place that constructs an upload path. Add an integration test that uploads and downloads as user A and as user B.

### Pitfall 8: BEFORE DELETE trigger blocks legitimate cascade
**What goes wrong:** A school is "deleted" (the only legitimate hard-delete in the system is dev/test cleanup) and the cascade tries to remove documents → the BEFORE DELETE trigger raises → cleanup fails.
**How to avoid:** Test fixtures tear down with `TRUNCATE ... CASCADE` (which bypasses BEFORE DELETE row triggers) or a helper that drops the trigger temporarily inside a transaction.

### Pitfall 9: tRPC context not passing the active role to the audit trigger
**What goes wrong:** `app.active_role` is set in the middleware, but a follow-up service function opens a new connection (e.g., a background callback on upload) where `app.active_role` is empty. Audit row has `actor_role = NULL`.
**How to avoid:** All DB writes inside a request must go through the same `tx` provided by `withTenantTx`. Background work (Phase 8 jobs) sets its own `app.user_id = '<system>'` and `app.active_role = 'system'`.

### Pitfall 10: Connection string mixup between drizzle-kit (migrations) and runtime
**What goes wrong:** Drizzle-kit migration commands point at the transaction-mode pooler (which doesn't support some prepared-statement / DDL operations) and migrations fail with confusing errors. Or runtime points at the direct connection and exhausts the connection limit.
**How to avoid:** Two env vars: `DATABASE_URL` (transaction-mode pooler, runtime) and `DIRECT_DATABASE_URL` (direct, drizzle-kit). Document in `.env.example`.

## Code Examples

(All code examples above in **Architecture Patterns** are also reference code for the planner. Highlights repeated here for quick scan.)

### Drizzle client factory with transaction-mode pooler

```typescript
// packages/db/src/client.ts
// Source: https://orm.drizzle.team/docs/get-started-postgresql + Supabase pooler docs
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, {
  prepare: false, // required for Supabase transaction-mode pooler
});
export const db = drizzle(client, { schema });
```

### tRPC root router shape

```typescript
// packages/api/src/trpc.ts
// Source: https://trpc.io/docs/server/routers
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Session } from './session';

export interface Context {
  session: Session | null;
  // tx injected by withTenantTx middleware
}

export const t = initTRPC.context<Context>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
```

### Supabase server client (Next.js App Router)

```typescript
// apps/web/lib/supabase/server.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value; },
        set(name, value, options) { cookieStore.set({ name, value, ...options }); },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}
```

### `turbo.json` task graph

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"] },
    "db:generate": { "cache": false },
    "db:migrate":  { "cache": false }
  }
}
```

### GitHub Actions CI

```yaml
# .github/workflows/ci.yml
# Source: composed from pnpm + Turborepo + Supabase CLI docs
name: CI
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: pnpm db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:54322/postgres
          DIRECT_DATABASE_URL: postgresql://postgres:postgres@localhost:54322/postgres
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | Auth helpers package is deprecated. Use `@supabase/ssr` for App Router. |
| ESLint legacy `.eslintrc` | ESLint flat config (`eslint.config.js`) | ESLint 9, 2024 | Custom rules now exported as objects, no plugin scaffolding required for local rules. |
| Drizzle raw SQL for RLS | `pgPolicy` helper | Drizzle 0.33+ (late 2024) | Policies live alongside the schema. **Verify import path at install — has moved.** |
| Supabase JWT custom claims via GoTrue hooks | Supabase Auth Hooks: Custom Access Token | 2024 | Function-based hook registered in dashboard or via SQL. |
| `node-postgres` (`pg`) | `postgres` (porsager) | Drizzle docs current default, 2024 | Faster, smaller, supports `prepare: false` cleanly for transaction-mode pooling. |
| Session-mode connection pooler | Transaction-mode pooler (port 6543) for app tier | Supabase Supavisor rollout, 2023+ | Required for `SET LOCAL` to be safe under concurrency. |

**Deprecated/outdated (do not use):**
- `@supabase/auth-helpers-nextjs` — replaced by `@supabase/ssr`.
- ESLint `.eslintrc` style configs — use flat config.
- Storing the service role key in any client-bundled env var (`NEXT_PUBLIC_*`) — production accident waiting to happen.

## Open Questions

1. **Drizzle `pgPolicy` exact import path and current shape**
   - What we know: Drizzle has first-class RLS support as of 0.33+.
   - What's unclear: Whether helpers like `authenticatedRole` come from `drizzle-orm/supabase` or a different submodule, and whether the `withCheck` vs `using` parameters are spelled identically to the example above.
   - Recommendation: First task in Wave 1 verifies against `pnpm view drizzle-orm` + the live https://orm.drizzle.team/docs/rls page. Adjust schema files before proceeding.

2. **Custom Access Token hook registration mechanism**
   - What we know: Supabase supports a Postgres-function-based custom access token hook.
   - What's unclear: Whether registration is dashboard-only, SQL-only, or both; and whether the function signature is exactly `(event jsonb) returns jsonb` in the current release.
   - Recommendation: Wave 3 task starts by reading the current https://supabase.com/docs/guides/auth/auth-hooks page. Build a smoke test that decodes a freshly-issued JWT and asserts the custom claims are present.

3. **Active-role storage location: cookie vs JWT claim**
   - What we know: Both work; CONTEXT says "stored in session, not URL."
   - What's unclear: Whether the planner should commit to cookie (Pattern 2 option 1) or JWT refresh (Pattern 2 option 2).
   - Recommendation: Default to cookie + `SET LOCAL app.active_role` for v1. Document the choice in `apps/web/lib/supabase/README.md`. Revisit in Phase 2 if any RLS policy needs to read the active role directly via `auth.jwt()`.

4. **`audit_log.user_id` nullability for system writes**
   - What we know: Migrations and seeds will write rows before any user is signed in.
   - What's unclear: Whether `user_id` is nullable (allows system writes with NULL) or NOT NULL (forces seeds to set `app.user_id` to a system UUID).
   - Recommendation: Make `user_id` nullable; add an `actor_kind` column (`user | system | trigger_seed`) for clarity. Cheaper than threading a system UUID through every seed.

5. **Supabase Storage signed-upload-URL TTL and overwrite semantics**
   - What we know: `createSignedUploadUrl` exists and produces a one-time-use URL.
   - What's unclear: Default TTL, whether the URL allows overwrite, max file size enforced at the bucket level vs the request level.
   - Recommendation: Set bucket-level max object size in Supabase Dashboard → Storage settings during Wave 7. Verify in an integration test.

6. **CI database: Supabase CLI vs raw Postgres image**
   - What we know: Supabase CLI works in CI but adds ~30s of cold start.
   - What's unclear: Whether the RLS harness needs the GoTrue auth server (yes — to mint JWTs) or whether we can mock JWTs locally with the right shared secret.
   - Recommendation: Use Supabase CLI in CI for fidelity. Optimize later if CI time becomes a bottleneck.

## Sources

### Primary (HIGH confidence — verified during project research, see `.planning/research/STACK.md` and `ARCHITECTURE.md`)
- Project research: `.planning/research/STACK.md` — stack rationale, version targets, "What NOT to use"
- Project research: `.planning/research/ARCHITECTURE.md` — RLS pattern, EXCLUDE constraint, append-only ledger, Pattern catalog
- Project research: `.planning/research/PITFALLS.md` — terminology contract, immutability, scheduling concurrency, ADS-B TOS
- Drizzle ORM docs — https://orm.drizzle.team/ (RLS, postgres-js driver, drizzle-kit migrations)
- Supabase docs — https://supabase.com/docs (Auth hooks, RLS, Storage policies, `@supabase/ssr`, transaction-mode pooler)
- Postgres docs — https://www.postgresql.org/docs/current/ (triggers, RLS, `set_config`, `tstzrange`)
- tRPC docs — https://trpc.io/docs (router, middleware, Next.js adapter)
- ESLint custom rules — https://eslint.org/docs/latest/extend/custom-rules

### Secondary (MEDIUM confidence — well-known patterns from training data, verify at task time)
- Supabase Custom Access Token Hook page (function shape and registration mechanism shifted through 2024-2025)
- Drizzle `pgPolicy` exact import path (`drizzle-orm/supabase` vs `drizzle-orm/pg-core`)
- `@supabase/ssr` cookie helper API (replaced auth-helpers-nextjs in 2024)

### Tertiary (LOW confidence — flagged for in-task verification)
- Exact wording of the Drizzle-Supabase `authenticatedRole` import (may be `authenticatedRole` from `drizzle-orm/supabase` or `sql\`authenticated\`` literal — verify on first generation)
- Supabase Storage `storage.foldername()` helper exact return shape

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every major component is locked by CONTEXT and reconfirmed by project research
- Architecture: HIGH for RLS / audit / signed URLs (well-documented patterns); MEDIUM for the exact Drizzle `pgPolicy` syntax and Supabase custom-claim hook registration mechanism (these surfaces moved in 2024-2025; verify at task time)
- Pitfalls: HIGH — drawn from project pitfalls research and common Supabase/Drizzle gotchas; pooler-mode pitfall and service-role-bypass pitfall in particular have caused real production incidents in the ecosystem

**Research date:** 2026-04-06
**Valid until:** ~2026-05-06 (30 days; Drizzle and Supabase release frequently — re-verify on Wave 1 kickoff)
