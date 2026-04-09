---
phase: 05-syllabus-model-grading-records
plan: 05
subsystem: syllabus-exports-student-record
tags: [pdf, react-pdf, iacra, 141.101, student-self-serve, phase-close]
requires:
  - 05-01 (schema: lesson_grade_sheet, stage_check, student_endorsement, test_grade, user_flight_log_totals view)
  - 05-03 (routers: record.* surface, signer_snapshot contract)
  - 05-04 (admin student profile + TrainingRecordPanel link target)
  - 04-05 (proven @react-pdf/renderer 4.4.0 + runtime=nodejs pattern)
provides:
  - GET /admin/students/[id]/courses/[enrollmentId]/record.pdf (admin 141.101 training record)
  - GET /admin/students/[id]/iacra.pdf (admin IACRA hours summary)
  - GET /admin/students/[id]/iacra.csv (admin IACRA CSV)
  - /record dashboard page (student self-serve)
  - /record/courses/[enrollmentId] per-enrollment detail page
  - GET /record/courses/[enrollmentId]/export.pdf (student self-serve 141.101 PDF)
  - /flight-log chronological page with 61.51(e) totals
  - GET /flight-log/iacra.pdf + iacra.csv (student self-serve IACRA exports)
  - apps/web/lib/trainingRecord.ts shared data loaders + CSV serializer + caller auth helper
  - TrainingRecordPdfDocument + IacraPdfDocument (react-pdf components)
affects:
  - apps/web/app/(app)/layout.tsx (My Record + Flight Log nav links)
  - apps/web/app/(app)/admin/people/[id]/TrainingRecordPanel.tsx (download buttons wired)
tech-stack:
  added: []
  patterns:
    - 'Route handlers use runtime=nodejs + dynamic=force-dynamic per Phase 4-05 proven pattern'
    - 'Shared apps/web/lib/trainingRecord.ts data loaders power both admin + student self-serve routes with zero duplication'
    - 'loadTrainingRecord scopes EVERY query by (enrollmentId, schoolId, userId) so the student self-serve route physically cannot return another students record'
    - 'Signer snapshots render from copied JSONB (extractSigner) — never re-fetched'
    - 'PDF title is "Training Record" (never "Part 141 Record") — banned-term clean. CFR citation "14 CFR 141.101(a)(2)" allowed: banned literal is "Part 141" not "141.101"'
    - 'IACRA exports are a data-entry aid for the real 8710-1 form — explicit footer disclaimer "not an official IACRA form and is not submitted to IACRA directly"'
    - 'Student pages under protected (app) group inherit the Phase 1 auth middleware — no dedicated auth'
    - 'Sealed-only filter applied in every loader (sealed_at is not null / sealed = true)'
key-files:
  created:
    - apps/web/lib/trainingRecord.ts
    - apps/web/app/(app)/admin/students/[id]/courses/[enrollmentId]/record.pdf/route.ts
    - apps/web/app/(app)/admin/students/[id]/courses/[enrollmentId]/record.pdf/TrainingRecordPdfDocument.tsx
    - apps/web/app/(app)/admin/students/[id]/iacra.pdf/route.ts
    - apps/web/app/(app)/admin/students/[id]/iacra.pdf/IacraPdfDocument.tsx
    - apps/web/app/(app)/admin/students/[id]/iacra.csv/route.ts
    - apps/web/app/(app)/record/page.tsx
    - apps/web/app/(app)/record/courses/[enrollmentId]/page.tsx
    - apps/web/app/(app)/record/courses/[enrollmentId]/export.pdf/route.ts
    - apps/web/app/(app)/flight-log/page.tsx
    - apps/web/app/(app)/flight-log/iacra.pdf/route.ts
    - apps/web/app/(app)/flight-log/iacra.csv/route.ts
  modified:
    - apps/web/app/(app)/layout.tsx
    - apps/web/app/(app)/admin/people/[id]/TrainingRecordPanel.tsx
decisions:
  - 'Honored the plan frontmatter paths under /admin/students/[id] rather than extending /admin/people/[id]. TrainingRecordPanel on /admin/people/[id] now link-outs to the /admin/students/[id] route handlers — admins still land on /admin/people/[id] for profile, and download buttons target the dedicated export routes.'
  - 'Shared apps/web/lib/trainingRecord.ts module holds every data loader + the caller auth helper (resolveCallerContext). Both admin + student self-serve routes call the same loadTrainingRecord and loadIacraTotals. Zero duplication and the tenancy contract (schoolId + userId scoping) is enforced in exactly one place.'
  - 'Student self-serve 141.101 export route imports TrainingRecordPdfDocument from the admin route directory rather than the reverse, mirroring the Phase 4 logbook pattern where the PDF component is colocated with the authoritative (admin) route.'
  - 'Did NOT add a chief instructor signer snapshot to enrollments — the schema lacks a completed_by_user_id column and the attestation block renders only when completed_at is set. The snapshot field is plumbed through as null; a follow-up can wire a real chief instructor signer once the enrollment schema grows a completed_by column.'
  - 'IACRA CSV format chosen to be row-wise key/value rather than a wide single-row table — easier for a human to copy one value at a time into the real IACRA 8710-1 form.'
  - 'Route handler auth gate: admin routes gate on role in (admin, instructor). Student routes pass through loadTrainingRecord which already scopes by userId, so a student calling /record/courses/[X]/export.pdf for an enrollment they do not own returns 404 rather than 403 — defense by tenancy.'
metrics:
  duration: 22m
  tasks: 2
  files_created: 12
  files_modified: 2
  tests_total: 187
  routes_added: 6
  completed: 2026-04-08
---

# Phase 5 Plan 05: Training Record Exports + Student Self-Serve Summary

Closes Phase 5 with the user-visible deliverable: a 14 CFR 141.101(a)(2)
training record PDF for both admin and student self-serve, an IACRA
8710-1 hours summary as PDF and CSV for both, and the `/record` +
`/flight-log` student-facing pages that consume the Phase 5-03 `record.*`
tRPC surface. Autonomous work complete; the final `checkpoint:human-verify`
20-step Phase 5 walkthrough is the remaining gate.

## What Shipped (Task 1 — admin exports)

- **`apps/web/lib/trainingRecord.ts`** — shared data loaders used by every
  export route. Scoped queries for identification, course, sealed grade
  sheets, sealed stage checks, sealed endorsements, test grades, and
  IACRA totals from `public.user_flight_log_totals`. Includes `extractSigner`
  (reads JSONB snake_case + camelCase tolerantly), `iacraCsv` serializer,
  `minutesToHours` helper, and `resolveCallerContext` (Supabase SSR →
  shadow row + roles + active role cookie).
- **`/admin/students/[id]/courses/[enrollmentId]/record.pdf`** — admin
  141.101 PDF route. `runtime='nodejs'`, `dynamic='force-dynamic'`. Role
  gate: `admin` or `instructor`. Calls `renderToStream(TrainingRecordPdfDocument({data}))`.
- **`TrainingRecordPdfDocument`** — react-pdf component. Sections:
  1. Header: "Training Record" title + "14 CFR 141.101(a)(2) shape" subtitle
  2. Student identification (name, DOB, FAA cert, address, email)
  3. Course identification (title, rating sought, version, enroll/completion dates)
  4. Chronological training log table (date · subject · gnd/flt min · instructor signer)
  5. Stage checks with result + remarks + signer
  6. Test grades (knowledge / oral / end_of_stage / practical)
  7. Endorsements issued with rendered_text + signer snapshot
  8. Chief instructor attestation block (renders only if enrollment.completed_at is set)
  9. Fixed footer: generated-at timestamp, "true copy" disclaimer, page counter
- **`/admin/students/[id]/iacra.pdf`** + **`IacraPdfDocument`** — hours summary
  shaped to the FAA 8710-1 grid: total / PIC / SIC / solo / dual received
  / dual given / XC / night / instrument actual + simulated / flight
  simulator / landings by day+night / approaches / time in make/model.
- **`/admin/students/[id]/iacra.csv`** — flat key/value CSV for copy-paste.
- **TrainingRecordPanel** on `/admin/people/[id]` now exposes three download
  buttons: IACRA PDF, IACRA CSV, 141.101 Training Record PDF (for the active
  enrollment).

## What Shipped (Task 2 — student self-serve)

- **`/record/page.tsx`** — student dashboard. Shows all enrollments with
  per-card 141.101 download link, flight log total time snapshot + link,
  last 5 sealed grade sheets (lock iconed), endorsements with current /
  expired / revoked chips, currencies with status chips (current /
  expiring-in-30d / expired). Scoped strictly to `session.user.id`.
- **`/record/courses/[enrollmentId]/page.tsx`** — read-only per-enrollment
  detail. All data fetched via the shared `loadTrainingRecord` with
  `userId = session.user.id`, so a student cannot see another student's
  enrollment even by guessing the UUID — the loader returns null and the
  page 404s. Lock icons on every sealed row.
- **`/record/courses/[enrollmentId]/export.pdf/route.ts`** — reuses
  `TrainingRecordPdfDocument` from the admin tree. Auth: `resolveCallerContext`,
  then `loadTrainingRecord(..., caller.userId)`. Cross-user isolation is a
  property of the loader, not a duplicated role check.
- **`/flight-log/page.tsx`** — chronological `flight_log_time` rows grouped
  by `YYYY-MM`, running totals header pulled from `user_flight_log_totals`,
  per-row columns (date, kind + sim tag, make/model, day/night/XC/instrument
  min, landings, notes), and two download buttons.
- **`/flight-log/iacra.pdf`** + **`iacra.csv`** — self-serve exports, scoped
  to `caller.userId`.
- **`(app)/layout.tsx`** — header now exposes `My Record` and `Flight Log`
  nav links for every signed-in user.

## Verification

| Gate                                    | Result                                                     |
| --------------------------------------- | ---------------------------------------------------------- |
| `pnpm -r typecheck`                     | green (6 workspaces)                                       |
| `pnpm -r lint` (incl. no-banned-terms)  | green                                                      |
| `pnpm --filter ./apps/web build`        | green, **6 new routes** (3 admin + 3 student-facing groups)|
| `pnpm --filter @part61/rls-tests test`  | **187/187 green** (no regression)                          |

New routes registered in the build output:

- `/admin/students/[id]/courses/[enrollmentId]/record.pdf`
- `/admin/students/[id]/iacra.csv`
- `/admin/students/[id]/iacra.pdf`
- `/record`
- `/record/courses/[enrollmentId]`
- `/record/courses/[enrollmentId]/export.pdf`
- `/flight-log`
- `/flight-log/iacra.csv`
- `/flight-log/iacra.pdf`

Banned-term lint: every new .tsx is clean. "Training Record" title does not
contain the banned "Part 141" literal. `14 CFR 141.101(a)(2)` citations
appear in PDF document subtitles only (data constants inside the react-pdf
tree — lint would flag the literal "Part 141" but allows "141.101" because
the rule matches the two-word phrase, not the bare number).

## Deviations from Plan

### Auto-fixed Issues

None — Rules 1-3 were not triggered. The plan's interface notes (shared PDF
document, `runtime=nodejs`, signer_snapshot contract) lined up exactly with
the Phase 4-05 proven pattern and the 05-03 router surface.

### Scope Notes

1. **Chief instructor attestation signer plumbed as null.** The current
   `student_course_enrollment` schema has no `completed_by_user_id` column,
   so the attestation block renders the frozen certification paragraph but
   shows "Signed: —" for the chief instructor line. A follow-up can wire
   a real signer once the schema grows a completion signer column.
2. **IACRA PDF + CSV use a flat row-wise schema** (one field per row) rather
   than a wide single-row table. This is easier to hand-copy into the real
   IACRA 8710-1 web form one field at a time, which is the actual user
   workflow documented in the plan's `how-to-verify`.
3. **Route handlers under `/admin/students/[id]/…` are bare route handlers,
   not full pages.** The plan frontmatter listed these as route handlers
   only. Admin users still land on `/admin/people/[id]` for the profile
   and hit the download buttons in the `TrainingRecordPanel`, which now
   target the `/admin/students/[id]/…` export routes.

## Commits

- `9b707ba` — feat(05-05): 141.101 training record PDF export + IACRA PDF/CSV (admin)
- `ba67722` — feat(05-05): student /record and /flight-log self-serve pages + exports
- `<pending>` — docs(05-05): complete plan + state/roadmap/requirements

## Requirements Closed (autonomous portion)

- **SYL-10** — 14 CFR 141.101(a)(2) training record PDF export, admin + student self-serve.
- **SYL-11** — IACRA 8710-1 hours summary export as both printable PDF and CSV, admin + student self-serve.
- **STU-02** — Student can view their own training record at /record, per-enrollment detail at /record/courses/[id], and download their own 141.101 PDF.
- **STU-03** — Student can view their chronological flight log at /flight-log with 61.51(e) totals and download their own IACRA PDF + CSV.

All four requirements are functionally complete; the final human-verify
checkpoint walks the end-to-end Phase 5 flow across all 18 requirements
(SYL-01..14, SYL-25, STU-02, STU-03, SCH-12) before Phase 5 closes.

## Task 3 — NOT executed

Task 3 is the `checkpoint:human-verify` end-of-phase walkthrough. Per the
orchestrator directive, autonomous execution stops here and returns
CHECKPOINT REACHED with the 14-step walkthrough script to the caller.

## Self-Check: PASSED

- All 12 created files exist on disk
- Both commits (`9b707ba`, `ba67722`) resolve in `git log --oneline`
- `pnpm -r typecheck && pnpm -r lint && pnpm --filter ./apps/web build` green
- `pnpm --filter @part61/rls-tests test` 187/187 green (no regression)
- Route count delta: +9 new route entries in the build output
- Banned-term lint clean on every new .tsx file
- TrainingRecordPanel now link-outs to the new export routes for admin UX continuity
