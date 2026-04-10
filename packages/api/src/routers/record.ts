/**
 * record router — Phase 5-03 (SYL-14) + Phase 6-02.
 *
 * Student-facing read-only queries. EVERY procedure MUST scope to
 * ctx.session.userId — never to an arbitrary userId in input.
 *
 * Phase 6 adds: getMyProgressForecast, getMyMinimumsStatus.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  flightLogTime,
  personnelCurrency,
  studentCourseEnrollment,
} from '@part61/db';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

type Tx = {
  select: typeof import('@part61/db').db.select;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const recordRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const rows = (await tx.execute(sql`
      select
        u.id as user_id,
        u.email,
        u.full_name,
        pp.first_name,
        pp.last_name,
        pp.faa_airman_cert_number
      from public.users u
      left join public.person_profile pp on pp.user_id = u.id
      where u.id = ${userId}
      limit 1
    `)) as unknown as Array<Record<string, unknown>>;
    const enrollments = await tx
      .select()
      .from(studentCourseEnrollment)
      .where(
        and(
          eq(studentCourseEnrollment.userId, userId),
          isNull(studentCourseEnrollment.deletedAt),
        ),
      )
      .orderBy(desc(studentCourseEnrollment.enrolledAt));
    return { profile: rows[0] ?? null, enrollments };
  }),

  myCourseProgress: protectedProcedure
    .input(z.object({ enrollmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const userId = ctx.session!.userId;
      const enrollmentRows = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(
          and(
            eq(studentCourseEnrollment.id, input.enrollmentId),
            eq(studentCourseEnrollment.userId, userId),
            isNull(studentCourseEnrollment.deletedAt),
          ),
        )
        .limit(1);
      const enrollment = enrollmentRows[0];
      if (!enrollment) {
        return { enrollment: null, totalLineItems: 0, gradedLineItems: 0 };
      }
      const counts = (await tx.execute(sql`
        select
          (select count(*)::int from public.line_item li
            join public.lesson l on l.id = li.lesson_id
            where l.course_version_id = ${enrollment.courseVersionId}
              and li.deleted_at is null) as total,
          (select count(*)::int from public.line_item_grade lig
            join public.lesson_grade_sheet lgs on lgs.id = lig.grade_sheet_id
            where lgs.student_enrollment_id = ${enrollment.id}
              and lig.grade_value <> '') as graded
      `)) as unknown as Array<{ total: number; graded: number }>;
      return {
        enrollment,
        totalLineItems: counts[0]?.total ?? 0,
        gradedLineItems: counts[0]?.graded ?? 0,
      };
    }),

  myFlightLog: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(flightLogTime)
        .where(
          and(
            eq(flightLogTime.userId, ctx.session!.userId),
            isNull(flightLogTime.deletedAt),
          ),
        )
        .orderBy(desc(flightLogTime.createdAt))
        .limit(input?.limit ?? 100);
      return rows;
    }),

  myFlightLogTotals: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select *
      from public.user_flight_log_totals
      where user_id = ${ctx.session!.userId}
      limit 1
    `)) as unknown as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  }),

  myCurrencies: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(personnelCurrency)
      .where(
        and(
          eq(personnelCurrency.userId, ctx.session!.userId),
          isNull(personnelCurrency.deletedAt),
        ),
      )
      .orderBy(desc(personnelCurrency.effectiveAt));
    return rows;
  }),

  /**
   * Phase 6 — getMyProgressForecast.
   *
   * Returns the cached forecast for the student's active enrollment.
   * If no cache exists, refreshes then reads.
   */
  getMyProgressForecast: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;

    // Find active enrollment
    const enrollments = await tx
      .select()
      .from(studentCourseEnrollment)
      .where(
        and(
          eq(studentCourseEnrollment.userId, userId),
          isNull(studentCourseEnrollment.deletedAt),
          isNull(studentCourseEnrollment.completedAt),
          isNull(studentCourseEnrollment.withdrawnAt),
        ),
      )
      .limit(1);
    const enrollment = enrollments[0];
    if (!enrollment) {
      return null;
    }

    // Read cache; refresh if missing
    let cacheRows = (await tx.execute(sql`
      select * from public.student_progress_forecast_cache
      where student_enrollment_id = ${enrollment.id}::uuid
      limit 1
    `)) as unknown as Array<Record<string, unknown>>;

    if (!cacheRows[0]) {
      await tx.execute(sql`
        select public.refresh_student_progress_forecast(${enrollment.id}::uuid)
      `);
      cacheRows = (await tx.execute(sql`
        select * from public.student_progress_forecast_cache
        where student_enrollment_id = ${enrollment.id}::uuid
        limit 1
      `)) as unknown as Array<Record<string, unknown>>;
    }

    return cacheRows[0] ?? null;
  }),

  /**
   * Phase 6 — getMyMinimumsStatus.
   *
   * Returns the student's course minimums tracker view row.
   * Authz: only the student's own enrollment.
   */
  getMyMinimumsStatus: protectedProcedure
    .input(z.object({ enrollmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const userId = ctx.session!.userId;

      // Verify student owns the enrollment
      const enrollments = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(
          and(
            eq(studentCourseEnrollment.id, input.enrollmentId),
            eq(studentCourseEnrollment.userId, userId),
            isNull(studentCourseEnrollment.deletedAt),
          ),
        )
        .limit(1);
      if (!enrollments[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrollment not found' });
      }

      const rows = (await tx.execute(sql`
        select * from public.student_course_minimums_status
        where enrollment_id = ${input.enrollmentId}::uuid
      `)) as unknown as Array<Record<string, unknown>>;
      return rows[0] ?? null;
    }),
});
