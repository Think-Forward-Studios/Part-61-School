/**
 * instructorMetrics router — IPF-03, IPF-04, IPF-05.
 *
 * Pass rate, workload, and duty-hour surfaces for instructors.
 * Admin can query any instructor; instructor can query self.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';
import { instructorDutyMinutesInWindow, checkDutyHoursForProposal } from '../helpers/duty_hours';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const instructorMetricsRouter = router({
  /**
   * IPF-03: first-attempt FAA checkride pass rate for an instructor.
   * Uses is_faa_checkride + attempt_number from 08-01 schema.
   */
  passRate: protectedProcedure
    .input(z.object({ instructorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select
          (count(*) filter (
            where sc.is_faa_checkride and sc.status = 'passed' and sc.attempt_number = 1
          )::numeric
          / nullif(count(*) filter (
            where sc.is_faa_checkride and sc.attempt_number = 1
          ), 0)) as pass_rate_first_attempt,
          count(*) filter (
            where sc.is_faa_checkride and sc.attempt_number = 1
          )::int as attempts_total,
          count(*) filter (
            where sc.is_faa_checkride and sc.status = 'passed' and sc.attempt_number = 1
          )::int as passes_first_attempt
        from public.stage_check sc
        where sc.instructor_id = ${input.instructorId}::uuid
          and sc.deleted_at is null
          and sc.school_id = ${ctx.session!.schoolId}::uuid
      `)) as unknown as Array<{
        pass_rate_first_attempt: string | null;
        attempts_total: number;
        passes_first_attempt: number;
      }>;

      const row = rows[0];
      return {
        passRateFirstAttempt: row?.pass_rate_first_attempt
          ? Number(row.pass_rate_first_attempt)
          : null,
        attemptsTotal: row?.attempts_total ?? 0,
        passesFirstAttempt: row?.passes_first_attempt ?? 0,
      };
    }),

  /**
   * Workload for a single instructor: hours this week, students
   * assigned, pending grades.
   */
  workloadForInstructor: protectedProcedure
    .input(
      z.object({
        instructorId: z.string().uuid(),
        weekStart: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const instructorId = input.instructorId;
      const schoolId = ctx.session!.schoolId;

      // Hours this week (Mon-Sun, school TZ)
      const hoursRows = (await tx.execute(sql`
        select coalesce(sum(
          extract(epoch from (upper(time_range) - lower(time_range))) / 3600
        ), 0)::numeric as hours_this_week
        from public.reservation
        where instructor_id = ${instructorId}::uuid
          and school_id = ${schoolId}::uuid
          and deleted_at is null
          and status in ('approved','dispatched','flown','pending_sign_off','closed')
          and lower(time_range) >= date_trunc('week', now())
          and lower(time_range) < date_trunc('week', now()) + interval '7 days'
      `)) as unknown as Array<{ hours_this_week: string }>;

      // Students assigned (active enrollments)
      const studentRows = (await tx.execute(sql`
        select count(*)::int as count
        from public.student_course_enrollment
        where primary_instructor_id = ${instructorId}::uuid
          and school_id = ${schoolId}::uuid
          and deleted_at is null
          and completed_at is null
          and withdrawn_at is null
      `)) as unknown as Array<{ count: number }>;

      // Pending grades (flown reservations with no sealed grade sheet)
      const gradeRows = (await tx.execute(sql`
        select count(*)::int as count
        from public.reservation r
        where r.instructor_id = ${instructorId}::uuid
          and r.school_id = ${schoolId}::uuid
          and r.deleted_at is null
          and r.status = 'flown'
          and not exists (
            select 1 from public.lesson_grade_sheet lgs
            where lgs.reservation_id = r.id and lgs.status = 'sealed'
          )
      `)) as unknown as Array<{ count: number }>;

      return {
        hoursThisWeek: Number(hoursRows[0]?.hours_this_week ?? 0),
        studentsAssigned: studentRows[0]?.count ?? 0,
        pendingGrades: gradeRows[0]?.count ?? 0,
      };
    }),

  /**
   * IPF-05: workload for ALL instructors — admin dashboard.
   */
  workloadAll: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    const rows = (await tx.execute(sql`
      select
        u.id as instructor_id,
        coalesce(pp.first_name || ' ' || pp.last_name, u.full_name, u.email) as name,
        coalesce((
          select sum(extract(epoch from (upper(r.time_range) - lower(r.time_range))) / 3600)
          from public.reservation r
          where r.instructor_id = u.id
            and r.school_id = ${schoolId}::uuid
            and r.deleted_at is null
            and r.status in ('approved','dispatched','flown','pending_sign_off','closed')
            and lower(r.time_range) >= date_trunc('week', now())
            and lower(r.time_range) < date_trunc('week', now()) + interval '7 days'
        ), 0)::numeric as hours_this_week,
        (
          select count(*)::int
          from public.student_course_enrollment e
          where e.primary_instructor_id = u.id
            and e.school_id = ${schoolId}::uuid
            and e.deleted_at is null and e.completed_at is null and e.withdrawn_at is null
        ) as students_assigned,
        (
          select count(*)::int
          from public.reservation r2
          where r2.instructor_id = u.id
            and r2.school_id = ${schoolId}::uuid
            and r2.deleted_at is null
            and r2.status = 'flown'
            and not exists (
              select 1 from public.lesson_grade_sheet lgs
              where lgs.reservation_id = r2.id and lgs.status = 'sealed'
            )
        ) as pending_grades
      from public.users u
      join public.user_roles ur on ur.user_id = u.id
        and ur.school_id = ${schoolId}::uuid
        and ur.role = 'instructor'
      left join public.person_profile pp on pp.user_id = u.id
      order by hours_this_week desc
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),

  /**
   * IPF-04: duty-hour usage in a 24h window.
   */
  dutyHoursInWindow: protectedProcedure
    .input(
      z.object({
        instructorId: z.string().uuid(),
        windowEnd: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const windowEnd = input.windowEnd
        ? new Date(input.windowEnd)
        : new Date(Date.now() + 24 * 60 * 60_000);
      const minutes = await instructorDutyMinutesInWindow(tx, input.instructorId, windowEnd);
      return { minutes, maxMinutes: 480 };
    }),

  /**
   * Client-side preview for scheduling form.
   */
  checkDutyHoursForProposal: protectedProcedure
    .input(
      z.object({
        instructorId: z.string().uuid(),
        proposedStart: z.string().datetime(),
        proposedEnd: z.string().datetime(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return await checkDutyHoursForProposal(tx, {
        instructorId: input.instructorId,
        proposedStart: new Date(input.proposedStart),
        proposedEnd: new Date(input.proposedEnd),
      });
    }),
});
