---
phase: 06-syllabus-rules-progression-audit
plan: 04
subsystem: ui
tags: [react, next.js, student-dashboard, progress-tracking, rollover, minimums, forecast]

# Dependency graph
requires:
  - phase: 06-syllabus-rules-progression-audit
    provides: Admin panel components (06-03), tRPC record + schedule procedures (06-02), SQL rules engine (06-01)
  - phase: 05-syllabus-model-grading-records
    provides: Student /record dashboard, enrollment detail page, training record data model
provides:
  - Student-facing NextActivityChip on /record (SCH-14)
  - Student-facing MinimumsStatusPanel on /record (SYL-21)
  - Student-facing ProgressForecastPanel on /record (SYL-22/23)
  - Student-facing RolloverQueuePanel on /record (SYL-15)
  - Same four panels on /record/courses/[enrollmentId] scoped to that enrollment
affects: [phase-7-adsb, phase-8-reporting]

# Tech tracking
tech-stack:
  added: []
  patterns: [student-facing panels as _components under /record, server-side rollover SQL with props to presentational component, encouragement-first copy for student-facing progress indicators]

key-files:
  created:
    - apps/web/app/(app)/record/_components/StudentNextActivityChip.tsx
    - apps/web/app/(app)/record/_components/StudentMinimumsPanel.tsx
    - apps/web/app/(app)/record/_components/StudentProgressForecastPanel.tsx
    - apps/web/app/(app)/record/_components/StudentRolloverQueuePanel.tsx
  modified:
    - apps/web/app/(app)/record/page.tsx
    - apps/web/app/(app)/record/courses/[enrollmentId]/page.tsx

key-decisions:
  - "Rollover data fetched server-side via SQL in page component and passed as props, avoiding need for new student-scoped tRPC procedure"
  - "StudentProgressForecastPanel uses encouragement-first copy: neutral for <=2 weeks behind, amber only >2 weeks, never red for students"
  - "Multi-enrollment note links to /admin/enrollments (not a new student enrollments page) per v1 scope"
  - "StudentRolloverQueuePanel is a server component receiving props (not a client component with tRPC) to avoid touching packages/api"

patterns-established:
  - "Student _components mirror admin _panels but use record.* procedures or server-side SQL"
  - "Encouragement-first language pattern for student-facing progress: supportive wording, muted severity"

requirements-completed: [SYL-15, SYL-21, SYL-22, SYL-23, SCH-14]

# Metrics
duration: 17min
completed: 2026-04-10
---

# Phase 6 Plan 04: Student Record Dashboard Extensions Summary

**Four student-facing Phase 6 panels (next activity, minimums, forecast, rollover) wired into /record and /record/courses/[enrollmentId] with encouragement-first copy and most-recent-enrollment scoping**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-10T02:05:19Z
- **Completed:** 2026-04-10T02:22:10Z
- **Tasks:** 1 of 2 (Task 2 is checkpoint:human-verify)
- **Files modified:** 6 (4 created + 2 modified)

## Accomplishments

- Four student-facing components mirroring admin panels but with encouragement-first language and no admin controls
- Most-recent active enrollment scoping with informational multi-enrollment note (no tab UI per v1 scope)
- Rollover queue fetched server-side to avoid API changes, passed as props to presentational component
- Friendly empty state when student has no active enrollment
- 244/244 RLS tests, 72 routes, banned-term lint clean, full build green

## Task Commits

Each task was committed atomically:

1. **Task 1: Student-facing Phase 6 record components + /record wiring** - `644b6b5`

## Files Created/Modified

### Created
- `apps/web/app/(app)/record/_components/StudentNextActivityChip.tsx` - Next-activity suggestion with "Request this lesson" link (SCH-14)
- `apps/web/app/(app)/record/_components/StudentMinimumsPanel.tsx` - FAA course minimums progress bars without refresh button (SYL-21)
- `apps/web/app/(app)/record/_components/StudentProgressForecastPanel.tsx` - Ahead/behind chip with encouragement-first copy (SYL-22/23)
- `apps/web/app/(app)/record/_components/StudentRolloverQueuePanel.tsx` - Server component showing rollover items with supportive messaging (SYL-15)

### Modified
- `apps/web/app/(app)/record/page.tsx` - Added four Phase 6 panels above existing sections, multi-enrollment note, rollover SQL query
- `apps/web/app/(app)/record/courses/[enrollmentId]/page.tsx` - Added same four panels scoped to the enrollment with rollover SQL query

## Decisions Made

1. **Rollover via server-side SQL, not tRPC:** Plan said "Do NOT touch packages/api", so rollover data is fetched in the page server component and passed as props to StudentRolloverQueuePanel. This avoids adding a `record.getMyRolloverQueue` procedure while keeping the component clean.
2. **Encouragement-first severity thresholds:** Students see neutral styling for up to 2 weeks behind (not amber). Only >2 weeks behind shows amber. Red is never used for students.
3. **Multi-enrollment link to /admin/enrollments:** The "View all enrollments" link goes to /admin/enrollments since no dedicated student enrollment list page exists. v1 scope keeps this simple.

## Deviations from Plan

None - plan executed as written. The file ownership constraint (no packages/api changes) was honored by using server-side SQL for rollover data.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 14 Phase 6 requirements have UI surfaces: admin (06-03) + student (06-04)
- Phase 6 human verification checkpoint (Task 2) pending
- After verification, Phase 7 (ADS-B integration) can begin

---
*Phase: 06-syllabus-rules-progression-audit*
*Completed: 2026-04-10*

## Self-Check: PASSED

All 4 created files and 2 modified files verified on disk. Task 1 commit (644b6b5) verified in git log.
