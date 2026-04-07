# Part 61 School

Single source of truth for a Part 61 flight school: fleet, training, scheduling, and records.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo (`apps/*`, `packages/*`)
- **Web:** Next.js 15 (App Router) + React 19 + TypeScript 5.6 strict
- **DB / Auth / Storage:** Supabase (managed Postgres + Auth + Storage)
- **ORM:** Drizzle (RLS-first via `pgPolicy`)
- **API:** tRPC (per-procedure middleware for role + RLS context)
- **Lint/Format:** ESLint flat config + Prettier
- **CI:** GitHub Actions: install -> typecheck -> lint -> test -> build
- **Hooks:** Husky + lint-staged on pre-commit

## Workspaces

- `apps/web` — Next.js app
- `packages/db` — Drizzle schema, migrations, RLS policies (Phase 2+)
- `packages/api` — tRPC routers + middleware (Phase 2+)
- `packages/domain` — Shared TS types and zod schemas
- `packages/config` — Shared tsconfig, prettier, eslint (incl. custom `no-banned-terms`)

## Banned-Term Rule (FND-05)

The custom ESLint rule `part61/no-banned-terms` blocks the words listed in
`packages/config/banned-terms.json` ("Part 141", "approved", "certified course")
in any UI string literal, JSX text, or template element. The rule fires at
`error` severity inside `apps/web/**` and `packages/exports/**`. To allow a
single intentional use, place a `// allow-banned-term: <reason>` comment on the
line above. Adding to the banned list does not require code changes.

## Database Connection Contract

- `DATABASE_URL` MUST be the **transaction-mode** Supabase pooler (`:6543`).
- `DIRECT_DATABASE_URL` MUST be the **direct** connection used only for
  Drizzle Kit migrations and DDL.
- See `.env.example` for the full env contract.

## Soft-Delete & Audit Contract (forward-looking)

- Maintenance, training, and safety-relevant tables get a `deleted_at` column
  from day one. A `BEFORE DELETE` trigger raises an exception — hard delete is
  impossible.
- Every safety-relevant table is wired to `audit.fn_log_change()` via trigger.
- The `audit_log` table is append-only via RLS — INSERT is the only allowed verb.

## Conventions

- All timestamps are `timestamptz`. Display via `date-fns-tz` with explicit zones.
- All multi-tenant queries are RLS-enforced AND wrapped in `SET LOCAL app.school_id = ?`.
- TypeScript strict mode is non-negotiable. `noUncheckedIndexedAccess` is on.

## Planning Documents

Full project context lives in `.planning/`:

- `PROJECT.md` — Vision and constraints
- `REQUIREMENTS.md` — All v1 requirements (FND, AUTH, PER, ...)
- `ROADMAP.md` — Phase plan
- `phases/` — Per-phase context, research, plans, and summaries
