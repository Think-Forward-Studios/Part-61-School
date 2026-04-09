/**
 * admin.enrollments router — Phase 5-03.
 *
 * Student course enrollment lifecycle: create, migrate to a new course
 * version (with audit reason), mark complete, withdraw. Gated by
 * adminOrChiefInstructorProcedure.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { studentCourseEnrollment, courseVersion } from '@part61/db';
import { router } from '../../trpc';
import { adminOrChiefInstructorProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
};

export const adminEnrollmentsRouter = router({
  list: adminOrChiefInstructorProcedure
    .input(z.object({ studentUserId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const where = input?.studentUserId
        ? and(
            eq(studentCourseEnrollment.schoolId, schoolId),
            eq(studentCourseEnrollment.userId, input.studentUserId),
            isNull(studentCourseEnrollment.deletedAt),
          )
        : and(
            eq(studentCourseEnrollment.schoolId, schoolId),
            isNull(studentCourseEnrollment.deletedAt),
          );
      const rows = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(where)
        .orderBy(desc(studentCourseEnrollment.enrolledAt));
      return rows;
    }),

  get: adminOrChiefInstructorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(
          and(
            eq(studentCourseEnrollment.id, input.id),
            isNull(studentCourseEnrollment.deletedAt),
          ),
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
        studentUserId: z.string().uuid(),
        courseVersionId: z.string().uuid(),
        primaryInstructorId: z.string().uuid().optional(),
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
        enrollmentId: z.string().uuid(),
        newCourseVersionId: z.string().uuid(),
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
    .input(z.object({ enrollmentId: z.string().uuid() }))
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
        enrollmentId: z.string().uuid(),
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
});
