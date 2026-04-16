/**
 * Course completion report — REP-05.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { resolveDateBoundaries } from '../../helpers/report_scope';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const courseCompletionRouter = router({
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
      const { fromUtc, toUtc } = resolveDateBoundaries({ from: input.from, to: input.to });
      const schoolId = ctx.session!.schoolId;

      const rows = (await tx.execute(sql`
        select
          c.title as course_name,
          cv.version_label,
          count(*)::int as enrolled,
          count(*) filter (
            where e.completed_at is not null
              and e.completed_at >= ${fromUtc.toISOString()}::timestamptz
              and e.completed_at <= ${toUtc.toISOString()}::timestamptz
          )::int as completed,
          case when count(*) > 0
            then (count(*) filter (
              where e.completed_at is not null
                and e.completed_at >= ${fromUtc.toISOString()}::timestamptz
                and e.completed_at <= ${toUtc.toISOString()}::timestamptz
            )::numeric / count(*) * 100)
            else 0 end::numeric as completion_rate_pct,
          coalesce(
            avg(extract(epoch from (e.completed_at - e.enrolled_at)) / 86400)
            filter (where e.completed_at is not null),
            0
          )::numeric as avg_days_to_complete
        from public.student_course_enrollment e
        join public.course_version cv on cv.id = e.course_version_id
        join public.course c on c.id = cv.course_id
        where e.school_id = ${schoolId}::uuid
          and e.deleted_at is null
        group by c.id, c.title, cv.id, cv.version_label
        order by c.title, cv.version_label
      `)) as unknown as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        courseName: r.course_name as string,
        versionLabel: (r.version_label as string) ?? '',
        enrolled: Number(r.enrolled ?? 0),
        completed: Number(r.completed ?? 0),
        completionRatePct: Number(Number(r.completion_rate_pct ?? 0).toFixed(1)),
        avgDaysToComplete: Number(Number(r.avg_days_to_complete ?? 0).toFixed(0)),
      }));
    }),
});
