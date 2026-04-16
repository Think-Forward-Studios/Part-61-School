/**
 * No-show rate report — REP-05.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { resolveReportScope, resolveDateBoundaries } from '../../helpers/report_scope';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const noShowRateRouter = router({
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
        ? sql`and r.base_id = any(${scope.baseIdsFilter}::uuid[])`
        : sql``;

      // allow-banned-term: internal Postgres enum literal
      const rows = (await tx.execute(sql`
        select
          u.id as student_id,
          coalesce(pp.first_name || ' ' || pp.last_name, u.full_name, u.email) as name,
          count(*) filter (where ns.id is not null)::int as no_shows,
          count(*)::int as total_reservations,
          case when count(*) > 0
            then (count(*) filter (where ns.id is not null)::numeric / count(*) * 100)
            else 0 end::numeric as no_show_rate_pct
        from public.reservation r
        join public.users u on u.id = r.student_id
        left join public.person_profile pp on pp.user_id = u.id
        left join public.no_show ns on ns.reservation_id = r.id
        where r.school_id = ${ctx.session!.schoolId}::uuid
          and r.deleted_at is null
          and r.student_id is not null
          and r.status in ('flown', 'closed', 'no_show', 'approved', 'dispatched')
          and lower(r.time_range) >= ${fromUtc.toISOString()}::timestamptz
          and lower(r.time_range) <= ${toUtc.toISOString()}::timestamptz
          ${baseFilter}
        group by u.id, pp.first_name, pp.last_name, u.full_name, u.email
        order by no_show_rate_pct desc, name
      `)) as unknown as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        studentId: r.student_id as string,
        name: r.name as string,
        noShows: Number(r.no_shows ?? 0),
        totalReservations: Number(r.total_reservations ?? 0),
        noShowRatePct: Number(r.no_show_rate_pct ?? 0),
      }));
    }),
});
