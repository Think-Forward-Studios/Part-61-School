---
phase: 01-foundation-terminology-contract
plan: 04
subsystem: documents-storage
tags: [supabase-storage, rls, trpc, nextjs, upload, signed-url, audit-trigger]

requires:
  - phase: 01-02
    provides: public.documents table, audit trigger attachment, fn_block_hard_delete
  - phase: 01-03
    provides: tRPC protectedProcedure + withTenantTx, Supabase SSR client, /profile layout

provides:
  - '@part61/domain document-storage contract (DocumentKind zod enum, ALLOWED_MIME_TYPES, MAX_BYTE_SIZE, extForMime, storagePath)'
  - 'packages/db/migrations/0001_storage_policies.sql: documents bucket + storage.objects RLS policies keyed on school_<id>/user_<id>/ prefix'
  - 'packages/api documentsRouter: createSignedUploadUrl, finalizeUpload (with path-tamper check), list, createSignedDownloadUrl (5-minute TTL, admin read-in-school allowed), softDelete'
  - 'apps/web /profile/documents Server Component + UploadForm + DocumentList client components'
  - 'tests/rls/documents-storage.test.ts cross-tenant RLS coverage for storage.objects in the documents bucket'

affects:
  [
    phase-1-success-journey,
    02-personnel-fleet (file-upload pattern reused),
    08-compliance-notifications (expiring documents),
  ]

tech-stack:
  added:
    - 'zod added to @part61/domain (was devDep-only before)'
  patterns:
    - 'Pattern A: server-mediated signed-URL upload (createSignedUploadUrl -> PUT -> finalizeUpload) — client never constructs storage paths; server re-derives expected path in finalize and rejects mismatches'
    - 'Pattern B: storage.objects RLS keyed on storage.foldername(name) segments — [1]=school_<id>, [2]=user_<id>'
    - 'Pattern C: 5-minute signed download URLs created server-side after a Drizzle SELECT confirms ownership (or admin-in-school)'
    - 'Pattern D: service-role Supabase client created lazily inside each procedure, env read at call time (not module load) — matches auth.ts inviteUser (Pitfall 2)'

key-files:
  created:
    - packages/domain/src/documents.ts
    - packages/db/migrations/0001_storage_policies.sql
    - packages/api/src/routers/documents.ts
    - apps/web/app/(app)/profile/documents/page.tsx
    - apps/web/app/(app)/profile/documents/UploadForm.tsx
    - apps/web/app/(app)/profile/documents/DocumentList.tsx
    - tests/rls/documents-storage.test.ts
  modified:
    - packages/domain/src/index.ts (re-export documents module)
    - packages/domain/package.json (add zod dependency)
    - packages/api/src/routers/_root.ts (register documentsRouter)
    - .lintstagedrc.json (eslint --no-warn-ignored so tests/rls staged files don't fail pre-commit)

key-decisions:
  - 'MAX_BYTE_SIZE set to 25 MiB (26214400 bytes). Plan text mentioned 10 MB at one point and 25 MB in another; locked to 25 MiB to match 01-CONTEXT §Document Storage and the bucket file_size_limit in migration 0001.'
  - 'No DELETE policy on storage.objects for the documents bucket. Soft delete on public.documents sets deleted_at; the storage object remains until a Phase 8 garbage-collection job (running as service_role) reaps orphans. Simpler than coupling row-level soft delete to a storage.objects delete cascade.'
  - 'createSignedUploadUrl is a tRPC mutation, not a query. Reason: it materialises a server-signed token the caller will act on, and mutations are the correct semantic for any call that allocates server-side state or changes auth surface.'
  - 'finalizeUpload re-derives the expected storage path from (session.schoolId, session.userId, documentId, extForMime(mimeType)) and hard-fails any mismatch. This is the defense against a client upload that PUTs to path X but then finalizes with path Y — the audit trail would otherwise lie.'
  - "createSignedDownloadUrl allows admins of the same school to download any of that school's documents, using ctx.session.activeRole === 'admin' to widen the WHERE clause. Matches 01-CONTEXT §Roles: 'Admin always has read access to everything in their school'."
  - 'Supabase storage client typed via a local structural interface (SupabaseStorageApi) rather than importing the full client type, to keep the documents router module cheap to import and avoid type-bleed from @supabase/supabase-js across the @part61/api surface.'
  - "DATABASE_URL is still required at Next.js build time because @part61/db's client.ts throws on missing env at module load. Build was verified with env stubs; this is a pre-existing property of the 01-02 db client, not a new issue introduced by 01-04. Document for later hardening."

requirements-completed:
  - FND-07

duration: ~25 min (autonomous work; human-verify consolidated with 01-03)
completed: 2026-04-07
---

# Phase 1 Plan 04: Document Storage (FND-07) Summary

**Server-mediated signed-URL document upload/download on top of Supabase Storage, with path-prefix RLS policies, a minimal /profile/documents UI, and a cross-tenant RLS test — the last autonomous piece of Phase 1.**

## Performance

- **Duration:** ~25 min (autonomous tasks 1 and 2; task 3 is a consolidated human-verify checkpoint — see below)
- **Started:** 2026-04-07T03:00Z
- **Completed (autonomous):** 2026-04-07T03:28Z
- **Tasks executed:** 2 of 3 (task 3 deferred to the end-of-phase consolidated human verification)
- **Files created:** 7
- **Files modified:** 4

## Accomplishments

### Domain contract (`@part61/domain/documents`)

The single source of truth for everything document-shaped in Phase 1+:

- `DocumentKind` zod enum: `medical | pilot_license | government_id | insurance`
- `ALLOWED_MIME_TYPES`: `['image/jpeg', 'image/png', 'application/pdf']` + `MimeType` zod enum
- `MAX_BYTE_SIZE`: 25 MiB (26214400 bytes), matching the bucket `file_size_limit` in migration 0001
- `extForMime(mime)`: maps MIME → file extension
- `storagePath(schoolId, userId, documentId, ext)`: the **only** place a storage path is constructed. Clients are prohibited from building paths themselves (Pitfall 7 in 01-RESEARCH).

Added `zod` as a runtime dep of `@part61/domain` (previously dev-only).

### Storage bucket + RLS (`packages/db/migrations/0001_storage_policies.sql`)

Hand-authored migration (drizzle-kit does not emit DDL for the `storage` schema):

- Creates the `documents` bucket (private, 25 MiB cap, MIME allowlist) with an `on conflict do update` so it's idempotent.
- Three policies on `storage.objects` keyed off `(storage.foldername(name))[1]` and `[2]`:
  - `documents_select_own_school` — authenticated users from school S can SELECT any object under `school_<S>/...`
  - `documents_insert_own_school_user` — inserts must land at `school_<jwt.school_id>/user_<auth.uid()>/...`
  - `documents_update_own_school_user` — same shape for updates
- **No delete policy.** Soft delete on `public.documents` leaves the storage object in place until Phase 8 GC.

### tRPC router (`packages/api/src/routers/documents.ts`)

Five procedures, all `protectedProcedure` (gated by `withTenantTx`):

| Procedure                 | Kind     | Purpose                                                                                                    |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `createSignedUploadUrl`   | mutation | Validate MIME + size, generate UUID, compute canonical path, ask Supabase Storage for a signed upload URL. |
| `finalizeUpload`          | mutation | Re-derive expected path and reject mismatches, then INSERT the `documents` row (audit trigger fires).      |
| `list`                    | query    | Return the caller's non-deleted documents ordered by `uploadedAt DESC`.                                    |
| `createSignedDownloadUrl` | mutation | Drizzle SELECT scoped to school+user (or school-only for admins), then `createSignedUrl(path, 300)`.       |
| `softDelete`              | mutation | UPDATE `deleted_at = now()` scoped to school+user; audit trigger records the `soft_delete` action.         |

Service-role supabase-js client is lazy: env read inside each procedure, never at module load (mirrors `auth.ts::inviteUser`, Pitfall 2).

Wired into `appRouter._root` as `documents`.

### UI (`apps/web/app/(app)/profile/documents/`)

- `page.tsx` (Server Component) — fetches the caller's non-deleted documents via Drizzle and renders `<UploadForm />` + `<DocumentList />`. Uses `createSupabaseServerClient()` for auth gating; `force-dynamic` so it re-renders after `router.refresh()`.
- `UploadForm.tsx` (Client Component) — MIME + size pre-flight, then `createSignedUploadUrl → fetch PUT → finalizeUpload → router.refresh()`. Expires field only shown for `kind === 'medical'`.
- `DocumentList.tsx` (Client Component) — per-row Download (tRPC `createSignedDownloadUrl` → `window.open`) and Delete (soft delete, then `router.refresh()`).

All UI copy passes banned-term lint: "Upload", "Document type", "Expires", "Your documents", "Medical", "Pilot License", "Government ID", "Insurance", "On file".

### Cross-tenant storage test (`tests/rls/documents-storage.test.ts`)

New Vitest file in the existing `@part61/rls-tests` workspace. Six assertions:

1. User A cannot SELECT school B storage objects.
2. User A CAN SELECT their own school A storage objects (positive control).
3. User A cannot INSERT into `school_<B>/...`.
4. User A cannot INSERT into `school_<A>/user_<B>/...` (cross-user within same school).
5. User A cannot UPDATE a school B storage object.
6. User A SELECT on `public.documents WHERE school_id = schoolB` returns zero rows.

Test authoring only — not executed against a live stack in this session (Docker / Supabase CLI unavailable). Runs as part of `pnpm --filter @part61/rls-tests test` once a local Supabase stack is up.

## Task Commits

1. **Task 1: domain types + storage migration + tRPC documents router** — `7b95e91` (feat)
2. **Task 2: /profile/documents UI + cross-tenant storage test** — `d0d088b` (feat)

## Verification run locally

- `pnpm -r typecheck` — green (packages/config, db, domain, api, tests/rls, web)
- `pnpm -r lint` — green
- `pnpm --filter web build` — green (run with `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` env stubs; the `@part61/db` client throws at module load without `DATABASE_URL`, which is pre-existing behavior from 01-02)
- `/profile/documents` appears in the Next.js route table as a dynamic route
- Husky pre-commit ran cleanly on both commits (after lint-staged fix below)

### Deviations from Plan

#### Auto-fixed issues

**1. [Rule 3 - Blocking] Pre-commit hook failed on staged `tests/rls/documents-storage.test.ts`**

- **Found during:** Task 2 first `git commit` attempt
- **Issue:** `.lintstagedrc.json` invoked `eslint --max-warnings=0` on staged TS files. The `tests/rls/*` directory is outside the monorepo's ESLint `include`, so ESLint reported a _warning_ ("File ignored because of a matching ignore pattern"), which under `--max-warnings=0` is treated as a failure.
- **Fix:** Added `--no-warn-ignored` to the eslint invocation in `.lintstagedrc.json`. Staged files that happen to live in eslint-ignored paths (like `tests/rls/`) now pass cleanly, while actually-linted files still get zero-warning enforcement.
- **Files modified:** `.lintstagedrc.json`
- **Verification:** Re-ran `git commit`; husky + lint-staged passed.
- **Committed in:** `d0d088b`

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking).

## Task 3 — Consolidated Human Verification (NOT executed)

Task 3 of this plan is a `checkpoint:human-verify` that requires a running local Supabase stack (`pnpm dlx supabase start`), applied migrations, a seeded bootstrap admin, and interactive browser verification of the full Phase 1 journey.

**Docker and the Supabase CLI are not installed on this machine**, so this gate cannot be executed in this session. The orchestrator has consolidated this checkpoint with the unresolved human-verify gate from Plan 01-03 into a **single end-of-phase Phase 1 acceptance checkpoint**. That consolidated checkpoint is the one the user will run when the local stack is available.

Nothing about the autonomous work here depends on that verification passing — the code is self-consistent, typechecks, lints, and builds, and the cross-tenant storage test is ready to run. But Phase 1 should not be marked complete until the consolidated checkpoint is approved.

### What the consolidated end-of-phase checkpoint must cover (from this plan)

1. Apply `0001_storage_policies.sql` against the running Supabase Postgres.
2. Sign in as the invited user, visit `/profile/documents`, upload a PDF medical, observe the row in `public.documents` and the insert in `public.audit_log`.
3. Click Download, confirm the signed URL opens the file in a new tab and 403s after 5 minutes.
4. Click Delete, confirm `deleted_at` is set and audit_log has a `soft_delete` row.
5. Attempt a hard DELETE on `public.documents` via psql — expect `fn_block_hard_delete` to raise.
6. Sign in as a user from another school in a second browser profile, confirm zero visibility of school A documents.
7. Run `pnpm --filter @part61/rls-tests test` — both `cross-tenant.test.ts` and the new `documents-storage.test.ts` green.
8. Run `pnpm -r typecheck && pnpm -r lint && pnpm --filter web build` — all green (already verified offline).

## User Setup Required (when running the consolidated checkpoint)

- Install Docker Desktop and the Supabase CLI.
- `pnpm dlx supabase start` from the repo root.
- Export `DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres` and `DIRECT_DATABASE_URL=$DATABASE_URL`.
- `pnpm --filter @part61/db exec drizzle-kit migrate` — should apply both `0000_init.sql` and `0001_storage_policies.sql`.
- Export `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `supabase start` output) plus `SUPABASE_SERVICE_ROLE_KEY`.
- `pnpm --filter web dev`.

## Next Phase Readiness

**Autonomous Phase 1 work is complete.** All four plans have delivered their code artifacts, and every autonomous verification gate (typecheck, lint, build, unit-level structural checks) is green. The remaining gate is the single consolidated end-of-phase human verification, which covers both 01-03's and 01-04's human-verify tasks in one session.

After that checkpoint passes, Phase 1 is complete and Phase 2 (Personnel + Fleet) becomes the next planning target.

## Self-Check: PASSED

Files verified present on disk:

- `packages/domain/src/documents.ts` — FOUND
- `packages/domain/src/index.ts` — FOUND (re-exports documents)
- `packages/db/migrations/0001_storage_policies.sql` — FOUND
- `packages/api/src/routers/documents.ts` — FOUND
- `packages/api/src/routers/_root.ts` — FOUND (documentsRouter registered)
- `apps/web/app/(app)/profile/documents/page.tsx` — FOUND
- `apps/web/app/(app)/profile/documents/UploadForm.tsx` — FOUND
- `apps/web/app/(app)/profile/documents/DocumentList.tsx` — FOUND
- `tests/rls/documents-storage.test.ts` — FOUND
- `.lintstagedrc.json` — FOUND (updated with `--no-warn-ignored`)

Commits verified in `git log`:

- `7b95e91` — feat(01-04): documents domain types, storage RLS migration, and tRPC router
- `d0d088b` — feat(01-04): /profile/documents upload UI, document list, and storage RLS test

---

_Phase: 01-foundation-terminology-contract_
_Autonomous completion: 2026-04-07. Consolidated human-verify pending._
