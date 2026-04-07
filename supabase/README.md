# Supabase local stack

This directory holds the Supabase CLI configuration for local
development. The actual Postgres schema lives in
`../packages/db/migrations/`; this directory only configures the local
stack (ports, auth hook registration, seed data).

## Quick start

```bash
pnpm dlx supabase start
export DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
export DIRECT_DATABASE_URL=$DATABASE_URL
pnpm --filter @part61/db exec drizzle-kit migrate
pnpm --filter @part61/rls-tests test
```

## Custom access token hook

`config.toml` registers `public.custom_access_token_hook` (defined in
the initial migration) under `[auth.hook.custom_access_token]`. If the
installed Supabase CLI version does not honor this section:

1. `supabase start` will succeed but JWTs will lack `school_id` / `roles`
   / `active_role` claims.
2. The cross-tenant RLS test harness will fail its JWT smoke test —
   that's the loud failure mode we want.
3. To fix manually for **hosted** Supabase: Dashboard → Authentication
   → Hooks → "Custom Access Token" → select
   `public.custom_access_token_hook`.

## Seeds

`seed.sql` is loaded automatically by `supabase db reset`. It creates
two schools and one admin user per school (UUIDs hard-coded so the RLS
harness can match against them). Both audit and block-hard-delete
triggers are temporarily disabled during seeding via
`session_replication_role = replica`.
