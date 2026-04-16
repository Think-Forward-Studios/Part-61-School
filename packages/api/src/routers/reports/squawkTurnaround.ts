/**
 * Squawk turnaround report — REP-05.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { resolveReportScope, resolveDateBoundaries } from '../../helpers/report_scope';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const squawkTurnaroundRouter = router({
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

      const rows = (await tx.execute(sql`
        select
          a.id as aircraft_id,
          a.tail_number,
          count(*) filter (
            where s.opened_at >= ${fromUtc.toISOString()}::timestamptz
              and s.opened_at <= ${toUtc.toISOString()}::timestamptz
          )::int as opened_in_range,
          count(*) filter (
            where s.resolved_at >= ${fromUtc.toISOString()}::timestamptz
              and s.resolved_at <= ${toUtc.toISOString()}::timestamptz
          )::int as closed_in_range,
          coalesce(
            avg(extract(epoch from (s.resolved_at - s.opened_at)) / 3600)
            filter (
              where s.resolved_at is not null
                and s.resolved_at >= ${fromUtc.toISOString()}::timestamptz
                and s.resolved_at <= ${toUtc.toISOString()}::timestamptz
            ),
            0
          )::numeric as avg_hours_to_resolve
        from public.aircraft a
        left join public.aircraft_squawk s on s.aircraft_id = a.id and s.deleted_at is null
        where a.school_id = ${ctx.session!.schoolId}::uuid
          and a.deleted_at is null
          ${baseFilter}
        group by a.id, a.tail_number
        order by a.tail_number
      `)) as unknown as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        aircraftId: r.aircraft_id as string,
        tailNumber: r.tail_number as string,
        openedInRange: Number(r.opened_in_range ?? 0),
        closedInRange: Number(r.closed_in_range ?? 0),
        avgHoursToResolve: Number(Number(r.avg_hours_to_resolve ?? 0).toFixed(1)),
      }));
    }),
});
