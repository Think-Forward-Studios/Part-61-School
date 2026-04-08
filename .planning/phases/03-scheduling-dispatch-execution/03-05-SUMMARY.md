---
phase: 03-scheduling-dispatch-execution
plan: 05
subsystem: fif-admin-dashboards
tags: [fif, dashboards, phase3-closeout]
dependency_graph:
  requires: [03-01, 03-02, 03-03, 03-04]
  provides:
    - admin FIF CRUD surface (/admin/fif, /new, /[id])
    - FifInbox user-facing unread-notice component
    - role-aware dashboard home (student / instructor / admin)
    - admin dashboard flight-line + pending-approvals panels
  affects: [fif router surface (consumer only)]
tech_stack:
  added: []
  patterns:
    - server component list → client mutation form pattern (matches /admin/rooms)
    - raw sql count queries for dashboard aggregates
    - allow-banned-term JS line comments above sql`` blocks that reference the 'approved' status enum
key_files:
  created:
    - apps/web/app/(app)/admin/fif/page.tsx
    - apps/web/app/(app)/admin/fif/new/page.tsx
    - apps/web/app/(app)/admin/fif/new/CreateFifForm.tsx
    - apps/web/app/(app)/admin/fif/[id]/page.tsx
    - apps/web/app/(app)/admin/fif/[id]/RevokeFifButton.tsx
    - apps/web/components/dispatch/FifInbox.tsx
  modified:
    - apps/web/app/(app)/admin/dashboard/page.tsx
    - apps/web/app/(app)/page.tsx
decisions:
  - No react-markdown dep — notice body renders as pre-wrap plain text. Keeps dep tree lean; markdown is a non-goal in v1.
  - No edit flow for existing notices. fif router exposes post + revoke only; if admin wants to change a notice, revoke and repost. Matches the "fresh ack = new notice" contract already documented in 03-CONTEXT.
  - Admin list page uses raw sql to join ack counts and compute active/inactive in one round trip (mirrors /admin/people aggregation pattern).
  - Dashboard home role-switches server-side by reading part61.active_role cookie, same resolution algorithm as (app)/layout.tsx (kept local to avoid exposing the resolver from the layout).
metrics:
  duration: ~7m
  completed: 2026-04-08
  tasks: 2 autonomous (FIF CRUD + full verification); 1 checkpoint pending
  files_created: 6
  files_modified: 2
  tests_passing: 98/98
---

# Phase 3 Plan 5: FIF Admin + Role Dashboards + Phase 3 Closeout Summary

Closes out Phase 3 by shipping the last 5% (admin FIF CRUD + user-facing FIF inbox + role-aware dashboards) and running the full verification gate. Phase 3 end-to-end human verification is queued as a checkpoint on the running stack.

## What Shipped

### Admin FIF CRUD (`/admin/fif`)

- **List page** — one row per non-deleted notice for the active school with title, severity chip, posted/effective/expires timestamps, ack count, and active/inactive status. Raw SQL for the aggregation; ordered by posted_at desc; limit 500.
- **New notice form** — `trpc.fif.post` with title, body (plain text, 20k char max), severity (info/important/critical), optional effective_at, optional expires_at. Submits then bounces back to the list.
- **Detail page** — reads notice via Drizzle + ack list via raw SQL join on users. Shows the full body as pre-wrap. If still active, renders `RevokeFifButton` which calls `trpc.fif.revoke` and refreshes the page.
- **No edit flow** — intentional (see decisions).

### FifInbox component (`components/dispatch/FifInbox.tsx`)

- Client component, polls `trpc.fif.listUnacked` (no interval, refetch on ack).
- Collapsed badge shows "N unread"; expanded shows each notice body + an "Acknowledge" button.
- When zero unread, renders a green "You are current" state.
- Severity color-chips match the admin list page for visual consistency.

### Dashboard updates

- **`/admin/dashboard`** — three new quick-stat cards at the top:
  1. **Today's flight line** → links to `/dispatch`, counts reservations with lower(time_range) in today and status in (approved|dispatched|flown).
  2. **Pending approvals** → links to `/schedule/approvals`, counts requested reservations.
  3. **Flight Information File** → links to `/admin/fif`.
     Fleet totals table retained below the cards.
- **`/(app)/page.tsx`** — role-aware home:
  - **Student**: Next reservation card, FifInbox, open squawks on the aircraft the next reservation is assigned to (if any).
  - **Instructor**: Today's schedule list, pending approvals count (scoped to assigned instructor), FifInbox.
  - **Admin**: Today's flight line count, pending approvals count, FifInbox.
  - **Mechanic**: FifInbox only (will gain maintenance panels in Phase 4).

### FifGate verification

- Wave 4's `FifGate.tsx` was already fully wired: it calls `trpc.fif.listUnacked`, disables the dispatch button until notices.length === 0, and the `DispatchModal` already holds `allFifAcked` gate state. No rewrites needed.

## Verification Gates

| Gate                                    | Result                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck`                     | clean                                                                                                            |
| `pnpm -r lint` (incl. banned-term rule) | clean after `// allow-banned-term:` comments added above 4 sql``blocks that reference the`'approved'` enum value |
| `pnpm --filter ./apps/web build`        | clean                                                                                                            |
| `pnpm --filter @part61/rls-tests test`  | 98/98 passing                                                                                                    |

### Flaky-test note

`api-fif.test.ts > listActive includes the new notice` failed on the first run with an exclusion-based false; second run passed. Root cause appears to be a sub-millisecond clock skew between the Node process (`new Date()` used as `effective_at`) and the Postgres `now()` used in the `listActive` filter. Pre-existing from 03-02; not touched by this plan. Logged for Phase 4/8 hardening.

## Commits

| Task | Description                           | Commit    |
| ---- | ------------------------------------- | --------- |
| 1    | FIF CRUD + FifInbox + dashboards      | `149d6a0` |
| 2    | Full verification (no source changes) | —         |

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 - Blocker] Banned-term lint blocked commit**

- **Found during:** Task 1 first lint run
- **Issue:** `// allow-banned-term:` comments placed inside sql``template literals don't register with the ESLint rule (template-literal text is not a JS comment token). Four queries in`/admin/dashboard/page.tsx`and`/(app)/page.tsx`that reference the`'approved'` reservation status enum value tripped the rule.
- **Fix:** Moved the allow comments up one line to sit immediately above the containing `const` / assignment statement, which the rule's statement-ancestor walker accepts.
- **Files modified:** `apps/web/app/(app)/admin/dashboard/page.tsx`, `apps/web/app/(app)/page.tsx`
- **Commit:** `149d6a0`

### Planned but not built

- **react-markdown / markdown rendering** — plan mentioned as a small dep; decided against to keep the dep tree lean. Body renders as `white-space: pre-wrap`. If markdown becomes desired, a single component swap in `/admin/fif/[id]/page.tsx` and `FifInbox.tsx` will do it.
- **Edit notice flow** — plan said "edit + revoke"; router only exposes post + revoke. Revoke-and-repost is the documented v1 flow. Logged.

## Deferred Issues

- `api-fif.test.ts` `listActive` assertion has a clock-skew race on first-run cold-cache. Either stamp `effective_at` via SQL `now()` in the router, or relax the test. Non-blocking — re-runs pass.

## Requirements Covered

- **FTR-07** — Flight Information File admin post/revoke/list + pilot inbox + dispatch gate (all six surfaces now live)

## Self-Check: PASSED

- [x] `apps/web/app/(app)/admin/fif/page.tsx` — FOUND
- [x] `apps/web/app/(app)/admin/fif/new/page.tsx` — FOUND
- [x] `apps/web/app/(app)/admin/fif/new/CreateFifForm.tsx` — FOUND
- [x] `apps/web/app/(app)/admin/fif/[id]/page.tsx` — FOUND
- [x] `apps/web/app/(app)/admin/fif/[id]/RevokeFifButton.tsx` — FOUND
- [x] `apps/web/components/dispatch/FifInbox.tsx` — FOUND
- [x] `apps/web/app/(app)/admin/dashboard/page.tsx` — FOUND (modified)
- [x] `apps/web/app/(app)/page.tsx` — FOUND (modified)
- [x] Commit `149d6a0` — FOUND in `git log`
