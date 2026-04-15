# Phase 8: Experience, Reporting, Messaging & Beta - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Part 61 School app feel like a single coherent product to every role, surface every number the school cares about via standard reports, and harden the system to the point a partner school can run daily operations on it. Specifically:

- **Student + instructor dashboards** (STU-01, INS-01, INS-02, INS-03) with document upload (STU-04)
- **In-app + email notifications** (SCH-10, NOT-01, NOT-02) for reservation lifecycle, grading, squawks, documents, currency
- **Dispatch audio/visual cues** (MSG-04) for high-priority events — overdue aircraft, grounded-aircraft attempted use, urgent messages
- **Full audit log** query UI + training-activity audit trail (REP-01, REP-02)
- **Live + projected student training cost** on the student profile (REP-03, REP-04)
- **Six standard reports** with CSV + PDF export (REP-05, REP-06) — fleet utilization, instructor utilization, student progress, no-show rate, squawk turnaround, course completion
- **Instructor metrics** — pass rate, duty-hour warnings, workload monitor (IPF-03, IPF-04, IPF-05)
- **Internal IM + admin broadcast + active-session view** (MSG-01, MSG-02, MSG-03)
- **Multi-base rollup** — reports filterable by base or aggregated across all bases (MUL-03)
- **Beta-readiness hardening** — CFI review of export templates for terminology compliance, E2E tests covering safety-critical flows (scheduling conflict, airworthiness gate, sign-off authority, currency/prerequisite block, rollover, override audit), and a partner-school onboarding runbook

Scope is 22 requirements total. This is the product-cohesion capstone before partner-school beta.

</domain>

<decisions>
## Implementation Decisions

### Role dashboards (STU-01, INS-01/02/03)

- **Layout:** card-grid, not stacked list — each section (next reservation, syllabus progress, currency, squawks, documents, etc.) is its own tile. Responsive (tiles stack on mobile).
- **Landing:** `/` redirects authenticated users to the role-appropriate dashboard — `/dashboard` for students/instructors/mechanics (new routes), `/admin/dashboard` for admins (exists). No separate nav link required.
- **Action affordance:** inline mini-actions on the dashboard — pending-grade rows open a grading drawer in place, reservation approvals have inline Approve/Deny buttons. Deep workflows (stage checks, full grading form) still drill in to their existing pages.
- **Expiring-items styling:** explicit day-count badge with color-coded urgency — green (>30d), yellow (8–30d), red (≤7d or expired). Sorted by urgency. Appears on both student and instructor dashboards where relevant.

### Student dashboard tiles (STU-01, STU-04)

- Next reservation (with aircraft, CFI, time, link to close-out if past)
- Current syllabus progress (stage + % complete, link to /record)
- Currency status (BFR, medical, FAA ID/cert, etc.) with color-coded expiry
- Outstanding squawks on the aircraft from the next reservation (calls attention to possible down-status before the flight)
- Expiring documents (medical, license, ID) with color-coded countdown
- **Document upload tile** (STU-04) — drag-and-drop medical, license, ID into the profile; show current uploaded files + expiry

### Instructor dashboard tiles (INS-01, INS-02, INS-03)

- Today's schedule (lessons assigned, aircraft, students)
- Assigned students list (deep-link to each student's /record)
- Pending grades queue — inline "Grade" button opens drawer
- Pending stage checks — drill in to stage-check page
- Reservation approval requests — inline Approve/Deny
- Workload ticker (hours scheduled this week, near-limit warning tied to IPF-04)

### Notifications + email (SCH-10, NOT-01, NOT-02)

- **Delivery model:** instant mirror — an in-app notification and an email fire together when an event triggers (if the user has that event-type enabled on both channels). No digest batching in v1.
- **Email provider:** **Resend** — free tier (3,000 emails/month, 100/day) comfortably covers beta scale. React Email templates for the 10+ transactional emails. `RESEND_API_KEY` as an env var; sender domain verification on deploy.
- **Default settings:** **role-based** — each role gets a curated default-on set:
  - Student: reservation events, grading-complete, own squawks, own document/currency expiring, admin broadcasts
  - Instructor: today's-schedule reminder, grading-complete on their students, stage-check results, assigned-aircraft squawks, duty-hour warnings, admin broadcasts
  - Mechanic: squawk opened/grounding, work-order assigned/due, admin broadcasts
  - Admin: all-of-above digest events + safety-critical
- **Safety-critical events cannot be disabled** — grounding, overdue aircraft, attempted-use of grounded aircraft. Users can opt out of channels but events always deliver in-app.
- **Reservation reminder cadence:** single 24-hour-before reminder. No 2-hour or 30-minute reminders in v1.
- **Settings UI:** per-event × per-channel toggle matrix on the user profile page.

### Messaging (MSG-01, MSG-02, MSG-03)

- **IM surface:** right-edge slide-out **drawer** triggered by a header icon with an unread red-dot badge. Conversation list on the left of the drawer, active thread on the right. Drawer is dismissible and doesn't pull the user off their current page.
- **Realtime transport:** **Supabase Realtime** — row-level subscriptions on the `messages` table (RLS-enforced) for message delivery, and on the `notifications` table for in-app notification badges. No custom websocket server, no polling fallback in v1.
- **Admin broadcast:** distinct from regular IM — shows as a dismissible pinned banner at the top of the recipient's dashboard until they acknowledge. Broadcasts also fire the normal notification pipeline (in-app + email per recipient prefs). Broadcasts are **read-only** to recipients — can't be replied to; users who want to respond open a new 1:1 IM with the admin.
- **Active-session view (MSG-03):** admin-only panel on `/admin` showing currently-logged-in users (session last-active in past 5 min), with a "DM" button that opens an IM thread in the drawer.

### Dispatch cues (MSG-04)

- **Silent flash** — red glow/pulse on the relevant dispatch row + a toast notification. No audio in v1 (dispatch rooms typically have a radio; competing audio is more annoying than helpful).
- **Event types:** overdue aircraft (past expected ramp-in), grounded-aircraft attempted use (real-time tie-in to SWIM/SCDS ADS-B position from Phase 7), urgent message (admin-broadcast marked "urgent").
- **Persistence:** visual cue stays active for 60 s or until acknowledged (click-to-dismiss), whichever comes first. Event is archived in the dispatch log regardless.

### Claude's Discretion

- Exact tile spacing, visual hierarchy, typography, animation timing on dashboards
- Exact email template copy and branding (follow `Documentation/` design language if present; otherwise clean utility design)
- Standard reports (REP-01 through REP-06 + IPF-03/04/05 + MUL-03) — **not discussed, open to planner**. Best guess: tabular data with column filters, CSV via a stream, PDF via `@react-pdf/renderer` (already in deps for Phase 5), multi-base filter as a URL param persisted in the URL bar.
- Cost display (REP-03, REP-04) surfaces on the student profile — exact visual (live number vs "to date + projected" split) is planner's call.
- Audit-log query UI (REP-01) on `/admin/audit/` — extend the existing `/admin/audit/training-records` route with a general-purpose filter (who / what / when / record-id).
- E2E test framework choice (Playwright vs Cypress) and exact test cases covering scheduling conflict / airworthiness gate / sign-off authority / currency/prerequisite block / rollover / override audit.
- Onboarding runbook format (Markdown in `docs/`? separate repo?) and contents.

</decisions>

<specifics>
## Specific Ideas

- Dashboard should feel like a "today and upcoming" cockpit — not a historical dashboard. Prioritize the next 24–72 hours of actionable items over historical metrics.
- Instructor dashboard is the key one for daily-ops velocity — being able to grade, approve, and see pending stage checks without leaving the screen matters more than pretty visuals.
- Email provider must be **free** for beta. Resend 3,000/month covers an expected 20–50 beta users + 30 events/day with headroom. If the school expands past that, Resend is $20/mo for 50k emails — not a lock-in risk.
- Broadcasts are the admin's bullhorn — they should be visually distinct from normal IM and impossible to ignore, but not modal/blocking. A pinned banner hits that target.
- Silent dispatch cues are a deliberate choice — the dispatch room already has ATC/unicom audio going. Flashing-only respects the operational environment.

</specifics>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Admin dashboard page** (`apps/web/app/(app)/admin/dashboard/page.tsx`): existing surface to evolve — pattern for new role dashboards.
- **Audit schema** (`packages/db/src/schema/audit.ts`): `audit_log` table already exists (append-only via RLS, populated via `audit.fn_log_change()` trigger on safety-relevant tables). Phase 8 builds a query UI on top — no schema changes expected beyond adding any still-missing trigger coverage.
- **Admin audit page** (`apps/web/app/(app)/admin/audit/training-records/page.tsx`): starting point to extend into a general-purpose audit-log filter UI.
- **Student record page** (`apps/web/app/(app)/record/page.tsx`): where cost display (REP-03/04) and additional student-facing summaries can hang.
- **@react-pdf/renderer**: already in deps from Phase 5 (export templates). Reuse for report PDF export.
- **Supabase Realtime**: client is already configured via `@supabase/ssr` + `@supabase/supabase-js`. Just needs channel subscriptions added.
- **pg_cron** (Phase 6): available for scheduled jobs — 24h-before reservation reminder will use this.
- **date-fns-tz**: already the project's timezone-aware date library. Use for expiration math on documents, currency, reminders.
- **Banned-terms ESLint rule** (`part61/no-banned-terms`): already enforces "Part 141"/"approved"/"certified course" prohibition in UI and exports/\*\*. Email templates and PDF reports fall under exports/ — covered automatically.

### Established Patterns

- **Per-procedure middleware** in tRPC routers for role + RLS context (set via `SET LOCAL app.school_id` wrap). New routers for notifications/messages/reports follow this pattern.
- **Soft-delete + audit trigger** on safety-relevant tables. New tables (notifications, messages, message_reads, broadcast_reads) should be evaluated for whether they're safety-relevant — messages likely yes (users can rely on them), notifications likely no (transient).
- **RLS-first with `pgPolicy`** on every new table. Per-user isolation on messages/notifications.
- **Timestamptz everywhere**. Reminder scheduling, message sent-at, notification delivered-at all timestamptz.

### Integration Points

- **Root layout** (`apps/web/app/layout.tsx`): currently imports globals.css + TRPCProvider. Add a `<RoleRedirect>` guard that redirects `/` to the role-appropriate dashboard post-login. Add a `<MessagingDrawer>` mounted once so it's available from every route.
- **App shell header** (`apps/web/app/(app)/layout.tsx`): currently has role switcher + base switcher + logout + page links. Add the messaging icon + notification bell here.
- **Dispatch screen** (`apps/web/app/(app)/dispatch/page.tsx`): existing route where dispatch cues land. Add realtime subscription + flash/toast handling.
- **pg_cron** → 24h-before-reservation reminder job that inserts notification rows (which then trigger Realtime events + Resend email sends).
- **Existing `admin.geofence` + ADS-B Tracker** (Phase 7): grounded-aircraft attempted use detection already has the data pipeline — just needs event publication into the notification/dispatch-cue system.

</code_context>

<deferred>
## Deferred Ideas

- **Digest email option** — instant-only in v1. If users complain of inbox volume, add daily-digest as an opt-in in a later phase.
- **SMS notifications** — email + in-app only in v1. SMS is an obvious add later but doubles the provider list (Twilio, etc.) and compliance surface area.
- **2-hour and 30-minute reservation reminders** — only 24h in v1. Add extra cadences if partner school requests them.
- **Audio dispatch cues** — silent-only in v1. Add an opt-in "audible mode" toggle if partner school operates without background radio.
- **Modal-blocking broadcasts** — banner-only in v1. Reserved for the extraordinary "must acknowledge right now" case (airport emergency, school-wide drill) in a later phase.
- **Group chats / channels in IM** — 1:1 and admin-broadcast only in v1.
- **Reaction emojis, attachments in IM** — text-only messages in v1.
- **Custom dashboard tile reordering / hide-show** — fixed tile sets per role in v1.
- **Scheduled email reports** ("Email me the fleet-utilization report every Monday") — on-demand exports only in v1.

</deferred>

---

_Phase: 08-experience-reporting-messaging-beta_
_Context gathered: 2026-04-14_
