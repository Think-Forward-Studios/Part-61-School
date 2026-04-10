-- Phase 6 migration (part 7): pg_cron extension + nightly audit job registration.
--
-- Hand-authored, mirrored verbatim at
-- supabase/migrations/20260409000016_phase6_pg_cron.sql.
--
-- pg_cron is available on Supabase hosted Postgres but may not be
-- available in the local dev stack. The DO block catches the error
-- gracefully so local `supabase db reset` does not fail.
--
-- In production (Supabase hosted), pg_cron is pre-installed and
-- this migration registers the nightly training record audit job.

do $$
begin
  -- Enable pg_cron if available
  create extension if not exists pg_cron;

  -- Remove existing job if re-running (idempotent)
  perform cron.unschedule('phase6_nightly_training_record_audit');
exception
  when others then
    -- Job may not exist yet on first run — ignore
    null;
end;
$$;

do $$
begin
  -- Register nightly training record audit at 07:00 UTC daily
  perform cron.schedule(
    'phase6_nightly_training_record_audit',
    '0 7 * * *',
    'select public.run_training_record_audit()'
  );
exception
  when others then
    raise notice 'pg_cron not available locally — job registered in production only: %', sqlerrm;
end;
$$;
