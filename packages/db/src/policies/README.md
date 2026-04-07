# RLS Policies

Phase 1 declares all RLS policies inline in the Drizzle schema using
`pgPolicy(...)` from `drizzle-orm/pg-core`. See the per-table schema
modules:

- `../schema/tenancy.ts` — schools, bases
- `../schema/users.ts` — users, user_roles
- `../schema/documents.ts` — documents
- `../schema/audit.ts` — audit_log (append-only)

## Policy convention

Every business table has at minimum:

- `<table>_select_own_school` — `using: school_id = (auth.jwt() ->> 'school_id')::uuid`
- `<table>_insert_own_school` — `withCheck: <same>`
- `<table>_update_own_school` — `using` + `withCheck`

DELETE policies are intentionally absent: hard delete is blocked at the
trigger level (`fn_block_hard_delete`); soft delete is an UPDATE that
sets `deleted_at`.

## Authenticated role

The `to:` field uses a raw `sql\`authenticated\`` literal rather than
`authenticatedRole` from `drizzle-orm/supabase`, because the Supabase
submodule's exports moved during 2024-2025 and the literal is stable
across Drizzle versions. Migrations regenerate identically either way.

## Adding a new table

When a future phase adds a business table:

1. Add `pgPolicy(...)` declarations on the table for select/insert/update
2. Register the table in `../rls-test-registry.ts`
3. Re-run `drizzle-kit generate`
4. Verify `tests/rls/cross-tenant.test.ts` covers it (it iterates the
   registry, so registration is sufficient)

The schema-PR template enforces all four steps.
