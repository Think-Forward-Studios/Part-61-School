/**
 * admin.stageChecks router — Phase 5-03 (SYL-05).
 *
 * Stage check lifecycle:
 *   - list({ studentEnrollmentId? })
 *   - schedule({ studentEnrollmentId, stageId, checkerUserId, scheduledAt })
 *       Server-side guard: checker_user_id MUST NOT equal the enrollment's
 *       primary_instructor_id. The DB trigger from 05-01 is the backstop.
 *   - record({ stageCheckId, status: 'passed'|'failed', remarks })
 *       Seals the row with an instructor signer snapshot.
 *
 * Gated by adminOrChiefInstructorProcedure. All DB calls through withTenantTx.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { stageCheck, studentCourseEnrollment } from '@part61/db';
import { router } from '../../trpc';
import { adminOrChiefInstructorProcedure } from '../../procedures';
import { buildInstructorSignerSnapshot } from '../../helpers/buildInstructorSignerSnapshot';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof import('drizzle-orm').sql>) => Promise<unknown>;
};

export const adminStageChecksRouter = router({
  list: adminOrChiefInstructorProcedure
    .input(
      z
        .object({
          studentEnrollmentId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const where = input?.studentEnrollmentId
        ? and(
            eq(stageCheck.schoolId, schoolId),
            eq(stageCheck.studentEnrollmentId, input.studentEnrollmentId),
            isNull(stageCheck.deletedAt),
          )
        : and(eq(stageCheck.schoolId, schoolId), isNull(stageCheck.deletedAt));
      const rows = await tx
        .select()
        .from(stageCheck)
        .where(where)
        .orderBy(desc(stageCheck.createdAt));
      return rows;
    }),

  schedule: adminOrChiefInstructorProcedure
    .input(
      z.object({
        studentEnrollmentId: z.string().uuid(),
        stageId: z.string().uuid(),
        checkerUserId: z.string().uuid(),
        scheduledAt: z.date(),
        // Phase 8 (IPF-03): mark this stage check as an FAA checkride
        // for pass-rate computation in 08-03. Defaults to false.
        isFaaCheckride: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Load enrollment for different-instructor guard
      const enrRows = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(eq(studentCourseEnrollment.id, input.studentEnrollmentId))
        .limit(1);
      const enr = enrRows[0];
      if (!enr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Enrollment not found',
        });
      }
      if (enr.primaryInstructorId && enr.primaryInstructorId === input.checkerUserId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Stage check must be conducted by an instructor other than the student primary instructor',
        });
      }
      const [row] = await tx
        .insert(stageCheck)
        .values({
          schoolId: ctx.session!.schoolId,
          studentEnrollmentId: input.studentEnrollmentId,
          stageId: input.stageId,
          checkerUserId: input.checkerUserId,
          scheduledAt: input.scheduledAt,
          status: 'scheduled',
          isFaaCheckride: input.isFaaCheckride ?? false,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  record: adminOrChiefInstructorProcedure
    .input(
      z.object({
        stageCheckId: z.string().uuid(),
        status: z.enum(['passed', 'failed']),
        remarks: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const existingRows = await tx
        .select()
        .from(stageCheck)
        .where(eq(stageCheck.id, input.stageCheckId))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Stage check not found' });
      }
      if (existing.sealedAt) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Stage check is already sealed',
        });
      }
      const snapshot = await buildInstructorSignerSnapshot(
        tx,
        ctx.session!.userId,
        ctx.session!.activeRole,
      );
      const now = new Date();
      const [row] = await tx
        .update(stageCheck)
        .set({
          status: input.status,
          remarks: input.remarks,
          conductedAt: now,
          signerSnapshot: snapshot as unknown as Record<string, unknown>,
          sealedAt: now,
          updatedBy: ctx.session!.userId,
          updatedAt: now,
        })
        .where(eq(stageCheck.id, input.stageCheckId))
        .returning();
      return row;
    }),
});
