---
phase: 04-camp-maintenance
plan: 05
subsystem: camp-logbook-pdf-and-seed
tags: [pdf, react-pdf, logbook, seed-templates, mnt-10, phase-close]
requires:
  - 04-04 CAMP admin UI + MaintenancePanel
  - 04-03 admin.logbook router (listSealed via admin.logbook.list)
  - 04-01 maintenance_item_template + maintenance_item_template_line tables
  - Phase 2 aircraft_current_totals view
provides:
  - GET /admin/aircraft/[id]/logbook/[book]/export.pdf (Node.js Route Handler)
  - /admin/aircraft/[id]/logbook/[book] view page with per-book tab switcher
  - LogbookPdfDocument (react-pdf) with fixed header/footer, paginated
    entry table, signer snapshot rendering
  - 4 seeded system maintenance_item_templates (C172 for-hire, C152, PA-28,
    generic single-engine) with interval_rule per line
affects:
  - supabase/seed.sql (re-seed block after schools-cascade truncate)
  - apps/web/package.json (pinned @react-pdf/renderer 4.4.0, no caret)
tech_added:
  - '@react-pdf/renderer 4.4.0 (pinned exact — no ^)'
patterns:
  - 'Route Handler runtime = "nodejs" + dynamic = "force-dynamic" so react-pdf
    Buffer/stream APIs work and the route never pre-renders at build time.'
  - 'Signer snapshot display tolerant of both snake_case (DB JSONB contract)
    and camelCase (future TS serializer) shapes — defensive for historical rows.'
  - 'supabase/seed.sql re-seeds templates after TRUNCATE schools CASCADE
    because templates.school_id is a nullable FK and CASCADE wipes child
    tables regardless of NULL — documented inline.'
key_files:
  created:
    - apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/page.tsx
    - apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/export.pdf/route.ts
    - apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/pdf/LogbookPdfDocument.tsx
    - apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/pdf/README.md
    - packages/db/migrations/0013_phase4_seed_templates.sql
    - supabase/migrations/20260408000006_phase4_seed_templates.sql
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
    - supabase/seed.sql
decisions:
  - 'PDF library: @react-pdf/renderer 4.4.0 worked cleanly on the first
    attempt under Next 15 + React 19 — typecheck, lint, AND production
    build all green. No SECRET_INTERNALS crash, no undefined renderToStream
    export, no React-internals stack trace. NO pivot to pdfkit was needed.
    Pinned exact (no caret) per plan PITFALL 1 guidance so a future minor
    bump does not silently re-introduce a React 19 incompatibility.'
  - 'Route Handler auth: direct Supabase SSR client + drizzle user_roles
    lookup instead of a tRPC server caller, matching the established
    admin pattern (Phase 2-3 server components use direct db + sql too).
    Defense-in-depth against mechanic_or_admin bypass.'
  - 'Route returns ONLY sealed entries (eq(logbookEntry.sealed, true)).
    Draft rows are visible in the HTML view page (marked DRAFT) but never
    appear in the PDF — the PDF is an export of the legal record.'
  - 'Seed templates migration is idempotent-on-fresh-DB (migration order
    guarantees empty tables) but NOT idempotent if re-run. For local
    `supabase db reset` the authoritative seed is in supabase/seed.sql
    because the reset truncates schools CASCADE which wipes the migrated
    rows. Production/CI flows that only run migrations (no reset) get the
    rows from the migration file. Both paths yield the same 4 templates.'
  - 'Filename convention: logbook-{tail}-{book}-{YYYYMMDD}.pdf (no spaces).'
metrics:
  duration: 20m
  tasks: 1
  tasks_total: 2
  files: 9
  tests_added: 0
  tests_total: 151
  completed: 2026-04-09
  status: autonomous_complete_awaiting_human_verify
---

# Phase 4 Plan 05: Logbook PDF + Seeded Templates Summary

Task 1 (autonomous) complete. Task 2 (14-step human-verify walkthrough)
awaiting the human operator.

## What Shipped

### PDF library spike — @react-pdf/renderer 4.4.0 (no pivot needed)

Per plan 04-05 PITFALL 1, the PDF library was treated as the one real
technical risk of the phase. Attempted `@react-pdf/renderer@^4.4.0` (first
4.x release that advertises React 19 peer support). Results:

| Check                                              | Result                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm --filter ./apps/web add @react-pdf/renderer` | clean install                                                                                        |
| `pnpm --filter ./apps/web typecheck`               | green (one TS fix — pass the Document element directly, not a createElement-wrapped component)       |
| `pnpm --filter ./apps/web lint`                    | green (banned-term clean)                                                                            |
| `pnpm --filter ./apps/web build`                   | **green — 47 routes**, including both new `/admin/aircraft/[id]/logbook/[book]` and `.../export.pdf` |

**No fallback to pdfkit required.** Dependency pinned to exact `4.4.0`
(no caret) per the plan's "don't let a minor bump silently break React 19"
guidance.

### Logbook view page — `/admin/aircraft/[id]/logbook/[book]`

Server component, school-scoped via `db + supabase.auth`. Shows:

- Aircraft header (tail + make/model/year)
- Tab-style book switcher (Airframe / Engine / Propeller)
- Prominent blue "Export PDF" button linking to `./export.pdf` in a new tab
- Table: date, description (with DRAFT badge on unsealed rows), hobbs, tach,
  airframe, signer (decoded from `signer_snapshot` JSONB)

### PDF export route — `GET .../logbook/[book]/export.pdf`

- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` (react-pdf needs Node
  Buffer/stream APIs; never statically pre-rendered)
- Auth: Supabase SSR session → user_roles lookup → 403 unless caller has
  `role in ('mechanic','admin')`. Mirrors `mechanicOrAdminProcedure`.
- Fetches the aircraft row (school-scoped), current totals from
  `aircraft_current_totals`, and **sealed-only** logbook entries for the
  requested book, newest first.
- Calls `renderToStream(<LogbookPdfDocument …/>)` and streams the result
  as `application/pdf` with `Content-Disposition: inline; filename="logbook-{tail}-{book}-{YYYYMMDD}.pdf"`.

### LogbookPdfDocument — react-pdf component

- Fixed header on every page: tail number, book title ("Airframe Logbook"
  / "Engine Logbook" / "Propeller Logbook"), make/model/year, current
  totals line (Hobbs · Tach · Airframe)
- Table header with sticky column labels (Date, Description, Hobbs, Tach,
  Airframe, Signer)
- Body rows from sealed entries. Signer renders as
  `"Jane Q. Mechanic, IA 3001234567"`
- Fixed footer on every page: generated-at timestamp, "true copy" disclaimer,
  page counter ("Page X of N")
- US Letter size, Helvetica, narrow print-friendly margins
- Banned-term clean (no "approved" literal appears in any static string)

### Seeded system templates (migration 0013 + seed.sql mirror)

Four system templates with `school_id = null` (visible to all tenants
per the `maintenance_item_template_select` RLS policy):

| Template                     | Lines | Key items                                                                                                          |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| Cessna 172 for-hire standard | 8     | annual, 100-hour, ELT §91.207, ELT battery, transponder §91.413, pitot-static §91.411 (IFR), VOR check, oil change |
| Cessna 152 standard          | 6     | annual, 100-hour, ELT, ELT battery, transponder, oil                                                               |
| Piper PA-28 standard         | 6     | annual, 100-hour, ELT, ELT battery, transponder, oil                                                               |
| Generic single-engine        | 2     | annual, ELT §91.207                                                                                                |

Interval rules use the `intervalRuleSchema` discriminated union:
`{clock:"calendar",months:N}` / `{clock:"tach",hours:N}`.

## Verification

| Gate                                   | Result                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm -r typecheck`                    | green (6 workspaces)                                                                              |
| `pnpm -r lint`                         | green (banned-term clean)                                                                         |
| `pnpm --filter ./apps/web build`       | **green, 47 routes** (+2 new: logbook view + export.pdf)                                          |
| `pnpm dlx supabase db reset`           | clean (migration 0013 + seed.sql both applied)                                                    |
| Template count query                   | 4 system templates, 2/6/6/8 lines as expected                                                     |
| `pnpm --filter @part61/rls-tests test` | **151/151 green** (was 150/151 with pre-existing api-fif flake; flake did not reproduce this run) |

## Deviations from Plan

### Auto-fixed

**1. [Rule 3 — Blocking] `supabase db reset` wipes migration-seeded templates**

- **Found during:** Task 1 post-migration verification
- **Issue:** After applying migration 0013 via `supabase db reset`, the
  template count was 0. Root cause: `supabase/seed.sql` runs after all
  migrations and does `TRUNCATE public.schools CASCADE`. Because
  `maintenance_item_template.school_id` is a (nullable) FK to
  `public.schools`, PostgreSQL's `TRUNCATE CASCADE` truncates the entire
  child table regardless of whether individual rows hold NULL for that FK.
- **Fix:** Added a `DO $seed_templates$ … END $seed_templates$;` block to
  `supabase/seed.sql` (before the `session_replication_role = origin`
  switch) that re-inserts the same 4 templates with the same line sets.
  Inline comment documents the cascade reasoning. Migration 0013 is still
  canonical for production / CI / migration-only flows.

**2. [Rule 1 — Bug] renderToStream expected a Document element, not a createElement wrapper**

- **Found during:** Task 1 typecheck
- **Issue:** Using `React.createElement(LogbookPdfDocument, props)` failed
  TS2345 — `renderToStream` wants `ReactElement<DocumentProps>`, and the
  component-level createElement produced `ReactElement<LogbookPdfProps>`
  with no overlap.
- **Fix:** Call `LogbookPdfDocument(props)` directly to get the rendered
  `<Document>` element, then pass that to `renderToStream`. Removed the
  unused `React` import. Typecheck passes.

### Package name is `web`, not `@part61/web`

Plan and critical_environment_setup both reference `pnpm --filter @part61/web`.
The actual workspace name in `apps/web/package.json` is just `"name": "web"`,
so commands used `pnpm --filter ./apps/web` (path filter) throughout. Not a
deviation from intent — just an alias choice the plan author didn't know
about. No rework.

## Task 2 — NOT executed

Task 2 (`checkpoint:human-verify`) is the 14-step end-of-phase ceremony
walkthrough. Per plan instructions and the execute-phase orchestrator's
explicit directive, I stopped after Task 1 autonomous completion and am
returning a `CHECKPOINT REACHED` message to the caller.

## Commits

- `7adce8c` — feat(04-05): logbook PDF export + seeded CAMP templates (Task 1)

## Requirements closed (autonomous portion)

- **MNT-10** — digital logbook PDF export per book (airframe/engine/prop).
  MNT-10 becomes fully closed once the human-verify walkthrough confirms
  a downloaded PDF opens cleanly in a reader.

Full Phase 4 requirement close-out (MNT-01..11) is gated on the human
walkthrough.

## Self-Check: PASSED

- All 6 created files exist on disk (verified: route.ts, page.tsx,
  LogbookPdfDocument.tsx, pdf/README.md, migrations/0013…, supabase/migrations/…006)
- Commit `7adce8c` resolves in `git log --oneline`
- Typecheck, lint, and production build all green monorepo-wide
- RLS suite 151/151 (no regressions)
- 4 system templates seeded and queryable via the running Supabase instance
