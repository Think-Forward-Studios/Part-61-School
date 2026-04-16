# Terminology Review Checklist — Phase 8 Beta

**Purpose:** Every user-facing string in the app must pass CFI review for Part 61 terminology compliance. The following terms are BANNED in user-facing copy:

- ❌ `"Part 141"` — this is a Part 61 school; do not reference 141
- ❌ `"approved"` — use `"confirmed"` instead (Postgres enum internal values are exempt)
- ❌ `"certified course"` — use `"course"` or `"active course"` instead

The ESLint rule `part61/no-banned-terms` enforces this at build time for UI strings, but some locations (PDF templates, email templates, long-form copy) need human review.

**How to use this checklist:**

1. Open each file listed below.
2. For each highlighted string, confirm it:
   - [ ] Uses `"confirmed"` not `"approved"` in user-facing text
   - [ ] Uses `"training record"` not `"certified course record"`
   - [ ] Does NOT reference `"141"` or `"certified"` in descriptive text
   - [ ] For regulatory references (91.409, 61.195, 61.51, 61.65), uses the exact FAA phrasing
3. Initial each box.
4. Record any findings in the Sign-off section at the end.
5. File a gap issue for each finding; the engineering team will fix and re-submit for review.

---

## 1. Email Templates (apps/web/emails/)

These are the React Email templates rendered into email bodies by the Resend pipeline (from 08-01).

- [ ] `ReservationRequested.tsx` — subject line + body greeting + CTA button text
- [ ] `ReservationApproved.tsx` — **critical**: header should say "confirmed", NOT "approved". The Postgres enum value is `'approved'` but the copy must say "confirmed".
- [ ] `ReservationChanged.tsx` — change summary + CTA
- [ ] `ReservationCancelled.tsx` — apologetic tone, reason rendering
- [ ] `ReservationReminder24h.tsx` — 24-hour-before reminder, no claim of compliance
- [ ] `GradingComplete.tsx` — "Your lesson has been graded" (not "approved")
- [ ] `SquawkOpened.tsx` — squawk severity indicator + next steps
- [ ] `SquawkGrounding.tsx` — **safety-critical tone**: urgent but not alarmist; do not promise any specific resolution timeline
- [ ] `SquawkReturnedToService.tsx` — return-to-service signer (A&P or IA) displayed correctly
- [ ] `DocumentExpiring.tsx` — 30/14/7 day reminders; exact expiration date
- [ ] `CurrencyExpiring.tsx` — BFR / medical / IPC cadence; use "currency" not "recurrent training"
- [ ] `AdminBroadcast.tsx` — admin-authored content passes through verbatim; no automatic rewrite
- [ ] `DutyHourWarning.tsx` — **must cite FAR 61.195(a)(2) literally** and state the exact minutes used vs. the 480-minute limit

---

## 2. PDF Exports

Server-rendered via `@react-pdf/renderer`. These generate formal documents a school may submit to the FSDO or an examiner — text MUST be vetted.

- [ ] `apps/web/app/(app)/admin/reports/_pdfs/ReportPdfShell.tsx` (08-04)
  - Cover page title (per-report)
  - Column headers (all 6 reports)
  - Footer text
  - "Generated {date}" line
- [ ] `apps/web/app/(app)/record/courses/[enrollmentId]/export.pdf/route.ts` — 141.101-shaped training record PDF (Phase 5). **Re-review**: earlier review happened before a CFI was available. Ensure:
  - Cover page does NOT claim "Part 141 compliance"
  - No use of "approved curriculum"
- [ ] `apps/web/app/(app)/flight-log/iacra.pdf/route.ts` — IACRA 8710-1 hours PDF (Phase 5). Confirm wording matches IACRA form expectations without claiming approval.
- [ ] Airframe logbook PDF (Phase 4 — `apps/web/app/(app)/admin/aircraft/[id]/logbook/[book]/export.pdf/route.ts`)
- [ ] Engine logbook PDF (same file, parameterized by `book`)
- [ ] Prop logbook PDF (same file, parameterized by `book`)

---

## 3. Report Pages (08-04 UI)

Visible titles + column headers rendered at `/admin/reports/{slug}`. Each table header is CSV header verbatim.

- [ ] `/admin/reports` index — 6 card titles + descriptions
- [ ] `/admin/reports/fleet-utilization` — columns: Tail, Make/Model, Flight Hours, Scheduled Hours, Utilization %, Squawks
- [ ] `/admin/reports/instructor-utilization` — columns: Name, Email, Scheduled Hours, Flown Hours, **Pass Rate (First Attempt)** (specific to FAA checkrides — confirm wording), Workload Warnings, Duty Violations
- [ ] `/admin/reports/student-progress` — columns: Name, Course, % Complete, Hours Flown, **Ahead/Behind Days** (NOT "Behind Approved Plan")
- [ ] `/admin/reports/no-show-rate` — columns: Name, No-Shows, Total Reservations, No-Show Rate
- [ ] `/admin/reports/squawk-turnaround` — columns: Tail, Opened, Closed, Avg Hours to Resolve
- [ ] `/admin/reports/course-completion` — columns: Course, Version, Enrolled, Completed, **Completion Rate** (NOT "Certification Rate"), Avg Days

---

## 4. Notification Copy

Search for `createNotification(tx, {` across `packages/api/src/routers/**`. Review every `title` and `body` string.

Known notification kinds (from 08-01):

- [ ] `reservation_requested` — "New reservation request"
- [ ] `reservation_approved` — title should read "Reservation confirmed"
- [ ] `reservation_changed` — change summary in body
- [ ] `reservation_cancelled` — reason rendering
- [ ] `reservation_reminder_24h` — countdown phrasing
- [ ] `grading_complete` — "Your lesson has been graded"
- [ ] `squawk_opened` — title includes severity
- [ ] `squawk_grounding` — urgent but factual
- [ ] `squawk_returned_to_service` — RTS signer kind (A&P / IA)
- [ ] `document_expiring` — exact expiration date
- [ ] `currency_expiring` — CFI / medical / BFR / IPC
- [ ] `overdue_aircraft` — dispatch channel; flashing dispatch row
- [ ] `grounded_aircraft_attempted_use` — dispatch channel
- [ ] `admin_broadcast` — raw admin content; no rewrite
- [ ] `duty_hour_warning` — must cite FAR 61.195(a)(2)

All notifications should have working `linkUrl` values (no dead links).

---

## 5. UI Strings

- [ ] Dashboard tile headings (`StudentDashboard.tsx`, `InstructorDashboard.tsx`, `MechanicDashboard.tsx`) — 6 tiles each
- [ ] Admin dashboard section headers (Today's flight line, Pending approvals → **should read "Pending requests"**, Flight Information File, Instructor Workload)
- [ ] Form labels in `/schedule/request` (reservation form field labels + CTA button text)
- [ ] Close-out form copy (`apps/web/app/(app)/dispatch/_components/CloseOutForm.tsx` if present)
- [ ] Error toast messages — especially reservation approval errors ("approved" snuck in during earlier phases; confirm all surfaced messages now read "confirmed" or are SQL enum values with an `// allow-banned-term` comment)
- [ ] Rate configuration page (`/admin/rates`) — table headers + add-rate dialog
- [ ] Audit log table headers (`/admin/audit/logs`, `/admin/audit/activity-trail`)
- [ ] Active sessions table (`/admin/active-sessions`)
- [ ] Notification preferences matrix labels

---

## 6. Public Copy (not gated by banned-term lint)

- [ ] `/register` page copy — tagline, field labels, consent checkbox text
- [ ] `/login` page copy — "Sign in" (not "Log in" for consistency), tagline
- [ ] Invite email templates (if separate from in-app notifications) — link text + unsubscribe footer

---

## Sign-off

Reviewed by: ******************\_\_\_******************

CFI Cert #: ****************\_\_\_****************

Date: ********\_\_\_\_********

**Findings** (list each string that failed review and the recommended replacement):

1.
2.
3.
4.
5.

**Overall disposition:**

- [ ] Approved for beta — all strings pass
- [ ] Conditionally approved — findings in list above must be fixed before beta
- [ ] Not approved — resubmit after rework

---

## Cross-references

- Banned-term rule: `packages/config/banned-terms.json`
- ESLint plugin: `packages/config/eslint-plugin/no-banned-terms.js`
- Email template directory: `apps/web/emails/`
- Notification helper: `packages/api/src/helpers/notifications.ts`
- Onboarding runbook: [`docs/onboarding-runbook.md`](./onboarding-runbook.md) (Part G references this checklist as the go-live gate)
