/**
 * Student progress report — REP-05.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { resolveReportScope, resolveDateBoundaries } from '../../helpers/report_scope';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const studentProgressRouter = router({
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
      resolveReportScope({ baseId: input.baseId, caller: ctx.session! });
      resolveDateBoundaries({ from: input.from, to: input.to });
      const schoolId = ctx.session!.schoolId;

      const rows = (await tx.execute(sql`
        select
          u.id as student_id,
          coalesce(pp.first_name || ' ' || pp.last_name, u.full_name, u.email) as name,
          c.title as course_name,
          cv.version_label,
          e.id as enrollment_id,
          coalesce(fc.ahead_behind_days, 0)::int as ahead_behind_days,
          coalesce(hours.total, 0)::numeric as hours_flown,
          coalesce(progress.pct, 0)::numeric as pct_complete
        from public.student_course_enrollment e
        join public.users u on u.id = e.user_id
        left join public.person_profile pp on pp.user_id = u.id
        left join public.course_version cv on cv.id = e.course_version_id
        left join public.course c on c.id = cv.course_id
        left join public.student_progress_forecast_cache fc on fc.enrollment_id = e.id
        left join lateral (
          select sum(flt.hours)::numeric as total
          from public.flight_log_time flt
          join public.flight_log_entry fle on fle.id = flt.flight_log_entry_id
          where flt.user_id = e.user_id
            and fle.school_id = ${schoolId}::uuid
        ) hours on true
        left join lateral (
          select
            case when total_items.cnt > 0
              then (graded_items.cnt::numeric / total_items.cnt * 100)
              else 0 end as pct
          from (
            select count(*)::int as cnt from public.line_item li
            join public.lesson l on l.id = li.lesson_id
            join public.unit un on un.id = l.unit_id
            join public.phase ph on ph.id = un.phase_id
            join public.stage st on st.id = ph.stage_id
            where st.course_version_id = e.course_version_id
              and li.classification = 'required'
          ) total_items,
          (
            select count(distinct lig.line_item_id)::int as cnt
            from public.line_item_grade lig
            join public.lesson_grade_sheet lgs on lgs.id = lig.grade_sheet_id
            where lgs.student_enrollment_id = e.id
              and lgs.status = 'sealed'
          ) graded_items
        ) progress on true
        where e.school_id = ${schoolId}::uuid
          and e.deleted_at is null
          and e.completed_at is null
          and e.withdrawn_at is null
        order by name
      `)) as unknown as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        studentId: r.student_id as string,
        name: r.name as string,
        courseName: (r.course_name as string) ?? 'Unknown',
        versionLabel: (r.version_label as string) ?? '',
        pctComplete: Number(r.pct_complete ?? 0),
        hoursFlown: Number(r.hours_flown ?? 0),
        aheadBehindDays: Number(r.ahead_behind_days ?? 0),
      }));
    }),
});
