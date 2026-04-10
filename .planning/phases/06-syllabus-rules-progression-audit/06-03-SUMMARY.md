---
phase: 06-syllabus-rules-progression-audit
plan: 03
subsystem: ui
tags: [react, next.js, trpc, admin-ui, audit-dashboard, override-ceremony, eligibility-blockers]

# Dependency graph
requires:
  - phase: 06-syllabus-rules-progression-audit
    provides: SQL rules engine (06-01), tRPC wrappers for overrides/audit/enrollments/schedule (06-02)
  - phase: 04-camp-maintenance
    provides: section 91.409 override modal pattern, maintenance dashboard layout
  - phase: 05-syllabus-model-grading-records
    provides: enrollment detail page, student profile panels, grade sheet editor
provides:
  - /admin/audit/training-records exception dashboard (SYL-24)
  - /admin/overrides surveillance page (IPF-06)
  - 4 student/enrollment profile panels (MinimumsStatus, ProgressForecast, RolloverQueue, NextActivityChip)
  - ManagementOverridesPanel on admin dashboard (IPF-06)
  - BlockerList + GrantOverrideDialog for /schedule/request (SCH-05, SCH-11, SYL-17, SYL-19)
  - Inline eligibility check integration in reservation request form
  - Admin sidebar links for Audit and Overrides
affects: [06-04-student-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [eligibility blocker display with typed discriminated union, override ceremony dialog with signer confirmation]

key-files:
  created:
    - apps/web/app/(app)/admin/people/[id]/_panels/MinimumsStatusPanel.tsx
    - apps/web/app/(app)/admin/people/[id]/_panels/ProgressForecastPanel.tsx
    - apps/web/app/(app)/admin/people/[id]/_panels/RolloverQueuePanel.tsx
    - apps/web/app/(app)/admin/people/[id]/_panels/NextActivityChip.tsx
    - apps/web/app/(app)/admin/_components/ManagementOverridesPanel.tsx
    - apps/web/app/(app)/admin/audit/training-records/page.tsx
    - apps/web/app/(app)/admin/audit/training-records/AuditActions.tsx
    - apps/web/app/(app)/admin/overrides/page.tsx
    - apps/web/app/(app)/schedule/request/_components/BlockerList.tsx
    - apps/web/app/(app)/schedule/request/_components/GrantOverrideDialog.tsx
  modified:
    - apps/web/app/(app)/admin/people/[id]/page.tsx
    - apps/web/app/(app)/admin/enrollments/[id]/page.tsx
    - apps/web/app/(app)/admin/dashboard/page.tsx
    - apps/web/app/(app)/admin/layout.tsx
    - apps/web/app/(app)/schedule/request/page.tsx
    - apps/web/app/(app)/schedule/request/ReservationForm.tsx

key-decisions:
  - "Panels are client components with enrollmentId prop, consuming trpc hooks from 06-02 routers"
  - "Multi-enrollment note on student profile shows most-recent active enrollment only, per CONTEXT.md Deferred Items"
  - "ManagementOverridesPanel is a server component using direct SQL (no trpc) for dashboard performance"
  - "GrantOverrideDialog uses amber/orange color scheme and explicit signer confirmation checkbox matching Phase 4 section 91.409 ceremony weight"
  - "BlockerList renders typed Blocker discriminated union from @part61/domain with per-kind message rendering"
  - "Eligibility query in ReservationForm fires only when enrollmentId + lessonId + aircraftId + instructorId are all present"
  - "Admin/chief-instructor detection on /schedule/request uses raw SQL since is_chief_instructor column not in Drizzle schema"

patterns-established:
  - "Panel components under _panels/ directory for admin profile drop-ins"
  - "Blocker display pattern: typed discriminated union -> renderBlockerMessage helper -> fix-link hints"
  - "Override ceremony dialog: justification (min 20 chars) + expiry date + signer confirmation checkbox"

requirements-completed: [SYL-15, SYL-17, SYL-19, SYL-21, SYL-22, SYL-23, SCH-05, SCH-11, SCH-14, SYL-24, IPF-06]

# Metrics
duration: 28min
completed: 2026-04-09
---

# Phase 6 Plan 03: Admin UI Surface Summary

**14 new/modified files delivering audit dashboard, override surveillance, 4 student profile panels, eligibility blocker display + override ceremony dialog on reservation request form -- 71 routes total**

## Performance

- **Duration:** 28 min
- **Started:** 2026-04-10T01:31:53Z
- **Completed:** 2026-04-10T02:00:00Z
- **Tasks:** 3 (1a, 1b, 2)
- **Files modified:** 16 (10 created + 6 modified)

## Accomplishments

- Four reusable panel components (MinimumsStatus, ProgressForecast, RolloverQueue, NextActivityChip) wired into both student profile and enrollment detail pages
- /admin/audit/training-records exception dashboard with severity badges, mark-resolved, and run-now actions
- /admin/overrides full-page surveillance with scope filters (active/30d/all) and revoke dialog
- BlockerList + GrantOverrideDialog on /schedule/request with inline eligibility check, matching Phase 4 section 91.409 ceremony weight
- ManagementOverridesPanel on admin dashboard showing last 30 days of overrides (IPF-06)
- Admin sidebar extended with Audit and Overrides navigation links
- 71 routes total, banned-term lint clean, full build green

## Task Commits

Each task was committed atomically:

1. **Task 1a: Four standalone panel components** - `20a04fe`
   - MinimumsStatusPanel, ProgressForecastPanel, RolloverQueuePanel, NextActivityChip
2. **Task 1b: Wire panels + ManagementOverridesPanel** - `c8c0e3a`
   - Student profile (most-recent enrollment), enrollment detail, admin dashboard
3. **Task 2: Audit/overrides pages + BlockerList + GrantOverrideDialog + eligibility integration** - `7173ce6`
   - 7 files: 2 new pages, 2 new components, 3 modified pages

## Files Created/Modified

### Created
- `apps/web/app/(app)/admin/people/[id]/_panels/MinimumsStatusPanel.tsx` - FAA course minimums progress bars
- `apps/web/app/(app)/admin/people/[id]/_panels/ProgressForecastPanel.tsx` - Ahead/behind chip + projected dates
- `apps/web/app/(app)/admin/people/[id]/_panels/RolloverQueuePanel.tsx` - Outstanding rollover line items
- `apps/web/app/(app)/admin/people/[id]/_panels/NextActivityChip.tsx` - Next-activity suggestion + schedule link
- `apps/web/app/(app)/admin/_components/ManagementOverridesPanel.tsx` - Dashboard overrides panel (server component)
- `apps/web/app/(app)/admin/audit/training-records/page.tsx` - Exception dashboard
- `apps/web/app/(app)/admin/audit/training-records/AuditActions.tsx` - Mark-resolved + run-now client actions
- `apps/web/app/(app)/admin/overrides/page.tsx` - Full-page override surveillance
- `apps/web/app/(app)/schedule/request/_components/BlockerList.tsx` - Inline blocker display
- `apps/web/app/(app)/schedule/request/_components/GrantOverrideDialog.tsx` - Override ceremony dialog

### Modified
- `apps/web/app/(app)/admin/people/[id]/page.tsx` - Added enrollment lookup + four panel section
- `apps/web/app/(app)/admin/enrollments/[id]/page.tsx` - Added four panels for active enrollments
- `apps/web/app/(app)/admin/dashboard/page.tsx` - Added ManagementOverridesPanel
- `apps/web/app/(app)/admin/layout.tsx` - Added Audit and Overrides sidebar links
- `apps/web/app/(app)/schedule/request/page.tsx` - Added role detection + search params
- `apps/web/app/(app)/schedule/request/ReservationForm.tsx` - Added eligibility integration + blocker/override UI

## Decisions Made

1. **Panel components are client components with enrollmentId prop:** Each panel independently fetches data via trpc hooks, allowing independent loading states and cache invalidation.
2. **Multi-enrollment: most-recent only with note:** Per CONTEXT.md Deferred Items, no tab group. When >1 active enrollment exists, shows informational note with link to enrollments list.
3. **ManagementOverridesPanel is server component:** Uses direct SQL rather than trpc client hooks for server-rendered dashboard performance. Derives status (active/consumed/revoked/expired) from row timestamps.
4. **Override ceremony uses amber/orange color scheme:** Matches the "legally significant" weight of Phase 4 section 91.409 overrun modal. Requires justification >= 20 chars, expiry date, and explicit checkbox confirmation.
5. **Eligibility query gated on all 4 IDs:** enrollmentId + lessonId + aircraftId + instructorUserId must all be present before the query fires, preventing unnecessary API calls.
6. **Raw SQL for chief-instructor detection:** The `is_chief_instructor` column exists in the DB (migration 0021) but was not added to the Drizzle schema. Used raw SQL instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict undefined vs null on ManagementOverridesPanel**
- **Found during:** Task 1b (typecheck)
- **Issue:** `Record<string, string | null>` index access returns `string | null | undefined` under noUncheckedIndexedAccess, but OverrideRow type declared `string | null`.
- **Fix:** Added explicit `?? null` coalescing on all nullable field mappings.
- **Files modified:** `apps/web/app/(app)/admin/_components/ManagementOverridesPanel.tsx`
- **Committed in:** `c8c0e3a`

**2. [Rule 3 - Blocking] Removed unused Drizzle imports from student profile page**
- **Found during:** Task 1b (lint)
- **Issue:** Added `studentCourseEnrollment`, `courseVersion`, `course` imports but used raw SQL for the enrollment query.
- **Fix:** Removed unused imports.
- **Files modified:** `apps/web/app/(app)/admin/people/[id]/page.tsx`
- **Committed in:** `c8c0e3a`

**3. [Rule 3 - Blocking] Used raw SQL for is_chief_instructor detection**
- **Found during:** Task 2 (typecheck)
- **Issue:** `userRoles.isChiefInstructor` does not exist in Drizzle schema (column added in migration 0021 but not reflected in schema TS).
- **Fix:** Switched to raw SQL query for role detection on /schedule/request page.
- **Files modified:** `apps/web/app/(app)/schedule/request/page.tsx`
- **Committed in:** `7173ce6`

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 3 blocking)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the three blocking issues documented above (all resolved inline).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All admin-facing Phase 6 UI is complete
- Plan 06-04 (student-facing UI) can reuse the four panel components from `_panels/`
- BlockerList + GrantOverrideDialog patterns established for any future eligibility surfaces
- 71 routes, full build green, ready for student UI extension

---
*Phase: 06-syllabus-rules-progression-audit*
*Completed: 2026-04-09*

## Self-Check: PASSED

All 10 created files verified on disk. All 3 task commits verified in git log.
