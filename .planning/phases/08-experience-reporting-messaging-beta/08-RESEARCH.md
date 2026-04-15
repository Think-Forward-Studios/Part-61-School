# Phase 8: Experience, Reporting, Messaging & Beta — Research

**Researched:** 2026-04-14
**Domain:** Role dashboards · notifications · email · realtime messaging · reports · audit UI · cost · beta hardening
**Confidence:** HIGH for standard stack and integration, MEDIUM on pass-rate source of truth, MEDIUM on some Supabase-Realtime-at-scale nuances

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Role dashboards (STU-01, INS-01/02/03)**

- Layout: card-grid, not stacked list — each section (next reservation, syllabus progress, currency, squawks, documents, etc.) is its own tile. Responsive (tiles stack on mobile).
- Landing: `/` redirects authenticated users to the role-appropriate dashboard — `/dashboard` for students/instructors/mechanics (new routes), `/admin/dashboard` for admins (exists). No separate nav link required.
- Action affordance: inline mini-actions on the dashboard — pending-grade rows open a grading drawer in place, reservation approvals have inline Approve/Deny buttons. Deep workflows (stage checks, full grading form) still drill in to their existing pages.
- Expiring-items styling: explicit day-count badge with color-coded urgency — green (>30d), yellow (8–30d), red (≤7d or expired). Sorted by urgency. Appears on both student and instructor dashboards where relevant.

**Student dashboard tiles (STU-01, STU-04)**

- Next reservation (with aircraft, CFI, time, link to close-out if past)
- Current syllabus progress (stage + % complete, link to /record)
- Currency status (BFR, medical, FAA ID/cert, etc.) with color-coded expiry
- Outstanding squawks on the aircraft from the next reservation
- Expiring documents (medical, license, ID) with color-coded countdown
- Document upload tile (STU-04) — drag-and-drop medical, license, ID into the profile; show current uploaded files + expiry

**Instructor dashboard tiles (INS-01, INS-02, INS-03)**

- Today's schedule (lessons assigned, aircraft, students)
- Assigned students list (deep-link to each student's /record)
- Pending grades queue — inline "Grade" button opens drawer
- Pending stage checks — drill in to stage-check page
- Reservation approval requests — inline Approve/Deny
- Workload ticker (hours scheduled this week, near-limit warning tied to IPF-04)

**Notifications + email (SCH-10, NOT-01, NOT-02)**

- Delivery model: instant mirror — an in-app notification and an email fire together when an event triggers (if the user has that event-type enabled on both channels). No digest batching in v1.
- Email provider: **Resend** — free tier (3,000 emails/month, 100/day). React Email templates for 10+ transactional emails. `RESEND_API_KEY` env var; sender domain verification on deploy.
- Default settings: role-based curated default-on set (Student/Instructor/Mechanic/Admin — see CONTEXT for per-role lists).
- Safety-critical events cannot be disabled — grounding, overdue aircraft, attempted-use of grounded aircraft. Users can opt out of channels but events always deliver in-app.
- Reservation reminder cadence: single 24-hour-before reminder. No 2-hour or 30-minute reminders in v1.
- Settings UI: per-event × per-channel toggle matrix on the user profile page.

**Messaging (MSG-01, MSG-02, MSG-03)**

- IM surface: right-edge slide-out drawer triggered by a header icon with an unread red-dot badge. Conversation list on the left of the drawer, active thread on the right. Drawer is dismissible and doesn't pull the user off their current page.
- Realtime transport: **Supabase Realtime** — row-level subscriptions on the `messages` table (RLS-enforced) for message delivery, and on the `notifications` table for in-app notification badges. No custom websocket server, no polling fallback in v1.
- Admin broadcast: distinct from regular IM — dismissible pinned banner at the top of the recipient's dashboard until acknowledged. Broadcasts also fire the normal notification pipeline. Broadcasts are read-only to recipients — can't be replied to.
- Active-session view (MSG-03): admin-only panel on `/admin` showing currently-logged-in users (session last-active in past 5 min), with a "DM" button that opens an IM thread in the drawer.

**Dispatch cues (MSG-04)**

- Silent flash — red glow/pulse on the relevant dispatch row + a toast notification. No audio in v1.
- Event types: overdue aircraft (past expected ramp-in), grounded-aircraft attempted use (real-time tie-in to SWIM/SCDS ADS-B position from Phase 7), urgent message (admin-broadcast marked "urgent").
- Persistence: visual cue stays active for 60 s or until acknowledged (click-to-dismiss), whichever comes first. Event is archived in the dispatch log regardless.

### Claude's Discretion

- Exact tile spacing, visual hierarchy, typography, animation timing on dashboards
- Exact email template copy and branding (follow `Documentation/` design language if present; otherwise clean utility design)
- Standard reports (REP-01 through REP-06 + IPF-03/04/05 + MUL-03) — not discussed, open to planner. Best guess: tabular data with column filters, CSV via a stream, PDF via `@react-pdf/renderer` (already in deps for Phase 5), multi-base filter as a URL param persisted in the URL bar.
- Cost display (REP-03, REP-04) surfaces on the student profile — exact visual (live number vs "to date + projected" split) is planner's call.
- Audit-log query UI (REP-01) on `/admin/audit/` — extend the existing `/admin/audit/training-records` route with a general-purpose filter (who / what / when / record-id).
- E2E test framework choice (Playwright vs Cypress) and exact test cases covering scheduling conflict / airworthiness gate / sign-off authority / currency/prerequisite block / rollover / override audit.
- Onboarding runbook format (Markdown in `docs/`? separate repo?) and contents.

### Deferred Ideas (OUT OF SCOPE)

- Digest email option — instant-only in v1.
- SMS notifications — email + in-app only in v1.
- 2-hour and 30-minute reservation reminders — only 24h in v1.
- Audio dispatch cues — silent-only in v1.
- Modal-blocking broadcasts — banner-only in v1.
- Group chats / channels in IM — 1:1 and admin-broadcast only in v1.
- Reaction emojis, attachments in IM — text-only messages in v1.
- Custom dashboard tile reordering / hide-show — fixed tile sets per role in v1.
- Scheduled email reports — on-demand exports only in v1.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                         | Research Support                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| STU-01 | Student dashboard: next reservation, syllabus progress, currency, squawks on next aircraft, expiring docs           | See §Dashboard Architecture + §Expiry Color Helper. Reuse patterns from existing `/page.tsx` student branch and `/record/page.tsx`.          |
| STU-04 | Student can upload medical/license/ID to profile                                                                    | Reuse Phase 1 documents router + Supabase Storage. §Document Upload Tile.                                                                    |
| INS-01 | Instructor dashboard: today's schedule, assigned students, pending grades, pending stage checks                     | §Dashboard Architecture. Reuse `lesson_grade_sheet` + `stage_check` + reservation queries.                                                   |
| INS-02 | Instructor can view any of their students' training records (read+grade, no destructive actions)                    | Reuse existing `/admin/students/[id]` route; gate by instructor-assignment relation. §Instructor-Student Linkage.                            |
| INS-03 | Grade lesson, sign endorsements, approve reservations from a single workflow                                        | §Inline Action Drawer pattern. `gradeSheet` router + `schedule` router already exist.                                                        |
| SCH-10 | Notification (in-app + email) on reservation request, approval, change, reminder                                    | §Notifications Outbox + §Resend Integration + §pg_cron 24h reminder job.                                                                     |
| NOT-01 | In-app notifications for reservation/grading/squawk/document/currency events                                        | §Notifications Data Model + event source trigger pattern.                                                                                    |
| NOT-02 | Email notifications same events, configurable per user                                                              | §User Notification Preferences + Resend dispatcher.                                                                                          |
| IPF-03 | Instructor pass rate — % of students passing checkrides first attempt                                               | §Pass Rate Source of Truth — **OPEN QUESTION**: `stage_check` has pass/fail but no "checkride first attempt" flag. Options documented below. |
| IPF-04 | Instructor duty-hour violation warnings (FAR 61.195)                                                                | §Duty-Hour Computation. FAR 61.195(a)(2) = 8 hrs / 24h period, no FAR-mandated weekly limit. §Schedule-time Check.                           |
| IPF-05 | Admin workload monitor panel                                                                                        | §Workload Aggregation Query.                                                                                                                 |
| REP-01 | Audit log queryable by user / record / date range                                                                   | §Audit Log Query UI. `audit_log` table + indexes already exist in Phase 1.                                                                   |
| REP-02 | Training activity audit trail — scheduler, authorizer, ramp-out, ramp-in, completion                                | §Training Activity View. Derive from existing `reservation` + `flight_log_entry` + `lesson_grade_sheet` — no new schema.                     |
| REP-03 | Up-to-the-minute student training cost                                                                              | §Cost Tracking Schema (new `school_rate` table) + live-cost view.                                                                            |
| REP-04 | Projected total cost through course completion                                                                      | §Projected Cost Computation — uses Phase 6 `student_minimums` + rates.                                                                       |
| REP-05 | Six standard reports (fleet util, instructor util, student progress, no-show, squawk turnaround, course completion) | §Standard Reports Catalog — one tRPC `reports.*` procedure per report, shared CSV/PDF emitters.                                              |
| REP-06 | CSV + PDF export                                                                                                    | §CSV Route Handler pattern + @react-pdf reuse. Existing patterns at `/flight-log/iacra.csv` and `/record/courses/[id]/export.pdf`.           |
| MSG-01 | Internal IM with unread badge                                                                                       | §Messaging Data Model + §Realtime Subscription Pattern.                                                                                      |
| MSG-02 | Admin broadcast to a role                                                                                           | §Broadcast Data Model + recipient fan-out.                                                                                                   |
| MSG-03 | Admin active-session view                                                                                           | §Active Session Tracking — **NEW `user_session_activity` table** because Supabase `auth.sessions` is not exposed.                            |
| MSG-04 | Dispatch audio/visual cue for high-priority events                                                                  | §Dispatch Cue Pattern — realtime subscribe on `notifications` filtered to `dispatch=true`.                                                   |
| MUL-03 | Reports and dashboards filterable by base or rolled up                                                              | §Multi-Base Filter. `base_id` filter via URL param; admin can select "All bases" to roll up.                                                 |

</phase_requirements>

## Summary

Phase 8 is a product-cohesion capstone that introduces three new cross-cutting pieces of infrastructure on top of an already-mature foundation: (1) a notifications + email pipeline driven by Resend, (2) Supabase Realtime channels for IM and notification badges, and (3) a standard-reports engine with CSV/PDF export. It also ships role dashboards, a full audit-log query UI, live + projected cost tracking, instructor performance metrics, multi-base rollup, and beta hardening (E2E tests, onboarding runbook). The codebase already has Drizzle RLS, tRPC per-procedure middleware, a `withTenantTx` wrapper that sets `SET LOCAL app.school_id`, pg_cron (Phase 6), `@react-pdf/renderer` (Phase 5), and existing CSV/PDF route-handler patterns — so infrastructure reuse is the primary theme, not green-field design.

The biggest new-infrastructure call is **notification delivery**: the cleanest model is a **transactional outbox** — tRPC mutations (and pg_cron jobs) insert rows into `notifications` inside the same transaction as the business-data mutation; Supabase Realtime streams those rows to connected clients for the in-app bell; a separate email dispatcher (Edge Function or Next.js Route Handler triggered via pg_net / webhook / cron) processes the `notifications` → `email_outbox` queue against Resend. This keeps the write path atomic with the business mutation, keeps email-send failures from breaking the user-facing action, and stays within Resend's 3,000/month free tier for the expected 20–50-user beta.

The biggest **unknown** is the source-of-truth for IPF-03 "pass rate on first attempt": the existing `stage_check` table has pass/fail but no FAA-checkride-versus-internal-stage-check discriminator. Recommendation: add a nullable `is_faa_checkride boolean` column to `stage_check` (non-breaking) and key pass-rate off that flag.

**Primary recommendation:** Ship Phase 8 as five plans — (08-01) notifications + email infra + Realtime, (08-02) dashboards + messaging drawer + broadcast, (08-03) audit UI + cost tracking + instructor metrics, (08-04) standard reports + multi-base rollup, (08-05) E2E hardening + CFI review + onboarding runbook. New tables land in one migration at the top of 08-01; everything downstream reads from them.

## Standard Stack

### Core

| Library                   | Version                        | Purpose                                                   | Why Standard                                                                                                                                        |
| ------------------------- | ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resend`                  | `^4.x`                         | Transactional email API SDK                               | Locked by CONTEXT. Resend SDK is idiomatic for Next.js 15, free tier covers beta scale (3,000/mo, 100/day).                                         |
| `@react-email/components` | `^0.0.32+`                     | React components for email templates                      | Pairs with Resend; declarative, testable, type-safe email authoring.                                                                                |
| `@react-email/render`     | `^1.x`                         | SSR render React Email to HTML                            | Needed when passing React to Resend; `resend.emails.send({ react: ... })` handles this internally but explicit render is useful for snapshot tests. |
| `@supabase/supabase-js`   | `^2.101.1` (already installed) | Realtime client for Postgres changes + broadcast channels | Already in deps via Phase 1; no new install needed. Realtime Authorization (v2.44+) is available.                                                   |
| `@react-pdf/renderer`     | `4.4.0` (already installed)    | PDF generation for report exports                         | Already in deps from Phase 4 logbook + Phase 5 141.101/IACRA exports.                                                                               |
| `date-fns-tz`             | (already installed)            | Timezone-aware date math for expiry, reminders            | Project-standard; already used across `/record` and admin pages.                                                                                    |

### Supporting

| Library                 | Version  | Purpose                                   | When to Use                                                                                                  |
| ----------------------- | -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@playwright/test`      | `^1.48+` | E2E tests for safety-critical flows       | Recommended over Cypress (see §E2E Framework Decision). Not yet installed.                                   |
| `pg_cron` (extension)   | —        | Nightly report caching + 24h reminder job | Already registered in migration `0029_phase6_pg_cron.sql`; reuse the wrapping DO-block pattern for new jobs. |
| `@react-email/tailwind` | `^1.x`   | Tailwind-in-email (optional)              | Useful if email templates should share styling with the app; otherwise use inline styles.                    |

### Alternatives Considered

| Instead of                           | Could Use                                            | Tradeoff                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend                               | Postmark, SendGrid, AWS SES                          | Rejected — locked by CONTEXT. Resend has the cleanest React Email integration for Next.js and a truly free beta tier.                                                                                                                                                                                |
| Supabase Realtime `postgres_changes` | Supabase Realtime `broadcast` with DB-sourced events | postgres_changes runs a single thread and is RLS-checked per row (can become a bottleneck at scale). For Phase 8 scale (20–50 users × ~30 events/day), postgres_changes is the simpler option. Broadcast-from-DB (via `realtime.send`) is an available escape hatch if performance becomes an issue. |
| `@react-pdf/renderer`                | Puppeteer/headless Chromium                          | Rejected — @react-pdf is already in deps, Puppeteer is heavy and requires a chromium binary that Vercel's edge doesn't ship by default.                                                                                                                                                              |
| Playwright                           | Cypress                                              | Playwright wins in 2026: cross-browser real Safari/WebKit support, parallel-by-default (no paid tier), native multi-tab / multi-context, better for Supabase RLS-test-harness style workflows. See §E2E Framework Decision.                                                                          |

### Installation

```bash
# Phase 8 additions
pnpm --filter web add resend @react-email/components @react-email/render
pnpm --filter web add -D @playwright/test
# Playwright browser binaries (CI + local):
pnpm --filter web exec playwright install --with-deps chromium firefox webkit
```

No installs needed for Supabase Realtime, @react-pdf/renderer, or date-fns-tz — already present in `apps/web/package.json`.

## Architecture Patterns

### Recommended New Files / Modules

```
packages/db/src/schema/
├── notification.ts           # NEW: notifications + user_notification_pref + email_outbox
├── messaging.ts              # NEW: conversation + message + message_read + broadcast + broadcast_read
├── session_activity.ts       # NEW: user_session_activity (MSG-03)
├── school_rate.ts            # NEW: school_rate (REP-03/04 billable-hour rates)

packages/db/migrations/
├── 0032_phase8_notifications.sql      # tables + RLS + indexes + audit attach (where safety-relevant)
├── 0033_phase8_messaging.sql
├── 0034_phase8_cost_and_rates.sql
├── 0035_phase8_pg_cron_reminders.sql  # 24h reservation reminder; optional nightly reports cache
├── 0036_phase8_stage_check_faa_flag.sql  # adds is_faa_checkride to stage_check (IPF-03)

packages/api/src/routers/
├── notifications.ts          # list/markRead/markAllRead/updatePrefs
├── messaging.ts              # conversations.list / threads.list / send / markRead
├── broadcasts.ts             # create (admin), list, acknowledge
├── reports/
│   ├── _root.ts
│   ├── fleetUtilization.ts
│   ├── instructorUtilization.ts
│   ├── studentProgress.ts
│   ├── noShowRate.ts
│   ├── squawkTurnaround.ts
│   └── courseCompletion.ts
├── admin/
│   ├── audit.ts              # query audit_log (REP-01) — extend admin/_root
│   ├── activeSessions.ts     # MSG-03
│   ├── rates.ts              # school_rate CRUD
├── cost.ts                   # REP-03/04 live + projected for a student
├── instructorMetrics.ts      # IPF-03/04/05 aggregates

apps/web/app/(app)/
├── dashboard/                # NEW — student + instructor + mechanic role dashboards
│   └── page.tsx              # resolves active role, renders RoleDashboard component tree
├── admin/audit/
│   ├── logs/                 # NEW — general-purpose audit_log query UI (REP-01)
│   │   └── page.tsx
│   └── activity-trail/       # NEW — REP-02 training activity trail
│       └── page.tsx
├── admin/reports/            # NEW — 6 standard reports with tabs + filter panel
│   ├── page.tsx              # index / landing
│   ├── fleet-utilization/page.tsx
│   ├── fleet-utilization/export.csv/route.ts
│   ├── fleet-utilization/export.pdf/route.ts
│   ├── instructor-utilization/…
│   ├── student-progress/…
│   ├── no-show-rate/…
│   ├── squawk-turnaround/…
│   └── course-completion/…
├── admin/rates/              # NEW — admin UI for configuring per-hour rates
│   └── page.tsx
├── admin/active-sessions/    # NEW — MSG-03 panel
│   └── page.tsx
├── profile/                  # NEW or extend — notification prefs + document upload
│   └── notifications/page.tsx
├── page.tsx                  # EXTEND — role-redirect to /dashboard or /admin/dashboard

apps/web/app/api/
├── emails/send/route.ts      # Node runtime worker; consumes email_outbox, calls Resend
│                             # Invoked via pg_cron → pg_net → this route, OR via webhook on trigger

apps/web/components/
├── MessagingDrawer.tsx       # NEW — globally-mounted right-edge drawer
├── MessagingDrawerProvider.tsx
├── NotificationBell.tsx      # NEW — header icon + unread badge + dropdown list
├── BroadcastBanner.tsx       # NEW — pinned dismissible banner for active broadcasts
├── DashboardTile.tsx         # NEW — reusable card/tile shell
├── ExpiryBadge.tsx           # NEW — color-coded day-count badge (STU-01 / IPF-01)
├── dashboard/
│   ├── StudentDashboard.tsx
│   ├── InstructorDashboard.tsx
│   ├── MechanicDashboard.tsx
│   ├── GradingActionDrawer.tsx
│   └── ReservationApproveInline.tsx
├── reports/
│   ├── ReportShell.tsx       # shared tab + filter + export buttons layout
│   └── BaseFilter.tsx        # MUL-03 — "All bases" | specific base
├── dispatch/
│   ├── CueSubscriber.tsx     # NEW — realtime subscription + flash/toast (MSG-04)

apps/web/emails/              # NEW — React Email templates
├── _components/              # shared header/footer/button
├── ReservationRequested.tsx
├── ReservationApproved.tsx
├── ReservationChanged.tsx
├── ReservationReminder24h.tsx
├── GradingComplete.tsx
├── SquawkOpened.tsx
├── SquawkGrounding.tsx
├── SquawkReturnedToService.tsx
├── DocumentExpiring.tsx
├── CurrencyExpiring.tsx
└── AdminBroadcast.tsx

tests/e2e/                    # NEW — Playwright E2E for safety-critical flows
├── playwright.config.ts
├── fixtures/
│   ├── auth.ts               # storageState-based login
│   └── seed.ts
├── scheduling-conflict.spec.ts
├── airworthiness-gate.spec.ts
├── sign-off-authority.spec.ts
├── currency-prerequisite-block.spec.ts
├── rollover.spec.ts
└── override-audit.spec.ts

docs/
├── onboarding-runbook.md     # NEW — partner-school onboarding procedure
└── phase8-terminology-review.md  # CFI export-template review checklist
```

---

### Pattern 1: Notifications Outbox + Realtime (transactional + at-least-once email)

**What:** tRPC mutations insert notification rows inside the same Drizzle transaction as the business mutation. Supabase Realtime streams inserts to connected clients for the bell icon. A separate worker (Next.js Route Handler scheduled by pg_cron) drains `email_outbox` → Resend with idempotency keys.

**When to use:** Every user-visible event (reservation events, grading complete, squawks, document/currency expiring). This is the single spine NOT-01 + NOT-02 + SCH-10 all hang off.

**Core tables (draft):**

```typescript
// packages/db/src/schema/notification.ts
// Source: Locked by CONTEXT §Notifications + §Messaging
// Verified pattern from: transactional outbox + LISTEN/NOTIFY
// (https://thinhdanggroup.github.io/postgres-as-a-message-bus/)

export const notificationEventKindEnum = pgEnum('notification_event_kind', [
  'reservation_requested',
  'reservation_approved',
  'reservation_changed',
  'reservation_cancelled',
  'reservation_reminder_24h',
  'grading_complete',
  'squawk_opened',
  'squawk_grounding',
  'squawk_returned_to_service',
  'document_expiring',
  'currency_expiring',
  'overdue_aircraft',
  'grounded_aircraft_attempted_use',
  'admin_broadcast',
  'duty_hour_warning',
  // Extend as new events land
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'dispatch', // MSG-04 — dispatch-screen cue
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id), // nullable for school-wide events
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id), // recipient
    kind: notificationEventKindEnum('kind').notNull(),
    channel: notificationChannelEnum('channel').notNull().default('in_app'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    linkUrl: text('link_url'),
    // link to the domain object — polymorphic by (table_name, record_id) like audit_log
    sourceTable: text('source_table'),
    sourceRecordId: uuid('source_record_id'),
    severity: text('severity').notNull().default('info'), // 'info' | 'warn' | 'critical'
    isSafetyCritical: boolean('is_safety_critical').notNull().default(false), // always delivers in-app
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }), // null = unread
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [
    index('notifications_user_unread_idx')
      .on(t.userId, t.createdAt)
      .where(sql`read_at is null`),
    index('notifications_school_created_idx').on(t.schoolId, t.createdAt),
    pgPolicy('notifications_select_own', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`user_id = auth.uid() and school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    // INSERT allowed only for same-school/tenant rows — tRPC owns the write path.
    pgPolicy('notifications_insert_own_school', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    // UPDATE allowed only to mark own rows read/dismissed
    pgPolicy('notifications_update_own', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

export const userNotificationPref = pgTable(
  'user_notification_pref',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: notificationEventKindEnum('kind').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.channel] }),
    pgPolicy('user_notification_pref_own', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

// Email outbox — decouples notification creation from email send
export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull(),
  notificationId: uuid('notification_id')
    .notNull()
    .references(() => notifications.id),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  templateKey: text('template_key').notNull(), // 'reservation_approved' etc
  templateProps: jsonb('template_props').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(), // Resend uses this
  status: text('status').notNull().default('pending'), // pending | sending | sent | failed
  sentAt: timestamp('sent_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Helper pattern — `createNotification()`:**

```typescript
// packages/api/src/helpers/notifications.ts
// Called from tRPC mutations inside withTenantTx so the INSERT
// participates in the caller's transaction.

export async function createNotification(
  tx: PgTransaction,
  opts: {
    schoolId: string;
    userId: string;
    kind: NotificationEventKind;
    title: string;
    body: string;
    linkUrl?: string;
    sourceTable?: string;
    sourceRecordId?: string;
    severity?: 'info' | 'warn' | 'critical';
    isSafetyCritical?: boolean;
    emailTemplateKey?: string;
    emailTemplateProps?: Record<string, unknown>;
    baseId?: string;
  },
): Promise<void> {
  // 1. Look up user's prefs for this kind (row-missing = default from role-based seed)
  const prefs = await tx.execute(sql`
    select channel, enabled from public.user_notification_pref
      where user_id = ${opts.userId}::uuid and kind = ${opts.kind}
  `);
  const inAppEnabled =
    opts.isSafetyCritical || prefs.some((p) => p.channel === 'in_app' && p.enabled);
  const emailEnabled =
    !opts.isSafetyCritical /*safety-critical never sends email per CONTEXT? verify*/ &&
    prefs.some((p) => p.channel === 'email' && p.enabled);

  // 2. Insert in-app notification row (fires Realtime subscription)
  let notifId: string | undefined;
  if (inAppEnabled) {
    const rows = await tx.execute(sql`
      insert into public.notifications
        (school_id, base_id, user_id, kind, channel, title, body, link_url,
         source_table, source_record_id, severity, is_safety_critical)
      values (${opts.schoolId}::uuid, ${opts.baseId ?? null}::uuid, ${opts.userId}::uuid,
        ${opts.kind}, 'in_app', ${opts.title}, ${opts.body}, ${opts.linkUrl ?? null},
        ${opts.sourceTable ?? null}, ${opts.sourceRecordId ?? null}::uuid,
        ${opts.severity ?? 'info'}, ${opts.isSafetyCritical ?? false})
      returning id
    `);
    notifId = rows[0]?.id;
  }

  // 3. Enqueue email if enabled — idempotency key = notification id + kind
  if (emailEnabled && opts.emailTemplateKey && notifId) {
    const userRow = await tx.execute(sql`
      select email from public.users where id = ${opts.userId}::uuid
    `);
    const toEmail = userRow[0]?.email;
    if (toEmail) {
      await tx.execute(sql`
        insert into public.email_outbox
          (school_id, notification_id, to_email, subject, template_key,
           template_props, idempotency_key)
        values (${opts.schoolId}::uuid, ${notifId}::uuid, ${toEmail}, ${opts.title},
          ${opts.emailTemplateKey}, ${JSON.stringify(opts.emailTemplateProps ?? {})}::jsonb,
          ${notifId + ':' + opts.kind})
        on conflict (idempotency_key) do nothing
      `);
    }
  }
}
```

**Email dispatcher (runs outside the user-facing transaction):**

```typescript
// apps/web/app/api/emails/send/route.ts
// Called by pg_cron every minute (pg_net) or by a webhook after notifications insert.
// Claims rows with FOR UPDATE SKIP LOCKED — safe to run multiple workers.
// Calls Resend with idempotency-key header so retries don't duplicate sends.

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // Auth: shared-secret header to keep this endpoint private
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.INTERNAL_WORKER_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false });

  const rows = await sql`
    select id, to_email, subject, template_key, template_props, idempotency_key, attempts
      from public.email_outbox
     where status = 'pending'
       and attempts < 5
     order by created_at asc
     limit 50
     for update skip locked
  `;

  for (const row of rows) {
    await sql`update public.email_outbox set status = 'sending', attempts = attempts + 1 where id = ${row.id}`;
    try {
      const template = loadEmailTemplate(row.template_key, row.template_props);
      await resend.emails.send({
        from: 'Part 61 School <noreply@yourdomain.test>',
        to: row.to_email,
        subject: row.subject,
        react: template,
        headers: { 'X-Entity-Ref-ID': row.idempotency_key }, // Resend idempotency is on batch endpoint only
      });
      await sql`update public.email_outbox set status = 'sent', sent_at = now() where id = ${row.id}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql`
        update public.email_outbox
           set status = ${row.attempts >= 4 ? 'failed' : 'pending'},
               failed_at = case when ${row.attempts >= 4} then now() else failed_at end,
               error_message = ${msg}
         where id = ${row.id}
      `;
    }
  }

  return Response.json({ processed: rows.length });
}
```

**Why this shape:**

- **Transactional atomicity** — notification-row insert rolls back if the business mutation rolls back; no stranded "you got approved!" emails when the approval actually failed
- **Idempotent retries** — `email_outbox.idempotency_key` unique + Resend idempotency headers mean worker restarts can't double-send
- **Realtime for free** — the same notification row that the worker drains also fires `postgres_changes` for the bell icon
- **Decouples read-time from send-time** — if Resend is rate-limited (2 req/s default), the outbox just accumulates and drains slowly; user-facing actions never wait on Resend
- **Safety-critical bypass** — `is_safety_critical` rows always write the in-app row regardless of prefs
- **Free-tier headroom** — beta scale = ~50 users × ~30 events/day = 1,500/day, well under Resend's 3,000/month at email-enabled-per-event rates. Most events go to a single user.

---

### Pattern 2: Supabase Realtime — per-user notification subscription

**What:** Subscribe to `postgres_changes` on `notifications` filtered to the current user's `user_id`. RLS does the per-row authorization (policy already matches `user_id = auth.uid()`).

**When to use:** Notification bell dropdown, messaging drawer, dispatch-cue subscriber.

```typescript
// apps/web/components/NotificationBell.tsx
'use client';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { trpc } from '@/lib/trpc/client';

export function NotificationBell({ userId }: { userId: string }) {
  const { data, refetch } = trpc.notifications.unreadList.useQuery();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`notifications:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`, // still checked against RLS
        },
        () => {
          void refetch(); // re-fetch the list via tRPC
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => void refetch(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  useEffect(() => {
    setBadge(data?.length ?? 0);
  }, [data]);

  return (/* bell icon + badge + dropdown */);
}
```

**Source:** [Supabase Realtime Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) — HIGH confidence

---

### Pattern 3: Inline Action Drawer (INS-03 single workflow)

**What:** A right-edge drawer (separate from the messaging drawer) that opens in place when an instructor clicks "Grade" on a pending-grade row. Mounts a minimal grading form that posts to the existing `gradeSheet` router. Approve/Deny on reservation approval rows calls `schedule.approve` optimistically.

**When to use:** Instructor dashboard tiles for pending grades, pending reservation approvals.

```typescript
// apps/web/components/dashboard/GradingActionDrawer.tsx
'use client';
import { trpc } from '@/lib/trpc/client';

export function GradingActionDrawer({ gradeSheetId, onClose }: Props) {
  const utils = trpc.useUtils();
  const { data: sheet } = trpc.gradeSheet.get.useQuery({ id: gradeSheetId });
  const save = trpc.gradeSheet.updateLineItem.useMutation({
    onSuccess: () => void utils.gradeSheet.listPending.invalidate(),
  });
  // render minimal grade input per line item, optimistic-UI friendly
}
```

---

### Pattern 4: Messaging Data Model

**What:** A `conversation` row per 1:1 pair (deterministic key = `LEAST(userA, userB), GREATEST(userA, userB)` uniquely indexed) + `message` rows + `message_read` per-user watermark. Broadcasts are a separate table with per-recipient `broadcast_read`.

```typescript
// packages/db/src/schema/messaging.ts

export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userALow: uuid('user_a_low').notNull(), // LEAST(u1, u2)
    userBHigh: uuid('user_b_high').notNull(), // GREATEST(u1, u2)
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversation_pair_uq').on(t.schoolId, t.userALow, t.userBHigh),
    pgPolicy('conversation_select_participant', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`user_a_low = auth.uid() or user_b_high = auth.uid()`,
    }),
  ],
);

export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('message_conversation_idx').on(t.conversationId, t.sentAt),
    pgPolicy('message_select_participant', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`conversation_id in (
      select id from public.conversation
       where user_a_low = auth.uid() or user_b_high = auth.uid()
    )`,
    }),
    pgPolicy('message_insert_sender', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`sender_id = auth.uid() and conversation_id in (
      select id from public.conversation
       where user_a_low = auth.uid() or user_b_high = auth.uid()
    )`,
    }),
  ],
);

export const messageRead = pgTable(
  'message_read',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const broadcast = pgTable('broadcast', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  baseId: uuid('base_id').references(() => bases.id),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id), // must be admin — enforced at tRPC
  targetRoles: text('target_roles').array().notNull(), // {student,instructor,mechanic,admin,all}
  title: text('title').notNull(),
  body: text('body').notNull(),
  urgency: text('urgency').notNull().default('normal'), // normal | urgent
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = until dismissed
});

export const broadcastRead = pgTable(
  'broadcast_read',
  {
    broadcastId: uuid('broadcast_id')
      .notNull()
      .references(() => broadcast.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.broadcastId, t.userId] })],
);
```

**Broadcast fan-out:** On broadcast create, the tRPC mutation also inserts one `notifications` row per target recipient (same transaction). The pinned-banner UI subscribes to `broadcast` inserts + checks `broadcast_read` to show/hide. Normal notification pipeline fires `admin_broadcast` kind so email goes out too.

---

### Pattern 5: Audit Log Query UI (REP-01)

**What:** `/admin/audit/logs` page with filters: user / table / record_id / action / date range. Backed by existing `audit_log` indexes (`audit_log_table_record_idx`, `audit_log_user_at_idx`, `audit_log_school_at_idx`). Server-component page with URL-param-driven filters; keyset pagination by `(at desc, id desc)`.

**When to use:** General-purpose audit exploration on top of the Phase 1 `audit_log` table.

**Query pattern:**

```sql
select l.id, l.user_id, u.email as user_email, l.actor_kind, l.actor_role,
       l.table_name, l.record_id, l.action, l.before, l.after, l.at
  from public.audit_log l
  left join public.users u on u.id = l.user_id
 where l.school_id = (auth.jwt() ->> 'school_id')::uuid
   and ($1::uuid is null or l.user_id = $1::uuid)
   and ($2::text is null or l.table_name = $2::text)
   and ($3::uuid is null or l.record_id = $3::uuid)
   and ($4::text is null or l.action::text = $4::text)
   and l.at >= $5::timestamptz
   and l.at <  $6::timestamptz
   -- keyset cursor
   and (l.at, l.id) < ($7::timestamptz, $8::bigint)
 order by l.at desc, l.id desc
 limit 100
```

**Training activity trail (REP-02):** Derive from `reservation` + `flight_log_entry` (flight_out/flight_in rows carry ramp-out/in) + `lesson_grade_sheet` — no new schema. Build a read-only VIEW in migration 0032:

```sql
create or replace view public.training_activity_trail as
select
  r.id as reservation_id,
  r.school_id,
  r.base_id,
  r.activity_type,
  r.student_id,
  r.instructor_id,
  r.requested_by,
  r.requested_at,
  r.approved_by,
  r.approved_at,
  (select flown_at from public.flight_log_entry fo
     where fo.kind = 'flight_out'
       and fo.aircraft_id = r.aircraft_id
       and fo.flown_at >= lower(r.time_range)
       and fo.flown_at <  upper(r.time_range)
     order by fo.flown_at asc limit 1) as ramp_out_at,
  (select flown_at from public.flight_log_entry fi
     where fi.kind = 'flight_in'
       and fi.aircraft_id = r.aircraft_id
       and fi.flown_at >= lower(r.time_range)
       and fi.flown_at <  upper(r.time_range) + interval '6 hours'
     order by fi.flown_at asc limit 1) as ramp_in_at,
  r.closed_at,
  (select count(*) from public.lesson_grade_sheet gs
     where gs.reservation_id = r.id) as grade_sheet_count,
  r.status,
  r.close_out_reason
from public.reservation r
where r.deleted_at is null;
```

---

### Pattern 6: Live + Projected Cost (REP-03, REP-04)

**What:** New `school_rate` table with admin-configurable per-hour rates. Live cost = sum over flight_log_time + ground minutes × rate. Projected cost = live cost + remaining minimums × projected rate.

```typescript
// packages/db/src/schema/school_rate.ts
export const rateKindEnum = pgEnum('rate_kind', [
  'aircraft_wet', // per hobbs-hour, per aircraft or per make/model
  'aircraft_dry',
  'instructor', // per instructor-hour
  'ground_instructor', // per ground-hour
  'simulator',
  'surcharge_fixed', // flat per-lesson fee
]);

export const schoolRate = pgTable('school_rate', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  kind: rateKindEnum('kind').notNull(),
  // optional scoping — null means default for kind
  aircraftId: uuid('aircraft_id'), // e.g. tail-specific rate override
  aircraftMakeModel: text('aircraft_make_model'), // e.g. "C172S"
  instructorId: uuid('instructor_id'),
  amountCents: integer('amount_cents').notNull(),
  currencyCode: text('currency_code').notNull().default('USD'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

**Live cost computation** (in `cost.ts` router):

```sql
-- Uses flight_log_time (Phase 5, per-student kind rows) joined with flight_log_entry
-- (hobbs hours) joined with reservation (instructor time) joined with school_rate.
-- Compute on demand — volume is tiny per student.

select
  sum(case
    when flt.kind in ('pic','dual_received','solo')
    then coalesce(hobbs.flight_hours, 0) * aircraft_rate.amount_cents
    else 0
  end)
  + sum(dual_instructor_hours * instructor_rate.amount_cents)
  + sum(ground_minutes / 60.0 * ground_rate.amount_cents)
as live_cost_cents
from public.flight_log_time flt
left join /* ... */
where flt.user_id = $1::uuid
  and flt.deleted_at is null
  and (school_rate validity by effective_from <= flt.created_at < effective_until)
```

**Projected cost** (REP-04):

- Remaining required hours comes from Phase 6 `student_minimums_tracker` (already computed per enrollment)
- Multiply by _current_ rates for the relevant aircraft make/model + instructor + ground
- Surface on `/record` page as "to-date + projected remaining" display

---

### Pattern 7: CSV + PDF Export Route Handlers (REP-06)

**What:** One Next.js Route Handler per (report, format). Existing patterns at `apps/web/app/(app)/flight-log/iacra.csv/route.ts` and `apps/web/app/(app)/record/courses/[enrollmentId]/export.pdf/route.ts` are the templates — copy them.

**CSV pattern:**

```typescript
// apps/web/app/(app)/admin/reports/fleet-utilization/export.csv/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const caller = await resolveCallerContext();
  if (!caller || caller.role !== 'admin') {
    return new Response('forbidden', { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const baseId = searchParams.get('base_id'); // null = all bases
  const from = searchParams.get('from')!;
  const to = searchParams.get('to')!;

  const rows = await fetchFleetUtilization({ schoolId: caller.schoolId, baseId, from, to });
  const csv = [
    'tail_number,make_model,flight_hours,utilization_pct,squawk_count',
    ...rows.map((r) =>
      [r.tail, r.makeModel, r.flightHours, r.utilizationPct, r.squawkCount].join(','),
    ),
  ].join('\n');

  const filename = `fleet-utilization-${from}-${to}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
```

**PDF pattern:** Same as `record/courses/[id]/export.pdf/route.ts` — `renderToStream(Document)` → Response with `content-type: application/pdf`.

**Banned-term risk:** Email templates live in `apps/web/emails/**` and PDF templates live in `apps/web/app/**`. The ESLint rule `part61/no-banned-terms` covers `apps/web/**` — so both are covered automatically. CFI-review checklist (beta readiness) is a human pass on top.

---

### Pattern 8: MSG-03 Active Session Tracking

**What:** A new `user_session_activity` table updated on every request (or at a throttled cadence) from a Next.js middleware. Supabase `auth.sessions` is NOT exposed via the public API, so the app maintains its own last-seen-at.

```typescript
// packages/db/src/schema/session_activity.ts
export const userSessionActivity = pgTable(
  'user_session_activity',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    schoolId: uuid('school_id').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenIp: text('last_seen_ip'),
    lastSeenUserAgent: text('last_seen_user_agent'),
    activeRole: text('active_role'),
    activeBaseId: uuid('active_base_id'),
  },
  () => [
    pgPolicy('user_session_activity_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('user_session_activity_upsert_self', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);
```

**Write path:** Next.js root middleware (`apps/web/middleware.ts` — already exists) upserts `user_session_activity` if `lastSeenAt` is > 60s old (throttle). Extend `updateSession()` in `apps/web/lib/supabase/middleware.ts`.

**Read path:** `/admin/active-sessions` query: `WHERE last_seen_at > now() - interval '5 minutes'`.

**DM button:** Opens MessagingDrawer with that user's conversation — uses a tRPC `messaging.openConversation` mutation that upserts the canonical `conversation` row for the pair.

---

### Pattern 9: Dispatch Cue Subscriber (MSG-04)

**What:** Client-side subscription on the `/dispatch` page. Subscribes to `notifications` with filter `channel=eq.dispatch`. Renders:

- Row-level flash (red glow, 60s) when `source_table='reservation'` and `kind='overdue_aircraft'`
- Toast when `kind='grounded_aircraft_attempted_use'` or `kind='admin_broadcast' and severity='critical'`
- Click-to-dismiss updates `dismissed_at`

**Event source:** Server-side tRPC mutations (e.g. `schedule.markOverdue`, `fleet.attemptedUseOfGrounded`) call `createNotification({ channel: 'dispatch', ... })` with appropriate kind.

---

### Pattern 10: Multi-Base Filter (MUL-03)

**What:** URL param `?base_id=<uuid>` or `?base_id=all`. Default to session's active base unless admin explicitly picks "All bases". BaseSwitcher (existing) already controls the active base; reports use a separate scoped filter that doesn't alter the session cookie.

**RLS interaction:** The existing Phase 2 RLS policy already honors `auth.jwt() ->> 'active_role' = 'admin'` as an escape hatch — admins can query across bases. Reports only let admins pick "All bases"; non-admins see their own base only. Example:

```typescript
const baseFilter =
  caller.role === 'admin' && baseIdParam === 'all'
    ? null // no WHERE clause on base_id
    : (baseIdParam ?? caller.activeBaseId);
```

Queries `AND ($baseFilter IS NULL OR r.base_id = $baseFilter)`.

---

### Anti-Patterns to Avoid

- **Polling for notifications.** CONTEXT explicitly requires Supabase Realtime; polling breaks the contract and wastes connections.
- **Sending email directly from tRPC mutations.** Email must go through the outbox — synchronous sends in the request path means Resend rate-limit (2 req/s default) can throttle user-facing actions, and network hiccups leak into the UI.
- **Single channel for all notifications.** If you subscribe on a single global channel, every INSERT payload crosses the wire even if the user isn't the recipient. Use a per-user channel (`notifications:user:${userId}`) + filter.
- **Storing pass-rate as a materialized number.** Compute it on demand from `stage_check` — small enough at beta scale.
- **Computing live cost inside a React Server Component for every render.** Memoize with React Query + tRPC; invalidate on flight close-out.
- **Letting broadcasts reply threads.** CONTEXT locks this — banners are read-only.
- **Streaming CSV from tRPC.** tRPC is JSON-RPC; don't try to stream CSV through it. Use Route Handlers for file downloads.
- **Using `@react-pdf/renderer` in an Edge runtime.** It needs Node runtime. Always set `export const runtime = 'nodejs'` in route handlers using it (see existing `record.pdf/route.ts`).
- **Subscribing to realtime inside a React Server Component.** Must be a Client Component with `'use client'`.

## Don't Hand-Roll

| Problem                  | Don't Build                            | Use Instead                                                        | Why                                                                                                 |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Transactional email send | Custom SMTP + node-mailer + queue      | **Resend** SDK + outbox pattern                                    | Resend handles DKIM/SPF/bounce/complaint feedback; free tier covers beta                            |
| React email templates    | Inline HTML string concat              | **@react-email/components**                                        | Email-client compatibility (Outlook tables!) is a nightmare; @react-email renders cross-client HTML |
| Realtime pubsub          | Custom websocket server or socket.io   | **Supabase Realtime**                                              | Already in deps; RLS-enforced; no infra to deploy                                                   |
| Per-user channel auth    | Raw JWT validation in a custom handler | Supabase Realtime + RLS on `notifications.user_id`                 | Matches existing Phase 1 RLS pattern                                                                |
| PDF generation           | Puppeteer / wkhtmltopdf                | **@react-pdf/renderer** (already in deps)                          | React components, no browser binary                                                                 |
| CSV generation           | Third-party lib                        | Plain string join — see existing `iacra.csv/route.ts`              | Already a project pattern; no dep needed for tabular data                                           |
| Audit log indexing       | Build from scratch                     | **Existing `audit_log` table + indexes**                           | Phase 1 already shipped this; just add the UI                                                       |
| Cron                     | Custom worker + Redis                  | **pg_cron** (already registered in 0029)                           | One cron in Postgres vs an external worker                                                          |
| Job queue for email      | BullMQ / Upstash                       | **Postgres outbox + `FOR UPDATE SKIP LOCKED`**                     | Standard Postgres pattern, no extra infra                                                           |
| E2E test framework       | Write manual test scripts              | **Playwright**                                                     | Faster + cross-browser + storageState auth                                                          |
| Duty hour rules          | Free-text warning                      | Concrete per-day accumulator with `FAR 61.195(a)(2)` (8 hr / 24 h) | Regulation-specific, not arbitrary                                                                  |
| Session tracking         | Parse Supabase JWT                     | New `user_session_activity` table                                  | Supabase `auth.sessions` is not exposed; app must maintain its own                                  |

**Key insight:** Phase 8 is mostly _integration_ work, not new algorithms. Every "hard" problem has a shipped solution elsewhere in the monorepo — the job is to stitch them together correctly.

## Common Pitfalls

### Pitfall 1: Realtime subscription storm on dashboard

**What goes wrong:** Every tile on the student dashboard subscribes to its own realtime channel — user opens dashboard, app opens 5 channels, hits Supabase free-tier concurrent-connection limit (200) with 40 users each opening dashboards.
**Why it happens:** Component-local `useEffect` with individual channels.
**How to avoid:** ONE channel per user (`notifications:user:${userId}`) mounted once in a top-level provider. Tiles subscribe to a context/zustand store fed by the single channel.
**Warning signs:** Network tab shows multiple `realtime/v1/websocket` connections per tab.

### Pitfall 2: Resend sender domain not verified

**What goes wrong:** Emails go to spam or bounce in production; beta school loses confidence.
**Why it happens:** Resend requires domain verification (DKIM + SPF DNS records) before high-volume send. Using `onboarding@resend.dev` works in dev but not prod.
**How to avoid:** Phase 8 beta checklist must include "verify sender domain in Resend". Plan the verification into the pre-beta runbook, not the code.
**Warning signs:** Resend dashboard shows "unverified" status; test emails to common domains (Gmail) land in spam.

### Pitfall 3: postgres_changes RLS leakage or invisibility

**What goes wrong:** Either (a) notifications leak to wrong user because RLS policy is misauthored, or (b) they don't arrive because `replica identity` on the table is default (no before-image).
**Why it happens:** Supabase Realtime relies on logical replication; new tables need `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` + `ALTER TABLE notifications REPLICA IDENTITY FULL` (or DEFAULT works for INSERT-only events but DELETE events don't carry the row).
**How to avoid:** In migration 0032, explicitly register the table with the realtime publication:

```sql
alter publication supabase_realtime add table public.notifications;
alter table public.notifications replica identity default; -- INSERT/UPDATE carry new row
```

**Warning signs:** Client shows "connected" but no payloads arrive even though DB has the row.

### Pitfall 4: Timezone drift in reports spanning midnight

**What goes wrong:** A "yesterday" filter for a base in PST shows UTC-yesterday data, off by 8 hours.
**Why it happens:** Default JS `Date` conversions go through local TZ; Postgres is UTC.
**How to avoid:** Always pass ISO-8601 timestamps with explicit offsets; resolve "today" via `date-fns-tz` against the _base's_ timezone (already on `bases.timezone`), not the caller's. Existing pattern: admin dashboard uses `date_trunc('day', now())` which is UTC — for reports, parameterize the zone.
**Warning signs:** Fleet util report shows 0 flights on dates that did have flights.

### Pitfall 5: Banned terms in email subject line

**What goes wrong:** Email template contains "approved" in subject, ESLint rule `part61/no-banned-terms` fires on pre-commit, developer bypasses with `--no-verify`, team ships an email with "Your reservation is approved" and regulator-sensitive language.
**Why it happens:** Reservation status enum internally uses `'approved'` (locked in Phase 3); template copy needs "confirmed" in user-facing text.
**How to avoid:**

1. Default all user-facing strings to "confirmed" in templates (Phase 3 already uses this in tRPC error messages — see STATE decisions 03-02).
2. Reuse the `allow-banned-term:` escape hatch only for internal constants.
3. Include email-template scan in the CFI terminology review checklist.
   **Warning signs:** Pre-commit hook blocked; template literal contains the enum value directly.

### Pitfall 6: 24h reminder fires for cancelled reservations

**What goes wrong:** Reservation cancelled, reminder already queued, student gets a reminder for a nonexistent flight.
**Why it happens:** Naive "insert pending reminder row" pattern doesn't re-check at fire time.
**How to avoid:** The pg_cron reminder job runs a query that JOINs against reservation and checks `status in ('approved','dispatched')` at fire time. Don't pre-materialize reminder rows; compute "who needs a reminder right now" each run.

```sql
-- pg_cron: every 5 minutes
insert into public.notifications (school_id, user_id, kind, ...)
select r.school_id, coalesce(r.student_id, r.instructor_id), 'reservation_reminder_24h', ...
  from public.reservation r
 where r.status in ('approved','dispatched')
   and r.deleted_at is null
   and lower(r.time_range) between now() + interval '23.5 hours'
                              and now() + interval '24.5 hours'
   and not exists (
     select 1 from public.notifications n
      where n.source_table = 'reservation' and n.source_record_id = r.id
        and n.kind = 'reservation_reminder_24h'
   )
;
```

**Warning signs:** Users receive reminders at odd times, or for cancelled flights.

### Pitfall 7: Duty-hour warning triggers on historical scheduling

**What goes wrong:** Admin fills in last month's schedule retroactively, every entry triggers a duty-hour warning + email.
**Why it happens:** Warning computation doesn't check `lower(time_range) >= now()`.
**How to avoid:** Only evaluate duty-hour warnings on reservations whose start is in the future. Retroactive writes bypass notification dispatch.
**Warning signs:** Massive burst of `duty_hour_warning` notifications.

### Pitfall 8: email_outbox unbounded growth

**What goes wrong:** Sent emails stay in `email_outbox` forever; table bloats, queries slow.
**Why it happens:** No retention policy.
**How to avoid:** Add to pg_cron: `delete from public.email_outbox where status = 'sent' and sent_at < now() - interval '30 days'`. Keep failed rows longer (90 days) for debugging.
**Warning signs:** Table size > 100k rows after 6 months of beta.

### Pitfall 9: `user_notification_pref` schema change breaks defaults

**What goes wrong:** New event kind added to enum; existing users have no `user_notification_pref` row for it; defaults silently apply but might not match the role-curated default-on.
**How to avoid:** Keep "effective prefs" as a VIEW that LEFT JOINs `user_notification_pref` with a seeded `notification_default_by_role` table:

```sql
create table public.notification_default_by_role (
  role text not null,
  kind notification_event_kind not null,
  channel notification_channel not null,
  enabled boolean not null default true,
  is_safety_critical boolean not null default false,
  primary key (role, kind, channel)
);
```

Seed this in migration 0032 with the role-based defaults from CONTEXT. Helper `effectivePref(userId, kind, channel)` = `COALESCE(user_notification_pref.enabled, notification_default_by_role.enabled)`.
**Warning signs:** Users complain they don't get an event after adding a new event kind.

### Pitfall 10: Message drawer re-mounts on every nav

**What goes wrong:** `MessagingDrawer` is mounted inside `(app)/layout.tsx`; every route change remounts, disconnecting realtime + losing draft message.
**Why it happens:** Next.js re-renders layout on nav only when segment changes, but if the drawer holds local draft state, it must survive route changes.
**How to avoid:** Mount `MessagingDrawer` in `apps/web/app/layout.tsx` (root), so it persists across all navigations. Use a Client Component provider pattern.

## Code Examples

### Example: Role-Based Redirect from `/`

```typescript
// apps/web/app/(app)/page.tsx (EXTENDED from existing)
// Current file is the student/instructor/admin dashboard. Replace with a
// thin redirect shim; move existing content to /dashboard/page.tsx.
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RootRedirectPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value ?? 'student';

  if (activeRole === 'admin') redirect('/admin/dashboard');
  redirect('/dashboard'); // one route for student/instructor/mechanic, renders based on role
}
```

### Example: ExpiryBadge Component (green/yellow/red by days)

```typescript
// apps/web/components/ExpiryBadge.tsx
// Source: Locked by CONTEXT §Expiring-items styling

interface Props {
  expiresAt: Date | string | null;
  now?: Date;
}

export function ExpiryBadge({ expiresAt, now = new Date() }: Props) {
  if (!expiresAt) return <span style={{ color: '#6b7280' }}>no expiry</span>;
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
  const [bg, fg, label] =
    daysLeft < 0 ? ['#fee2e2', '#991b1b', 'EXPIRED']
    : daysLeft <= 7 ? ['#fee2e2', '#991b1b', `${daysLeft}d`]
    : daysLeft <= 30 ? ['#fef3c7', '#92400e', `${daysLeft}d`]
    : ['#dcfce7', '#166534', `${daysLeft}d`];
  return (
    <span style={{
      background: bg, color: fg, padding: '0.15rem 0.5rem',
      borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
    }}>{label}</span>
  );
}
```

### Example: Instructor Duty-Hour Accumulator

```sql
-- Called from schedule.confirm() before finalizing.
-- Returns instructor flight minutes already committed within the 24h
-- window ending at the proposed reservation start.
create or replace function public.instructor_duty_minutes_in_window(
  _instructor_id uuid,
  _window_end timestamptz
) returns integer language sql stable as $$
  select coalesce(sum(
    extract(epoch from (upper(time_range) - lower(time_range))) / 60
  ), 0)::int
    from public.reservation
   where instructor_id = _instructor_id
     and deleted_at is null
     and activity_type = 'flight'
     and status in ('approved','dispatched','flown','pending_sign_off','closed')
     and lower(time_range) >= _window_end - interval '24 hours'
     and lower(time_range) <  _window_end;
$$;

-- FAR 61.195(a)(2): 8 hours flight training in any 24-hour period.
-- Warn at 7h, hard-block at 8h+ proposed for the window.
```

### Example: React Email Template

```typescript
// apps/web/emails/ReservationApproved.tsx
// Source: https://resend.com/docs/send-with-nextjs + @react-email/components

import { Html, Head, Body, Container, Heading, Text, Button, Hr } from '@react-email/components';

interface Props {
  studentName: string;
  instructorName: string;
  aircraftTail: string;
  startTimeLocal: string;
  reservationUrl: string;
}

// NOTE: "confirmed" not "approved" in user-facing copy — banned-terms rule.
// allow-banned-term: internal reservation.status enum value stays 'approved'
export function ReservationApproved(props: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', background: '#f9fafb' }}>
        <Container style={{ maxWidth: 560, padding: 24, background: 'white' }}>
          <Heading as="h1">Your reservation is confirmed</Heading>
          <Text>Hi {props.studentName},</Text>
          <Text>
            Your flight with <strong>{props.instructorName}</strong> in{' '}
            <strong>{props.aircraftTail}</strong> on {props.startTimeLocal} is
            confirmed and on the schedule.
          </Text>
          <Button href={props.reservationUrl}
                  style={{ background: '#1e40af', color: 'white', padding: '10px 16px' }}>
            View reservation
          </Button>
          <Hr />
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            Part 61 School · You received this because reservation notifications are on.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### Example: Playwright Test — Scheduling Conflict

```typescript
// tests/e2e/scheduling-conflict.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Safety: Scheduling conflict prevention (SCH-02)', () => {
  test('overlapping aircraft reservation is rejected by DB exclusion constraint', async ({
    page,
  }) => {
    // Uses storageState for logged-in admin from fixtures/auth.ts
    await page.goto('/schedule');
    // Create first reservation
    await page.getByRole('button', { name: 'New reservation' }).click();
    await page.getByLabel('Aircraft').selectOption('N12345');
    await page.getByLabel('Start').fill('2026-06-01T14:00');
    await page.getByLabel('End').fill('2026-06-01T16:00');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Reservation created')).toBeVisible();

    // Attempt overlapping second reservation — must fail
    await page.getByRole('button', { name: 'New reservation' }).click();
    await page.getByLabel('Aircraft').selectOption('N12345');
    await page.getByLabel('Start').fill('2026-06-01T15:00');
    await page.getByLabel('End').fill('2026-06-01T17:00');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/already booked/i)).toBeVisible();
  });
});
```

## State of the Art

| Old Approach                             | Current Approach                                 | When Changed | Impact                                          |
| ---------------------------------------- | ------------------------------------------------ | ------------ | ----------------------------------------------- |
| Custom websocket server for realtime     | **Supabase Realtime** (Phoenix-based, built-in)  | 2023+        | No infra; RLS-enforced; scales to millions      |
| SMTP relay + Mailgun/SendGrid            | **Resend** with React Email                      | 2023+        | Type-safe templates, modern DX, free tier       |
| HTML email templates (MJML, hand-rolled) | **@react-email/components**                      | 2023+        | React components, client-compatibility built in |
| Polling for notifications                | postgres_changes subscription                    | 2022+        | Zero battery / server cost when idle            |
| Cypress for E2E                          | **Playwright**                                   | 2024+        | Cross-browser, multi-tab, parallel by default   |
| pg_notify + custom worker                | **Outbox + pg_cron + pg_net** (or simple worker) | 2022+        | No brokers; standard Postgres patterns          |
| Full-page route for every action         | **Drawers / sheets** for contextual actions      | 2022+        | Faster feedback loop; INS-03 single-workflow    |

**Deprecated/outdated:**

- `@supabase/auth-helpers-nextjs` — replaced by `@supabase/ssr` (already used project-wide). Don't add `auth-helpers`.
- `resend.emails.send({ html: '...' })` string templates — use `{ react: <Template /> }` instead (modern pattern).

## Open Questions

### 1. IPF-03 Pass Rate: "First attempt" source of truth

**What we know:**

- `stage_check` has `status: 'scheduled'|'passed'|'failed'` (Phase 5 schema)
- No column distinguishes "FAA checkride" from "internal stage check"
- No explicit "attempt number" column
  **What's unclear:** Whether pass rate should be computed over (a) all stage checks (internal + FAA), (b) only FAA-equivalent (final) checks, or (c) actual FAA checkride records (which we don't capture yet).
  **Recommendation:** Phase 8 plan adds two columns to `stage_check`:
- `is_faa_checkride boolean not null default false`
- `attempt_number int` (computed via trigger as sequence per student_enrollment_id + stage_id)
  Pass rate = `count(*) filter (where is_faa_checkride and status='passed' and attempt_number=1) / count(*) filter (where is_faa_checkride and attempt_number=1)`.
  Planner can also consider: pass rate becomes a view + exposed on `/admin/people/[instructor]/profile`.

### 2. Notifications → Dispatch Cue overlap

**What we know:** MSG-04 fires dispatch cues; NOT-01 fires in-app notifications for the same events. Both are row inserts in `notifications`.
**What's unclear:** Should a single notification carry `channel='in_app,dispatch'` (array), or should the system write two rows (one per channel)?
**Recommendation:** Two rows. Simpler RLS, simpler Realtime filter (`channel=eq.dispatch`), matches existing one-row-per-channel email pattern.

### 3. Broadcast fan-out size

**What we know:** "Send to all students" in a 50-user school writes 40ish notification rows + 40 emails. That's fine.
**What's unclear:** If the partner school grows, does the transactional write-one-row-per-recipient strategy scale?
**Recommendation:** For v1, write one row per recipient inside the broadcast-create transaction. If scale becomes an issue, introduce a `broadcast_recipient` fanout table + a pg_cron fanout job. Leave that as deferred.

### 4. `Documentation/` folder email branding

**What we know:** Root `CLAUDE.md` references a Documentation folder with military/tech dark-theme aesthetic (Oswald font etc.).
**What's unclear:** Is the beta school's email branding supposed to match that design system, or use neutral utility emails?
**Recommendation:** Neutral, utility emails in v1 (per CONTEXT Claude's-discretion guidance "follow `Documentation/` design language if present; otherwise clean utility design"). If the school objects post-beta, swap in the design system via a single `<EmailShell>` component update.

### 5. E2E test auth — service-role seeding vs real login

**What we know:** Playwright `storageState` pattern caches login cookies from a one-time real login.
**What's unclear:** Do we seed test users via service-role SQL before the test run, or sign them up through the UI?
**Recommendation:** Seed via the existing RLS test harness pattern (`dbAsAdmin()` + insert) for determinism; run a single real `signInWithPassword` in a global `setup.ts` to populate storageState. Reuses the two-schools fixture from `tests/rls/harness.ts`.

### 6. Safety-critical events — should they also bypass email preferences?

**What we know:** CONTEXT says "Users can opt out of channels but events always deliver in-app."
**What's unclear:** Literal reading says email opt-out is allowed even for safety-critical. But if a user opts out of email for "grounding", they won't know the aircraft is grounded by email — only in-app.
**Recommendation:** Follow CONTEXT literally: safety-critical always in-app; email respects user pref. If partner school wants otherwise, change `createNotification()` helper to force email for `isSafetyCritical`.

### 7. Realtime connection count at beta scale

**What we know:** Supabase Free tier = 200 concurrent realtime connections. Beta = 20–50 users × up to 4 tabs each = up to 200 connections.
**Recommendation:** Cluster all client-side realtime into ONE channel per user (shared across tabs in same browser via BroadcastChannel API) to stay well under. Fall back to Supabase Pro ($25/mo) if beta exceeds 200.

## Sources

### Primary (HIGH confidence)

- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — subscription API, RLS interaction, filter syntax
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) — private channels, supabase-js v2.44+ requirement
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — 200 concurrent connections on Free tier
- [Resend + Next.js docs](https://resend.com/docs/send-with-nextjs) — send API, React prop, Next 15 server actions
- [Resend Free Tier / Quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) — 3,000/mo, 100/day, 2 req/s
- [Resend Batch Idempotency Keys](https://resend.com/changelog/batch-idempotency-keys) — 256-char keys, 24h window
- [14 CFR 61.195 (eCFR)](https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61/subpart-H/section-61.195) — 8 hrs/24 h flight instruction limit
- Existing codebase:
  - `packages/db/src/schema/audit.ts` — `audit_log` table + indexes (Phase 1)
  - `packages/db/migrations/0029_phase6_pg_cron.sql` — pg_cron registration pattern
  - `apps/web/app/(app)/admin/audit/training-records/page.tsx` — query-UI starting point
  - `apps/web/app/(app)/flight-log/iacra.csv/route.ts` — CSV export template
  - `apps/web/app/(app)/record/courses/[enrollmentId]/export.pdf/route.ts` — PDF export template
  - `apps/web/lib/supabase/middleware.ts` — Next.js middleware pattern (for session activity extension)
  - `packages/api/src/middleware/tenant.ts` — `withTenantTx` wrapping
  - `packages/api/src/procedures.ts` — role-gated procedure composition

### Secondary (MEDIUM confidence)

- [Push-based Outbox Pattern with Postgres Logical Replication — event-driven.io](https://event-driven.io/en/push_based_outbox_pattern_with_postgres_logical_replication/) — outbox + at-least-once delivery pattern (verified against multiple sources)
- [Postgres as a Message Bus — thinhdanggroup](https://thinhdanggroup.github.io/postgres-as-a-message-bus/) — LISTEN/NOTIFY + outbox patterns
- [Playwright vs Cypress 2026 — dev.to / TestMatick](https://dev.to/jake_kim_bd3065a6816799db/playwright-vs-cypress-2026-which-e2e-testing-framework-should-you-use-1kmo) — Playwright momentum + parallelization advantage
- [Testing Next.js 15 with Playwright + MSW + Supabase](https://micheleong.com/blog/testing-with-nextjs-15-and-playwright-msw-and-supabase) — storageState auth for Supabase
- [Supabase Realtime: Broadcast and Presence Authorization](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization) — private channels announcement

### Tertiary (LOW confidence — verify before acting)

- [Mastering Email Rate Limits — Dale Nguyen](https://dalenguyen.me/blog/2025-09-07-mastering-email-rate-limits-resend-api-cloud-run-debugging) — practical retry + rate-limit debugging notes
- IPF-03 "first-attempt pass rate" source of truth — not resolved from regulation or existing schema; treated as Open Question 1

## Metadata

**Confidence breakdown:**

- **Standard Stack:** HIGH — Resend, Supabase Realtime, @react-pdf/renderer, date-fns-tz all verified against official docs. Resend free-tier limits verified against official knowledge base.
- **Architecture (dashboards, drawer, tiles):** HIGH — reuses existing patterns visible in codebase.
- **Architecture (notifications outbox):** HIGH — standard industry pattern with strong references.
- **Architecture (Realtime subscription):** HIGH — canonical Supabase pattern, verified against docs; per-user filter verified.
- **Architecture (messaging data model):** MEDIUM — data model is reasonable but not verified against a specific reference implementation; conversation-pair uniqueness via `LEAST/GREATEST` is a known pattern.
- **Audit UI + REP-02 training activity trail:** HIGH — direct reuse of Phase 1 audit_log + Phase 3 reservation/flight_log_entry.
- **Cost tracking:** MEDIUM — schema is novel to Phase 8. Planner should validate `school_rate` shape against partner-school expectations (per-aircraft vs per-make-model; dry vs wet).
- **Reports:** MEDIUM — data sources are clear; SQL shape depends on exact definitions the planner finalizes.
- **Instructor metrics:** MEDIUM — FAR 61.195 verified (8 hrs/24 h, no weekly limit); pass-rate source is an Open Question.
- **Multi-base filter:** HIGH — RLS policy supports admin cross-base reads already.
- **E2E framework:** MEDIUM-HIGH — Playwright recommendation is well-sourced; specific test cases depend on planner's judgment.
- **Common pitfalls:** HIGH — each is either (a) an observed issue in existing code/regulations, (b) a standard Supabase gotcha, or (c) a documented pattern.

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — Resend and Supabase Realtime evolve quickly; re-verify rate limits and auth APIs before production deploy)

## RESEARCH COMPLETE
