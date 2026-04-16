/**
 * Instructor utilization report — REP-05.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { resolveReportScope, resolveDateBoundaries } from '../../helpers/report_scope';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const instructorUtilizationRouter = router({
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
          u.id as instructor_id,
          coalesce(pp.first_name || ' ' || pp.last_name, u.full_name, u.email) as name,
          u.email,
          coalesce(sched.hours, 0)::numeric as scheduled_hours,
          coalesce(flown.hours, 0)::numeric as flown_hours,
          pr.pass_rate,
          pr.attempts_total::int as attempts_total,
          coalesce(warn.cnt, 0)::int as workload_warnings,
          0::int as duty_violations
        from public.users u
        join public.user_roles ur on ur.user_id = u.id
          and ur.school_id = ${ctx.session!.schoolId}::uuid
          and ur.role = 'instructor'
        left join public.person_profile pp on pp.user_id = u.id
        left join lateral (
          select sum(extract(epoch from (upper(r.time_range) - lower(r.time_range))) / 3600) as hours
          from public.reservation r
          where r.instructor_id = u.id
            and r.school_id = ${ctx.session!.schoolId}::uuid
            and r.deleted_at is null
            and r.status in ('approved', 'dispatched', 'flown', 'closed')
            and lower(r.time_range) >= ${fromUtc.toISOString()}::timestamptz
            and lower(r.time_range) <= ${toUtc.toISOString()}::timestamptz
            ${baseFilter}
        ) sched on true
        left join lateral (
          select sum(extract(epoch from (upper(r2.time_range) - lower(r2.time_range))) / 3600) as hours
          from public.reservation r2
          where r2.instructor_id = u.id
            and r2.school_id = ${ctx.session!.schoolId}::uuid
            and r2.deleted_at is null
            and r2.status in ('flown', 'closed')
            and lower(r2.time_range) >= ${fromUtc.toISOString()}::timestamptz
            and lower(r2.time_range) <= ${toUtc.toISOString()}::timestamptz
        ) flown on true
        left join lateral (
          select
            (count(*) filter (where sc.is_faa_checkride and sc.status = 'passed' and sc.attempt_number = 1)::numeric
             / nullif(count(*) filter (where sc.is_faa_checkride and sc.attempt_number = 1), 0)) as pass_rate,
            count(*) filter (where sc.is_faa_checkride and sc.attempt_number = 1)::int as attempts_total
          from public.stage_check sc
          where sc.instructor_id = u.id
            and sc.deleted_at is null
            and sc.school_id = ${ctx.session!.schoolId}::uuid
        ) pr on true
        left join lateral (
          select count(*)::int as cnt
          from public.notification n
          where n.user_id = u.id
            and n.kind = 'duty_hour_warning'
            and n.created_at >= ${fromUtc.toISOString()}::timestamptz
            and n.created_at <= ${toUtc.toISOString()}::timestamptz
        ) warn on true
        order by name
      `)) as unknown as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        instructorId: r.instructor_id as string,
        name: r.name as string,
        email: r.email as string,
        scheduledHours: Number(r.scheduled_hours ?? 0),
        flownHours: Number(r.flown_hours ?? 0),
        passRateFirstAttempt: r.pass_rate ? Number(r.pass_rate) : null,
        attemptsTotal: Number(r.attempts_total ?? 0),
        workloadWarnings: Number(r.workload_warnings ?? 0),
        dutyViolations: Number(r.duty_violations ?? 0),
      }));
    }),
});
