-- Phase 8 migration (part 6): pg_cron dispatch-cue job for overdue aircraft.
--
-- Every minute, insert dispatch-channel notifications for flight
-- reservations past their expected ramp-in that haven't been closed,
-- unless a recent (<5 min) dispatch cue already exists.
--
-- Recipients: every admin/instructor in the school. Dispatcher role
-- doesn't exist yet — when it lands (Phase 8-03?), add it to the role
-- filter here.
--
-- Grounded-aircraft-attempted-use events are NOT emitted by this
-- migration — they're emitted from the ADS-B pipeline (Plan 08-02
-- will wire into packages/api/src/routers/adsb.ts).

do $$
begin
  perform cron.unschedule('phase8_dispatch_cue');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'phase8_dispatch_cue',
    '*/1 * * * *',
    $job$
      insert into public.notifications
        (school_id, base_id, user_id, kind, channel, title, body,
         link_url, source_table, source_record_id, severity, is_safety_critical)
      select
        r.school_id,
        r.base_id,
        u.id as user_id,
        'overdue_aircraft'::public.notification_event_kind,
        'dispatch'::public.notification_channel,
        'Overdue aircraft — ' || coalesce(a.tail_number, 'unknown'),
        'Expected ramp-in at ' || to_char(upper(r.time_range), 'HH24:MI')
          || ' — still not closed.',
        '/dispatch?reservation=' || r.id::text,
        'reservation',
        r.id,
        'critical',
        true
      from public.reservation r
      join public.users u
        on u.school_id = r.school_id
       and u.deleted_at is null
       and exists (
         select 1 from public.user_roles ur
          where ur.user_id = u.id
            and ur.role in ('admin', 'instructor')
       )
      left join public.aircraft a on a.id = r.aircraft_id
      where r.activity_type = 'flight'
        and r.status in ('approved', 'dispatched', 'flown')
        and r.deleted_at is null
        and upper(r.time_range) < now() - interval '5 minutes'
        and r.closed_at is null
        and not exists (
          select 1 from public.notifications n
           where n.source_table = 'reservation'
             and n.source_record_id = r.id
             and n.kind = 'overdue_aircraft'
             and n.channel = 'dispatch'
             and n.created_at > now() - interval '5 minutes'
        );
    $job$
  );
exception
  when others then
    raise notice 'pg_cron not available locally — phase8_dispatch_cue registered in production only: %', sqlerrm;
end;
$$;
