-- Phase 8 migration (part 4): pg_cron jobs for reservations + email outbox.
--
-- Registers three cron jobs (optional in local dev — wrapped in
-- DO/EXCEPTION per the 0029_phase6_pg_cron.sql pattern):
--
--   1. phase8_reservation_reminder_24h  — every 5 minutes
--      Inserts reservation_reminder_24h notification + email_outbox rows
--      for approved/dispatched flight reservations starting in 23.5–24.5h
--      that don't already have a reminder row (RESEARCH Pitfall 6).
--
--   2. phase8_email_outbox_drain        — every 1 minute
--      POSTs to /api/emails/send via pg_net with the internal secret
--      header. Relies on `app.internal_worker_secret` session setting
--      being present — otherwise the job is a no-op (safe default for
--      local dev).
--
--   3. phase8_email_outbox_retention    — nightly at 03:15
--      Removes sent rows older than 30 days and failed rows older than
--      90 days (RESEARCH Pitfall 8).

-- ============================================================================
-- 1. pg_net extension (required for outbox drain)
-- ============================================================================
do $$
begin
  create extension if not exists pg_net;
exception
  when others then
    raise notice 'pg_net extension not available — outbox drain will no-op: %', sqlerrm;
end;
$$;

-- ============================================================================
-- 2. Unschedule existing jobs (idempotent re-run safety)
-- ============================================================================
do $$
begin
  perform cron.unschedule('phase8_reservation_reminder_24h');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.unschedule('phase8_email_outbox_drain');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.unschedule('phase8_email_outbox_retention');
exception when others then null;
end;
$$;

-- ============================================================================
-- 3. 24-hour reservation reminder
-- ============================================================================
do $$
begin
  perform cron.schedule(
    'phase8_reservation_reminder_24h',
    '*/5 * * * *',
    $job$
      with candidates as (
        select
          r.id           as reservation_id,
          r.school_id,
          r.base_id,
          coalesce(r.student_id, r.instructor_id) as user_id,
          lower(r.time_range) as starts_at
        from public.reservation r
        where r.activity_type = 'flight'
          and r.status in ('approved', 'dispatched')
          and r.deleted_at is null
          and lower(r.time_range) between now() + interval '23.5 hours'
                                      and now() + interval '24.5 hours'
          and coalesce(r.student_id, r.instructor_id) is not null
          and not exists (
            select 1 from public.notifications n
             where n.source_table = 'reservation'
               and n.source_record_id = r.id
               and n.kind = 'reservation_reminder_24h'
          )
      ),
      inserted as (
        insert into public.notifications
          (school_id, base_id, user_id, kind, channel, title, body,
           link_url, source_table, source_record_id, severity, is_safety_critical)
        select
          c.school_id,
          c.base_id,
          c.user_id,
          'reservation_reminder_24h'::public.notification_event_kind,
          'in_app'::public.notification_channel,
          'Reservation tomorrow',
          'Your reservation at ' || to_char(c.starts_at, 'YYYY-MM-DD HH24:MI TZ') || ' is ~24 hours away.',
          '/schedule/reservation/' || c.reservation_id::text,
          'reservation',
          c.reservation_id,
          'info',
          false
        from candidates c
        -- Only insert if effective pref for (user, kind, in_app) is on.
        where exists (
          select 1
            from public.users u
            left join public.user_notification_pref p
              on p.user_id = u.id
             and p.kind = 'reservation_reminder_24h'
             and p.channel = 'in_app'
            left join public.notification_default_by_role d
              on d.role = coalesce(
                   (select role::text from public.user_roles ur
                     where ur.user_id = u.id and ur.is_default
                     limit 1),
                   'student')
             and d.kind = 'reservation_reminder_24h'
             and d.channel = 'in_app'
           where u.id = c.user_id
             and coalesce(p.enabled, d.enabled, false) = true
        )
        returning id, user_id, school_id, source_record_id
      )
      insert into public.email_outbox
        (school_id, notification_id, to_email, subject, template_key,
         template_props, idempotency_key)
      select
        i.school_id,
        i.id,
        u.email,
        'Reservation tomorrow',
        'reservation_reminder_24h',
        jsonb_build_object(
          'reservationId', i.source_record_id,
          'reservationUrl', '/schedule/reservation/' || i.source_record_id::text
        ),
        i.id::text || ':reservation_reminder_24h'
      from inserted i
      join public.users u on u.id = i.user_id
      where exists (
        select 1
          from public.user_notification_pref p
         where p.user_id = i.user_id
           and p.kind = 'reservation_reminder_24h'
           and p.channel = 'email'
           and p.enabled = true
        union all
        select 1
          from public.notification_default_by_role d
         where d.role = coalesce(
                 (select role::text from public.user_roles ur
                   where ur.user_id = i.user_id and ur.is_default
                   limit 1),
                 'student')
           and d.kind = 'reservation_reminder_24h'
           and d.channel = 'email'
           and d.enabled = true
           and not exists (
             select 1 from public.user_notification_pref pp
              where pp.user_id = i.user_id
                and pp.kind = 'reservation_reminder_24h'
                and pp.channel = 'email'
           )
      )
      on conflict (idempotency_key) do nothing;
    $job$
  );
exception
  when others then
    raise notice 'pg_cron not available locally — phase8_reservation_reminder_24h registered in production only: %', sqlerrm;
end;
$$;

-- ============================================================================
-- 4. Email outbox drain
-- ============================================================================
-- Uses pg_net to POST to the Next.js route handler. Relies on these two
-- GUCs being configured on the DB (via `alter database ... set ...`):
--   • app.internal_worker_secret — matches INTERNAL_WORKER_SECRET env var
--   • app.email_worker_url       — absolute URL of /api/emails/send endpoint
--
-- If either is missing the job becomes a no-op. That's intentional — local
-- dev without these GUCs should not attempt outbound HTTP.
do $$
begin
  perform cron.schedule(
    'phase8_email_outbox_drain',
    '*/1 * * * *',
    $job$
      do $inner$
      declare
        v_secret text := current_setting('app.internal_worker_secret', true);
        v_url    text := current_setting('app.email_worker_url', true);
        v_pending int;
      begin
        if coalesce(v_secret, '') = '' or coalesce(v_url, '') = '' then
          return;
        end if;
        select count(*) into v_pending
          from public.email_outbox
         where status = 'pending' and attempts < 5;
        if v_pending = 0 then return; end if;
        perform net.http_post(
          url     := v_url,
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'x-internal-secret', v_secret
          ),
          body    := jsonb_build_object('trigger', 'cron')
        );
      exception
        when others then
          raise notice 'email outbox drain failed: %', sqlerrm;
      end;
      $inner$;
    $job$
  );
exception
  when others then
    raise notice 'pg_cron not available locally — phase8_email_outbox_drain registered in production only: %', sqlerrm;
end;
$$;

-- ============================================================================
-- 5. Email outbox retention
-- ============================================================================
do $$
begin
  perform cron.schedule(
    'phase8_email_outbox_retention',
    '15 3 * * *',
    $job$
      delete from public.email_outbox
       where (status = 'sent'   and sent_at < now() - interval '30 days')
          or (status = 'failed' and failed_at < now() - interval '90 days');
    $job$
  );
exception
  when others then
    raise notice 'pg_cron not available locally — phase8_email_outbox_retention registered in production only: %', sqlerrm;
end;
$$;
