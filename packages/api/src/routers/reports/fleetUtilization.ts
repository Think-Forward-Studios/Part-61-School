/**
 * Fleet utilization report — REP-05.
 * Per aircraft: flight hours, scheduled hours, utilization %, squawk count.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { resolveReportScope, resolveDateBoundaries } from '../../helpers/report_scope';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const fleetUtilizationRouter = router({
  query: adminProcedure
    .input(
      z.object({
        baseId: z.union([z.string().uuid(), z.literal('all')]).optional(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const scope = resolveReportScope({ baseId: input.baseId, caller: ctx.session! });
      const { fromUtc, toUtc } = resolveDateBoundaries({ from: input.from, to: input.to });
      const baseFilter = scope.baseIdsFilter
        ? sql`and a.base_id = any(${scope.baseIdsFilter}::uuid[])`
        : sql``;

      // allow-banned-term: internal Postgres enum literal
      const rows = (await tx.execute(sql`
        select
          a.id as aircraft_id,
          a.tail_number,
          coalesce(a.make, '') || ' ' || coalesce(a.model, '') as make_model,
          coalesce(flight.hours, 0)::numeric as flight_hours,
          coalesce(sched.hours, 0)::numeric as scheduled_hours,
          case when coalesce(sched.hours, 0) > 0
            then (coalesce(flight.hours, 0) / sched.hours * 100)
            else 0 end::numeric as utilization_pct,
          coalesce(sq.cnt, 0)::int as squawk_count
        from public.aircraft a
        left join lateral (
          select sum(fi.hobbs_reading - fo.hobbs_reading) as hours
          from public.flight_log_entry fo
          join public.flight_log_entry fi
            on fi.paired_entry_id = fo.id and fi.kind = 'flight_in'
          where fo.kind = 'flight_out'
            and fo.aircraft_id = a.id
            and fi.flown_at >= ${fromUtc.toISOString()}::timestamptz
            and fi.flown_at <= ${toUtc.toISOString()}::timestamptz
        ) flight on true
        left join lateral (
          select sum(extract(epoch from (upper(r.time_range) - lower(r.time_range))) / 3600) as hours
          from public.reservation r
          where r.aircraft_id = a.id
            and r.deleted_at is null
            and r.status in ('approved', 'dispatched', 'flown', 'closed')
            and lower(r.time_range) >= ${fromUtc.toISOString()}::timestamptz
            and lower(r.time_range) <= ${toUtc.toISOString()}::timestamptz
        ) sched on true
        left join lateral (
          select count(*)::int as cnt
          from public.aircraft_squawk s
          where s.aircraft_id = a.id
            and s.deleted_at is null
            and s.opened_at >= ${fromUtc.toISOString()}::timestamptz
            and s.opened_at <= ${toUtc.toISOString()}::timestamptz
        ) sq on true
        where a.school_id = ${ctx.session!.schoolId}::uuid
          and a.deleted_at is null
          ${baseFilter}
        order by a.tail_number
      `)) as unknown as Array<{
        aircraft_id: string;
        tail_number: string;
        make_model: string;
        flight_hours: string;
        scheduled_hours: string;
        utilization_pct: string;
        squawk_count: number;
      }>;

      return rows.map((r) => ({
        aircraftId: r.aircraft_id,
        tailNumber: r.tail_number,
        makeModel: r.make_model.trim(),
        flightHours: Number(r.flight_hours),
        scheduledHours: Number(r.scheduled_hours),
        utilizationPct: Number(r.utilization_pct),
        squawkCount: r.squawk_count,
      }));
    }),
});
