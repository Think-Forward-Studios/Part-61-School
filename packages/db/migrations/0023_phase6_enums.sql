-- Phase 6 migration (part 1): new enums isolated from usage.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000010_phase6_enums.sql.
--
-- Per the Phase 2-5 enum-in-transaction caveat, new enum types used by
-- later Phase 6 migrations live in their own migration file so that no
-- following column/function/check references them in the same transaction
-- that created them. Each migration file runs in its own transaction in
-- our runner.
--
-- SYL-17 / SYL-20 / SYL-24 drivers:
--   - lesson_override_kind powers the lesson_override table (Task 2a).
--   - audit_exception_kind + audit_exception_severity power the
--     training_record_audit_exception table (Task 2a) and the nightly
--     pg_cron run_training_record_audit() function (Task 2c).

create type public.lesson_override_kind as enum (
  'prerequisite_skip',
  'repeat_limit_exceeded',
  'currency_waiver'
);

create type public.audit_exception_kind as enum (
  'missing_lessons',
  'hours_deficit',
  'missing_endorsements',
  'missing_stage_checks',
  'stale_rollovers',
  'expired_overrides'
);

create type public.audit_exception_severity as enum (
  'info',
  'warn',
  'critical'
);
