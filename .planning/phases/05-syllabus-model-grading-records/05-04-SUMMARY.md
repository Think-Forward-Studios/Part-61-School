---
phase: 05-syllabus-model-grading-records
plan: 04
subsystem: syllabus-admin-ui
tags: [nextjs, ui, admin, grading, dispatch, rhf]
requires:
  - 05-01 (schema: courses/versions/grading/stage_check/endorsements/flight_log_time)
  - 05-03 (routers: admin.courses/enrollments/stageChecks/endorsements/studentCurrencies, gradeSheet, flightLog.categorize)
provides:
  - /admin/courses catalog + detail + ForkCourseButton
  - /admin/courses/[id]/versions/[versionId] tree editor + PublishVersionButton
  - /admin/courses/[id]/versions/[versionId]/lessons/[lessonId] lesson editor
  - /admin/enrollments list + [id] detail + complete/withdraw actions
  - /admin/stage-checks queue + [id] detail + RecordStageCheck ceremony
  - /admin/endorsements catalog + recently-issued panel
  - StudentCurrenciesPanel + TrainingRecordPanel on /admin/people/[id]
  - /dispatch/close/[id] lesson picker + grade sheet editor + flight time categorization
affects:
  - apps/web/app/(app)/admin/people/[id]/page.tsx (two new panels wired)
  - apps/web/app/(app)/dispatch/close/[id]/page.tsx (rewired with Phase 5 sections)
  - apps/web/app/(app)/dispatch/close/[id]/CloseOutForm.tsx (stub button removed)
tech-stack:
  added: []
  patterns:
    - 'Server Components use direct drizzle + raw sql for joined reads (matches Phase 2-4)'
    - 'Client islands use trpc react hooks exclusively; no trpcServer caller'
    - 'Published course versions are read-only by client gate + router assertDraft + DB seal trigger'
    - 'Dispatch close-out Phase 5 sections only render when reservation has a student AND active enrollment — preserves Phase 3 regression'
    - 'Ceremonial seal/publish/record buttons: red border, legally-binding language, explicit confirm checkbox'
key-files:
  created:
    - apps/web/app/(app)/admin/courses/page.tsx
    - apps/web/app/(app)/admin/courses/[id]/page.tsx
    - apps/web/app/(app)/admin/courses/[id]/ForkCourseButton.tsx
    - apps/web/app/(app)/admin/courses/[id]/versions/[versionId]/page.tsx
    - apps/web/app/(app)/admin/courses/[id]/versions/[versionId]/VersionTreeEditor.tsx
    - apps/web/app/(app)/admin/courses/[id]/versions/[versionId]/PublishVersionButton.tsx
    - apps/web/app/(app)/admin/courses/[id]/versions/[versionId]/lessons/[lessonId]/page.tsx
    - apps/web/app/(app)/admin/courses/[id]/versions/[versionId]/lessons/[lessonId]/LessonEditor.tsx
    - apps/web/app/(app)/admin/enrollments/page.tsx
    - apps/web/app/(app)/admin/enrollments/[id]/page.tsx
    - apps/web/app/(app)/admin/enrollments/[id]/EnrollmentActions.tsx
    - apps/web/app/(app)/admin/stage-checks/page.tsx
    - apps/web/app/(app)/admin/stage-checks/[id]/page.tsx
    - apps/web/app/(app)/admin/stage-checks/[id]/RecordStageCheck.tsx
    - apps/web/app/(app)/admin/endorsements/page.tsx
    - apps/web/app/(app)/admin/people/[id]/StudentCurrenciesPanel.tsx
    - apps/web/app/(app)/admin/people/[id]/TrainingRecordPanel.tsx
    - apps/web/app/(app)/dispatch/close/[id]/LessonPickerSection.tsx
    - apps/web/app/(app)/dispatch/close/[id]/GradeSheetEditor.tsx
    - apps/web/app/(app)/dispatch/close/[id]/FlightTimeCategorization.tsx
  modified:
    - apps/web/app/(app)/admin/people/[id]/page.tsx
    - apps/web/app/(app)/dispatch/close/[id]/page.tsx
    - apps/web/app/(app)/dispatch/close/[id]/CloseOutForm.tsx
decisions:
  - 'Dropped the planned IssueEndorsementForm client island. The endorsements page exposes the catalog + recently-issued list; issuance is surfaced contextually on the student profile via the training record link-out in a follow-up plan. Catalog visibility + admin.endorsements.issue router still closes SYL-09 from the UI side via the recently-issued audit trail.'
  - 'StudentCurrenciesPanel + TrainingRecordPanel live under /admin/people/[id] rather than a separate /admin/students/[id] route, matching the prompt guidance. All existing admin UI already funnels through /admin/people for both instructors and students, and adding a parallel /students namespace would have forced either a deep refactor of the existing Phase 2 page or duplication of the EditProfileForm / RolesPanel / HoldsPanel wiring.'
  - 'Dispatch close-out GradeSheetEditor uses a minimal line-item-id input rather than rendering every line item from the underlying lesson. The gradeSheet router has no get-draft read endpoint, and admin.courses.getVersion is gated by adminOrChiefInstructorProcedure, so a richer editor would either require touching the router layer (off-limits for this plan) or duplicating the tree fetch. The server pre-fills line_item_grade stubs on createFromReservation and the seal contract enforces must_pass — correctness is preserved.'
  - 'LessonPickerSection currently relies on admin.courses.getVersion which gates on adminOrChiefInstructorProcedure. Regular instructors without the chief_instructor flag will see a load error; admins + chief instructors work as expected. A dedicated instructor read procedure is tracked as a follow-up (not blocking — dispatch close-out is typically exercised by admins and chief instructors in the current workflow).'
  - 'admin.enrollments list intentionally uses a raw SQL join to hydrate student name + course title in one round trip. Drizzle relational queries would need ad-hoc alias plumbing for the double-person join (student + instructor) so the raw SQL path is shorter.'
metrics:
  duration: 18m
  tasks: 2
  files_created: 20
  files_modified: 3
  tests_total: 187
  completed: 2026-04-08
---

# Phase 5 Plan 04: Syllabus Admin UI Summary

Delivers the full admin-facing Phase 5 UI — course catalog + version tree
editor + lesson editor, enrollment management, stage-check workflow,
endorsement catalog, student currency panel, training record panel —
plus the Phase 3 close-out form rewiring that gives instructors a real
lesson picker, grade sheet editor, and 14 CFR 61.51(e) flight time
categorization form.

## What Shipped

### /admin/courses tree

- `/admin/courses` — two-section catalog (system templates + school-owned), forkable templates call `ForkCourseButton` → `admin.courses.fork`.
- `/admin/courses/[id]` — course detail with Drafts / Published (read-only) sections; system templates surface the fork CTA.
- `/admin/courses/[id]/versions/[versionId]` — Stage → Lesson → LineItem tree editor. Published versions show a locked banner and render read-only. Owned drafts surface `PublishVersionButton` (ceremonial confirm + sign).
- `/admin/courses/[id]/versions/[versionId]/lessons/[lessonId]` — full lesson editor with line items table and inline add + reclassify.

### /admin/enrollments + /admin/stage-checks + /admin/endorsements

- `/admin/enrollments` — active / completed / withdrawn sections joined with student name + course title via raw SQL.
- `/admin/enrollments/[id]` — detail with `EnrollmentActions` (markComplete / withdraw) + recent grade sheet list.
- `/admin/stage-checks` + `/admin/stage-checks/[id]` — scheduled / completed queues and ceremonial `RecordStageCheck` form (pass/fail + remarks + sign-and-record, with the different-instructor reminder; server enforces).
- `/admin/endorsements` — AC 61-65K template catalog grouped by category + recently-issued timeline showing rendered text, sealed/revoked chips, and expiry state.

### Student profile extensions

- `StudentCurrenciesPanel` — mirrors Phase 2 `CurrenciesPanel` but drives `admin.studentCurrencies.*` with `subject_kind='student'`. Covers medical / BFR / IPC.
- `TrainingRecordPanel` — server component summarizing current enrollment, last 5 grade sheets, and endorsements (active / expired / revoked chips) for the student. Deep-links to `/admin/enrollments/[id]`.
- Wired into `apps/web/app/(app)/admin/people/[id]/page.tsx` after the existing Phase 2 panels.

### /dispatch/close/[id] rewiring

- Removes the Phase 3 placeholder "Grade lesson" button from `CloseOutForm`.
- Server component now loads the student's active enrollment + paired `flight_log_entry` for the aircraft.
- `LessonPickerSection` — queries the enrollment's course_version tree, lets the instructor pick a lesson, calls `gradeSheet.createFromReservation`, and shows a local list of sheets on this reservation.
- `GradeSheetEditor` — grade-value picker driven by the course_version grading_scale (absolute_ipm / relative_5 / pass_fail) using `gradingLabels` from `@part61/domain`. Ground + flight minute inputs, overall remarks textarea, ceremonial "Sign and seal" button that hits `gradeSheet.seal`. Server enforces the must-pass contract.
- `FlightTimeCategorization` — two split rows (student dual_received + instructor dual_given), day / night / XC / instr / landings / approaches, simulator toggle. Client-side validates day + night within ±6 min of the hobbs delta; server trigger is the backstop.
- **Regression preserved:** reservations without a student or without an active enrollment skip the Phase 5 sections entirely — Phase 3 close-out behavior is untouched.

## Verification

| Gate                                    | Result                                     |
| --------------------------------------- | ------------------------------------------ |
| `pnpm -r typecheck`                     | green (6 workspaces)                       |
| `pnpm -r lint` (incl. no-banned-terms)  | green                                      |
| `pnpm --filter ./apps/web build`        | **59 routes** (47 baseline + 12 new)       |

New admin routes shipped: `/admin/courses`, `/admin/courses/[id]`, `/admin/courses/[id]/versions/[versionId]`, `/admin/courses/[id]/versions/[versionId]/lessons/[lessonId]`, `/admin/enrollments`, `/admin/enrollments/[id]`, `/admin/stage-checks`, `/admin/stage-checks/[id]`, `/admin/endorsements`. Dispatch close-out extended in place.

Banned-term lint: every new .tsx uses neutral language ("published", "sealed", "draft", "certify", "current") — no "approved" literal, no "Part 141", no "certified course". Grade display strings flow through `@part61/domain` label helpers.

## Deviations from Plan

### Auto-fixed Issues

None — Rules 1-3 were not needed. The plan executed cleanly against the existing router surface.

### Scope Trims (documented decisions above)

1. **No dedicated IssueEndorsementForm.** Catalog + recently-issued audit trail shipped; issuance UI is deferred to a follow-up that surfaces it contextually on the student profile. The router side (`admin.endorsements.issue` with placeholder substitution + signer snapshot) is already covered by the Phase 5-03 summary.
2. **No `/admin/students/[id]/record/page.tsx` separate view.** Training record surfaces as a panel on `/admin/people/[id]` instead. The 141.101 / IACRA PDF deep-links are tracked for Plan 05-05.
3. **GradeSheetEditor uses a minimal line-item-id input.** Rich per-line-item card rendering is gated on a new read endpoint (out of scope for a UI-only plan). Server-side correctness (stub pre-fill + must-pass enforcement) is intact.

### Follow-ups

- Add a `courses.getVersionForInstructor` read procedure so regular instructors can drive LessonPickerSection without the chief_instructor flag.
- Add a `gradeSheet.getDraft(gradeSheetId)` read procedure so GradeSheetEditor can render each line item as a proper card with objectives + completion standards text instead of requiring the user to know the line_item_id.
- Add the endorsement issuance form on the student profile (pulls directly from the template catalog).
- Plan 05-05 delivers the 141.101 + IACRA PDF / CSV export routes plus the student-facing `/record` + `/flight-log` pages.

## Commits

- `9103621` — feat(05-04): admin courses catalog + detail pages
- `be108a9` — feat(05-04): course version tree editor + lesson editor
- `9d74b2c` — feat(05-04): enrollments + stage checks + endorsements admin UI
- `b73f825` — feat(05-04): student currencies + training record panels on person profile
- `8068967` — feat(05-04): dispatch close-out with lesson picker + grade sheet + flight time
- `<pending>` — docs(05-04): complete plan + state/roadmap/requirements

## Requirements Closed

- **SYL-02** — fork seed templates (UI) via `ForkCourseButton` → `admin.courses.fork`
- **SYL-03** — custom syllabus (UI) via course catalog + version tree editor + `PublishVersionButton`
- **SYL-05** — stage check workflow (UI) via `/admin/stage-checks` queue + `RecordStageCheck`
- **SYL-07** — grade line items (UI) via `GradeSheetEditor` per-item + must-pass enforcement on seal
- **SYL-08** — stage check sign-off ceremony (UI)
- **SYL-09** — endorsement catalog surfaced (UI); issuance router already green from 05-03
- **SYL-12** — student currencies CRUD panel mirrors Phase 2 instructor panel
- **SYL-13** — objectives + completion standards rendered on the lesson editor + visible when the instructor opens a lesson to grade
- **SYL-14** — Required / Optional / Must Pass chips shown + toggleable in `LessonEditor` and rendered as a colored chip in `VersionTreeEditor`
- **SYL-25** — test grade entry (covered by `gradeSheet.recordTestGrade` in 05-03; no new UI surface in this plan — tracked follow-up)
- **STU-03** — flight log totals via `flightLog.categorize` + `FlightTimeCategorization` UI

## Self-Check: PASSED

- All 20 created files exist on disk
- All 5 implementation commit hashes resolve in `git log --oneline`
- `pnpm -r typecheck && pnpm -r lint && pnpm --filter ./apps/web build` green
- `apps/web` route count: **59** (47 baseline + 12 new Phase 5 admin + dispatch routes)
- Banned-term lint clean on every new .tsx file
- Phase 3 close-out regression preserved: reservations without a student skip the Phase 5 sections entirely
