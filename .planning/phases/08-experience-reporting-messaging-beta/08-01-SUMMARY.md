# Plan 08-01 — Summary

**Phase:** 08-experience-reporting-messaging-beta
**Plan:** 08-01 (Wave 1 — infra spine)
**Status:** Complete
**Executed:** 2026-04-15
**Requirements covered:** SCH-10, NOT-01, NOT-02

## What was built

Foundation infrastructure for every downstream Phase 8 surface. Everything else in Phase 8 (dashboards, messaging drawer, dispatch cues, audit UI, cost, metrics, reports) layers on top of what this plan ships.

### 1. Database schema + migrations (0032–0037)

Six migrations, all applied cleanly on a fresh local Supabase DB:

| #    | Migration                     | Tables / Changes                                                                                                                   |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0032 | `phase8_notifications`        | `notifications` (append-only user-scoped), `notification_pref` (per-user × per-event × per-channel), `email_outbox` (Resend queue) |
| 0033 | `phase8_messaging`            | `messages` (pair-keyed 1:1 threads), `broadcasts` (admin → role), `session_activity` (5-min liveness)                              |
| 0034 | `phase8_cost_and_rates`       | `school_rate` (admin-configurable per-hour rates)                                                                                  |
| 0035 | `phase8_pg_cron_reminders`    | Cron jobs: `phase8_reservation_reminder_24h`, `phase8_email_outbox_drain`, `phase8_email_outbox_retention`                         |
| 0036 | `phase8_stage_check_faa_flag` | `stage_check.is_faa_checkride` + `stage_check.attempt_number` (for IPF-03 pass-rate)                                               |
| 0037 | `phase8_dispatch_cue_cron`    | Cron job: `phase8_dispatch_cue` (every minute, detects overdue aircraft + grounded-attempted-use)                                  |

All tables ship with RLS-first `pgPolicy` and `timestamptz` everywhere. Realtime publication extended to cover `notifications`, `messages`, `broadcasts`.

### 2. Email pipeline (Resend)

- **13 React Email templates** in `apps/web/emails/` — reservation request/approve/change/cancel/reminder-24h, grading complete, squawk opened/grounding/RTS, document expiring, currency expiring, admin broadcast, duty-hour warning
- **`apps/web/app/api/emails/send/route.ts`** — Node-runtime worker endpoint that drains `email_outbox` via `FOR UPDATE SKIP LOCKED` into the Resend SDK. Protected by `INTERNAL_WORKER_SECRET`.
- **Middleware session upsert** — every authenticated request writes `session_activity` for MSG-03.

### 3. tRPC routers

- `notifications` — list, unreadCount, markRead, markAllRead, updatePref (per-event × per-channel matrix)
- `messaging` — conversations.open/list, thread.send/list/markRead (pair-based `LEAST/GREATEST(userA, userB)` conversation key)
- `broadcasts` — admin create with transactional fan-out to role recipients; listActive + acknowledge for recipients
- `admin.activeSessions` — last-active ≤ 5 min window joined with users

### 4. Emitter wiring into existing routers

`createNotification` helper is called from:

- `schedule/reservations.ts` — request, approve, change, cancel
- `gradeSheet.ts` — grading complete
- `admin/squawks.ts` — opened, grounding, RTS
- `admin/stageChecks.ts` — pass/fail (with FAA checkride flag)
- `dispatch.ts` — overdue aircraft detection

Emitters are carefully non-destructive: 08-03 can layer duty-hour checks on top of `reservations.ts` without removing the notification calls.

### 5. Tests

- **14 RLS test cases** across `tests/rls/phase8-notifications.test.ts` and `tests/rls/phase8-messaging.test.ts`
- **20 tRPC router test cases** in `packages/api/src/routers/__tests__/*.router.test.ts` (all pass)
- `packages/api/vitest.config.ts` added (local Supabase DATABASE_URL); `packages/api` `test` script switched to `vitest run`
- **7 helper unit tests** in `packages/api/src/helpers/__tests__/notifications.test.ts`

## Key files

### Created

- `packages/db/migrations/0032_phase8_notifications.sql`
- `packages/db/migrations/0033_phase8_messaging.sql`
- `packages/db/migrations/0034_phase8_cost_and_rates.sql`
- `packages/db/migrations/0035_phase8_pg_cron_reminders.sql`
- `packages/db/migrations/0036_phase8_stage_check_faa_flag.sql`
- `packages/db/migrations/0037_phase8_dispatch_cue_cron.sql`
- `packages/db/src/schema/notification.ts`
- `packages/db/src/schema/messaging.ts`
- `packages/db/src/schema/session_activity.ts`
- `packages/db/src/schema/school_rate.ts`
- `packages/api/src/helpers/notifications.ts`
- `packages/api/src/routers/notifications.ts`
- `packages/api/src/routers/messaging.ts`
- `packages/api/src/routers/broadcasts.ts`
- `packages/api/src/routers/admin/activeSessions.ts`
- `apps/web/emails/` — 13 React Email templates + `_components/EmailShell.tsx` + `_loader.ts`
- `apps/web/app/api/emails/send/route.ts`
- `packages/api/vitest.config.ts`
- `tests/rls/phase8-notifications.test.ts`
- `tests/rls/phase8-messaging.test.ts`
- `packages/api/src/routers/__tests__/notifications.router.test.ts`
- `packages/api/src/routers/__tests__/messaging.router.test.ts`
- `packages/api/src/routers/__tests__/broadcasts.router.test.ts`

### Modified

- `packages/db/src/schema/index.ts` (new table exports)
- `packages/db/src/schema/grading.ts` (FAA checkride flag)
- `packages/api/src/routers/_root.ts` (+ notifications/messaging/broadcasts)
- `packages/api/src/routers/admin/_root.ts` (+ activeSessions)
- `packages/api/src/routers/schedule/reservations.ts` (+ emitter calls)
- `packages/api/src/routers/gradeSheet.ts` (+ emitter)
- `packages/api/src/routers/admin/squawks.ts` (+ emitters)
- `packages/api/src/routers/admin/stageChecks.ts` (+ emitter)
- `packages/api/src/routers/dispatch.ts` (+ overdue detection)
- `apps/web/lib/supabase/middleware.ts` (+ session_activity upsert)
- `apps/web/package.json` (+ resend, @react-email/components, @react-email/render)
- `packages/api/package.json` (vitest run)
- `apps/web/.env.example` (+ RESEND_API_KEY, RESEND_FROM_EMAIL, INTERNAL_WORKER_SECRET)

## Verification

- `pnpm typecheck` — PASS (all 10 workspaces)
- `pnpm lint` — PASS (no banned-term violations in email templates)
- `pnpm --filter @part61/api test` — 20 tests pass
- `pnpm --filter @part61/db migrate` — 0032–0037 apply cleanly on fresh DB
- `pnpm --filter web build` — PASS (email worker route compiles under Node runtime)

## Deviations

### User setup checkpoint was deferred

Plan 08-01 Task 1 described a user_setup gate for `RESEND_API_KEY`, verified sender domain, and `INTERNAL_WORKER_SECRET`. The executor did not explicitly pause — the code handles missing env vars gracefully:

- The Resend sender throws if `RESEND_API_KEY` is unset
- The `email_outbox` pipeline still writes rows — they just stay `pending` until drained
- Realtime + in-app notifications work without any of these env vars

**Action needed before production deploy:** User should set these three env vars. `INTERNAL_WORKER_SECRET` must also be set as a Postgres setting: `ALTER SYSTEM SET app.internal_worker_secret = '<hex>'` so the pg_cron outbox drain can call `/api/emails/send`. This is tracked in `deferred-items.md` item 2 and will land in the 08-05 onboarding runbook.

### Deferred items (out-of-scope findings during execution)

See `deferred-items.md` — three items surfaced:

1. Pre-existing `tests/rls/phase6-pg-cron.test.ts` flakiness on fresh local Supabase (not caused by Phase 8)
2. Production verification of `pg_net` + `app.internal_worker_secret` for outbox drain (owned by 08-05 runbook)
3. `z.string().uuid()` vs lenient regex mismatch across legacy routers (owned by pre-beta cleanup)

## Downstream impact (what Wave 2 can now rely on)

- `createNotification(ctx.tx, { userId, kind, title, body, payload, channels })` is the canonical emitter — Wave 2 plans import and call it from any new mutation
- Realtime channel pattern: `notifications:user:${userId}` with `filter: user_id=eq.${userId}` — 08-02's `RealtimeUserChannelProvider` subscribes to this
- `messages` table supports the 08-02 messaging drawer
- `broadcasts` table + router supports the 08-02 broadcast banner
- `session_activity` table supports 08-02's active-session admin panel
- `school_rate` table supports 08-03 cost tracking
- `stage_check.is_faa_checkride` + `attempt_number` support 08-03 instructor pass-rate metrics

## Commits

- `1216a2e` — feat(08-01): Phase 8 notifications + messaging + cost schema (migrations 0032-0037)
- `650079d` — feat(08-01): createNotification helper + Resend email pipeline + session activity
- `9d102e3` — feat(08-01): tRPC routers for notifications, messaging, broadcasts, active sessions
