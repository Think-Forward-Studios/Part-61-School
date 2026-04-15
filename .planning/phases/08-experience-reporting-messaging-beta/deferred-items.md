# Phase 8 — Deferred Items

Items discovered during execution that are out of scope for the current plan
(pre-existing issues or forward-facing work owned by a later plan).

## From 08-01 execution

1. **`tests/rls/phase6-pg-cron.test.ts` is flaky on fresh local Supabase**
   - Symptom: expects `phase6_nightly_training_record_audit` to be registered,
     but cron.job returns 0 rows even though `cron` schema exists.
   - Cause: `cron.schedule()` in migration 0029 was wrapped in a
     `DO/EXCEPTION` block; if the extension wasn't installed at migration
     time, the job never got registered, and the test's fallback arm (which
     expects the error message to include "schema does not exist") doesn't
     match because the extension IS installed now — just the job isn't.
   - Reproduced on clean main without Phase 8 changes applied (confirmed via
     `git stash` prior to running). Pre-existing.
   - **Owner:** Phase 6 hotfix or pre-beta hardening sweep.

2. **`apps/web/app/api/emails/send/route.ts` has no production-side verification
   that `pg_net` is actually configured to call it**
   - Symptom: the `phase8_email_outbox_drain` cron job relies on `pg_net` +
     `current_setting('app.internal_worker_secret', true)`; if the user
     doesn't run `alter system set app.internal_worker_secret = '<hex>'`
     post-deploy, the drainer silently no-ops. `createNotification` still
     writes `email_outbox` rows, but nothing drains them.
   - **Owner:** 08-05 onboarding runbook (add the ALTER SYSTEM step).

3. **tRPC zod's strict `uuid()` rejects fixture UUIDs used by tests**
   - The Phase 8 Task 3 routers switched to the lenient `[0-9a-f]{8}-...`
     regex per 07-01 precedent. All other routers that use `z.string().uuid()`
     (schedule.ts, flightLog.ts, schedule/reservations.ts, etc.) will have the
     same issue if new tests are added that use non-v4 UUIDs.
   - **Owner:** Pre-beta cleanup — adopt a shared `uuidString` helper in
     `@part61/domain` and replace all `z.string().uuid()` call sites in one
     pass.
