# Deferred Items — Phase 01

Out-of-scope artifacts encountered during plan 01-01 execution.

## Pre-existing untracked files in `packages/db/`

During plan 01-01 execution, the following files appeared in `packages/db/`
that belong to plans 02 (Drizzle schema + RLS) and beyond. They were removed
twice during this plan because plan 01-01's contract is "stub `src/index.ts`
only — no Drizzle, no Supabase code." They will be regenerated correctly by
plan 01-02 (or wherever the schema lands).

Removed:

- `packages/db/drizzle.config.ts`
- `packages/db/src/client.ts` (postgres-js + drizzle client wiring)
- `packages/db/src/tx.ts` (`withSchoolContext` GUC helper)
- `packages/db/src/rls-test-registry.ts`
- `packages/db/src/schema/` (audit, documents, enums, tenancy, users)
- `packages/db/src/policies/`

These files were not committed at any point during 01-01.
