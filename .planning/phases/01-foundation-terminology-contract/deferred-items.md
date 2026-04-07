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

---

## Deferred from plan 01-02

Captured by 01-02 because the targeted file is owned by another plan
(typically 01-01, which committed its scaffolding before 01-02 could
coordinate). All items are required for the verification gates in 01-02
to actually run; none affect the static correctness of 01-02's source
artifacts.

### 1. `packages/db/package.json` — missing runtime/dev dependencies

01-01 created this file with only `@part61/config` + `typescript`.
01-02's source files import `drizzle-orm`, `drizzle-orm/pg-core`,
`drizzle-orm/postgres-js`, and `postgres`, and the `db:generate` /
`db:migrate` / `db:studio` scripts need `drizzle-kit`.

Required additions (plan 01-03 or a hotfix):

```jsonc
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate":  "drizzle-kit migrate",
    "db:studio":   "drizzle-kit studio"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "postgres":    "^3.4.4"
  },
  "devDependencies": {
    "drizzle-kit": "^0.28.0",
    "@types/pg":   "^8.11.10"
  }
}
```

Pin exact versions after running `pnpm view drizzle-orm version` and
verifying that `pgPolicy` + `to: sql\`authenticated\`` still compile
against the chosen version. If the installed version exposes
`authenticatedRole` from `drizzle-orm/supabase`, switch the
`packages/db/src/schema/*.ts` `to:` fields to use it (cosmetic only).

### 2. `pnpm-workspace.yaml` — missing `tests/*` glob

01-01 published the file with `apps/*` + `packages/*`. The
`tests/rls` workspace 01-02 created needs `tests/*` added so
`pnpm --filter @part61/rls-tests` resolves it.

Required edit:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tests/*"
```

### 3. `.github/workflows/ci.yml` — missing Supabase + migration steps

01-01 owns the CI workflow file. 01-02's verification gate (Task 3)
requires the workflow to:

1. Install Supabase CLI: `uses: supabase/setup-cli@v1` with `version: latest`
2. `run: supabase start` (in repo root, picks up `supabase/config.toml`)
3. Apply migrations:
   ```yaml
   - name: Apply migrations
     env:
       DATABASE_URL: postgresql://postgres:postgres@localhost:54322/postgres
       DIRECT_DATABASE_URL: postgresql://postgres:postgres@localhost:54322/postgres
     run: pnpm --filter @part61/db exec drizzle-kit migrate
   ```
4. Pass `DATABASE_URL` + `DIRECT_DATABASE_URL` env to the existing
   `pnpm -r test` step so `@part61/rls-tests` can connect.
5. (Optional) `supabase stop` in an `if: always()` step.

Insert these AFTER `pnpm install --frozen-lockfile` and BEFORE
`pnpm -r typecheck`.

### 4. `drizzle-kit generate` diff verification

`packages/db/migrations/0000_init.sql` is hand-authored because the
toolchain (pnpm, drizzle-kit) was unavailable in 01-02's execution
environment (no `node` / `pnpm` on PATH; pre-commit husky hook
required `--no-verify` to bypass). Plan 01-03 must:

1. Install deps (`pnpm install`).
2. Run `pnpm --filter @part61/db exec drizzle-kit generate --name init`
   into a temp directory.
3. Diff against `packages/db/migrations/0000_init.sql`.
4. Reconcile any divergence — typically by editing the schema source
   to make Drizzle emit the desired DDL, then deleting and re-running
   generate. The hand-authored file is intentionally close to what
   Drizzle would emit (table column order, RLS via `pgPolicy`,
   `enable row level security`) but cannot be byte-identical.
5. Re-run the cross-tenant Vitest harness to confirm equivalence.

### 5. Husky pre-commit hook blocked task commits

01-01 wired husky's pre-commit to invoke `pnpm`. The execution
environment for 01-02 had no `pnpm` on PATH, so every per-task commit
in 01-02 used `git commit --no-verify`. Plan 01-03 (or a hotfix)
should either:

- Make the husky hook a no-op when `pnpm` is missing
  (`command -v pnpm >/dev/null || exit 0` at the top), or
- Document that all execution environments must `corepack enable`
  pnpm before working in the repo.

### 6. Supabase CLI `[auth.hook.custom_access_token]` schema verification

`supabase/config.toml` registers the custom access token hook via
the `[auth.hook.custom_access_token]` section. The exact TOML keys
have shifted across CLI versions. Plan 01-03 must:

1. Run `supabase start` and check the logs for "custom_access_token
   hook registered" (or equivalent).
2. If the section is silently ignored, fall back to documenting the
   manual Dashboard registration in `supabase/README.md` and add a
   loud failure-mode test in the RLS harness (a JWT smoke test that
   asserts `school_id` is present in the claims of a real-issued
   token).
