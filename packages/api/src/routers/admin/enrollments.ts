/**
 * admin.enrollments router — Phase 5-03 + Phase 6-02.
 *
 * Student course enrollment lifecycle: create, migrate to a new course
 * version (with audit reason), mark complete, withdraw. Gated by
 * adminOrChiefInstructorProcedure.
 *
 * Phase 6 adds: getProgressForecast, getMinimumsStatus, listRolloverQueue.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { studentCourseEnrollment, courseVersion } from '@part61/db';
import { router } from '../../trpc';
import { adminOrChiefInstructorProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminEnrollmentsRouter = router({
  list: adminOrChiefInstructorProcedure
    .input(
      z
        .object({
          studentUserId: z
            .string()
            .regex(/^[0-9a-fA-F-]{36}$/)
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      // Raw SQL so the caller gets enrollment rows pre-joined with the
      // course code + title + version label. Drizzle's query builder
      // gets ugly with three joins and a soft-delete filter on the
      // chain; raw SQL keeps this readable and matches the shape
      // /admin/enrollments has already been using.
      const filter = input?.studentUserId
        ? sql`and sce.user_id = ${input.studentUserId}::uuid`
        : sql``;
      const rows = (await tx.execute(sql`
        select
          sce.id,
          sce.user_id                 as "userId",
          sce.course_version_id       as "courseVersionId",
          sce.primary_instructor_id   as "primaryInstructorId",
          sce.enrolled_at             as "enrolledAt",
          sce.completed_at            as "completedAt",
          sce.withdrawn_at            as "withdrawnAt",
          sce.notes                   as notes,
          c.id                        as "courseId",
          c.code                      as "courseCode",
          c.title                     as "courseTitle",
          cv.version_label            as "versionLabel",
          cv.published_at             as "versionPublishedAt"
        from public.student_course_enrollment sce
        left join public.course_version cv on cv.id = sce.course_version_id
        left join public.course c on c.id = cv.course_id
        where sce.school_id = ${schoolId}::uuid
          and sce.deleted_at is null
          ${filter}
        order by sce.enrolled_at desc
      `)) as unknown as Array<{
        id: string;
        userId: string;
        courseVersionId: string | null;
        primaryInstructorId: string | null;
        enrolledAt: string;
        completedAt: string | null;
        withdrawnAt: string | null;
        notes: string | null;
        courseId: string | null;
        courseCode: string | null;
        courseTitle: string | null;
        versionLabel: string | null;
        versionPublishedAt: string | null;
      }>;
      return rows;
    }),

  get: adminOrChiefInstructorProcedure
    .input(z.object({ id: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(
          and(eq(studentCourseEnrollment.id, input.id), isNull(studentCourseEnrollment.deletedAt)),
        )
        .limit(1);
      const enrollment = rows[0];
      if (!enrollment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrollment not found' });
      }
      let version = null;
      if (enrollment.courseVersionId) {
        const vRows = await tx
          .select()
          .from(courseVersion)
          .where(eq(courseVersion.id, enrollment.courseVersionId))
          .limit(1);
        version = vRows[0] ?? null;
      }
      return { enrollment, version };
    }),

  create: adminOrChiefInstructorProcedure
    .input(
      z.object({
        studentUserId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        courseVersionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        primaryInstructorId: z
          .string()
          .regex(/^[0-9a-fA-F-]{36}$/)
          .optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Guardrail: refuse enrollment against an unpublished version
      const vRows = await tx
        .select({
          id: courseVersion.id,
          publishedAt: courseVersion.publishedAt,
        })
        .from(courseVersion)
        .where(eq(courseVersion.id, input.courseVersionId))
        .limit(1);
      const v = vRows[0];
      if (!v) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course version not found' });
      }
      if (!v.publishedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot enroll a student in a draft course version',
        });
      }
      const [row] = await tx
        .insert(studentCourseEnrollment)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.studentUserId,
          courseVersionId: input.courseVersionId,
          primaryInstructorId: input.primaryInstructorId,
          notes: input.notes,
        })
        .returning();
      return row;
    }),

  migrate: adminOrChiefInstructorProcedure
    .input(
      z.object({
        enrollmentId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        newCourseVersionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Must target a published version
      const vRows = await tx
        .select({ publishedAt: courseVersion.publishedAt })
        .from(courseVersion)
        .where(eq(courseVersion.id, input.newCourseVersionId))
        .limit(1);
      const v = vRows[0];
      if (!v) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target course version not found',
        });
      }
      if (!v.publishedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot migrate to a draft course version',
        });
      }
      const [row] = await tx
        .update(studentCourseEnrollment)
        .set({
          courseVersionId: input.newCourseVersionId,
          notes: input.reason,
        })
        .where(eq(studentCourseEnrollment.id, input.enrollmentId))
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrollment not found' });
      }
      return row;
    }),

  markComplete: adminOrChiefInstructorProcedure
    .input(z.object({ enrollmentId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const [row] = await tx
        .update(studentCourseEnrollment)
        .set({ completedAt: new Date() })
        .where(eq(studentCourseEnrollment.id, input.enrollmentId))
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrollment not found' });
      }
      return row;
    }),

  withdraw: adminOrChiefInstructorProcedure
    .input(
      z.object({
        enrollmentId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const [row] = await tx
        .update(studentCourseEnrollment)
        .set({ withdrawnAt: new Date(), notes: input.reason })
        .where(eq(studentCourseEnrollment.id, input.enrollmentId))
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrollment not found' });
      }
      return row;
    }),

  /**
   * Phase 6 — getProgressForecast (SYL-22/23).
   *
   * Returns the cached forecast for an enrollment; refreshes if missing.
   */
  getProgressForecast: adminOrChiefInstructorProcedure
    .input(z.object({ enrollmentId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;

      let cacheRows = (await tx.execute(sql`
        select * from public.student_progress_forecast_cache
        where student_enrollment_id = ${input.enrollmentId}::uuid
        limit 1
      `)) as unknown as Array<Record<string, unknown>>;

      if (!cacheRows[0]) {
        await tx.execute(sql`
          select public.refresh_student_progress_forecast(${input.enrollmentId}::uuid)
        `);
        cacheRows = (await tx.execute(sql`
          select * from public.student_progress_forecast_cache
          where student_enrollment_id = ${input.enrollmentId}::uuid
          limit 1
        `)) as unknown as Array<Record<string, unknown>>;
      }

      return cacheRows[0] ?? null;
    }),

  /**
   * Phase 6 — getMinimumsStatus (SYL-21).
   *
   * Returns the live minimums tracker view row for an enrollment.
   */
  getMinimumsStatus: adminOrChiefInstructorProcedure
    .input(z.object({ enrollmentId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select * from public.student_course_minimums_status
        where enrollment_id = ${input.enrollmentId}::uuid
      `)) as unknown as Array<Record<string, unknown>>;
      return rows[0] ?? null;
    }),

  /**
   * Phase 6 — listRolloverQueue (SYL-15).
   *
   * Returns outstanding rollover line items for an enrollment,
   * ready for the RolloverQueuePanel UI.
   */
  listRolloverQueue: adminOrChiefInstructorProcedure
    .input(z.object({ enrollmentId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select
          lig.id               as line_item_grade_id,
          lig.rollover_from_grade_sheet_id as source_grade_sheet_id,
          src_sheet.sealed_at  as source_sealed_at,
          src_lesson.id        as source_lesson_id,
          src_lesson.title     as source_lesson_title,
          tgt_sheet.id         as target_grade_sheet_id,
          tgt_lesson.id        as target_lesson_id,
          tgt_lesson.title     as target_lesson_title,
          li.id                as line_item_id,
          li.objectives        as line_item_objective,
          li.classification    as line_item_classification
        from public.line_item_grade lig
        join public.lesson_grade_sheet tgt_sheet on tgt_sheet.id = lig.grade_sheet_id
        join public.lesson           tgt_lesson on tgt_lesson.id = tgt_sheet.lesson_id
        join public.lesson_grade_sheet src_sheet on src_sheet.id = lig.rollover_from_grade_sheet_id
        join public.lesson           src_lesson on src_lesson.id = src_sheet.lesson_id
        join public.line_item        li         on li.id = lig.line_item_id
        where tgt_sheet.student_enrollment_id = ${input.enrollmentId}::uuid
          and lig.rollover_from_grade_sheet_id is not null
          and tgt_sheet.sealed_at is null
        order by src_sheet.sealed_at desc
      `)) as unknown as Array<Record<string, unknown>>;
      return rows;
    }),
});
