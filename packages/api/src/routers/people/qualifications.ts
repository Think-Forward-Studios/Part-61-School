/**
 * people/qualifications sub-router (IPF-02).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { instructorQualification } from '@part61/db';
import {
  qualificationCreateInput,
  qualificationUpdateInput,
  qualificationRevokeInput,
} from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const qualificationsRouter = router({
  list: adminProcedure
    .input(z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return tx
        .select()
        .from(instructorQualification)
        .where(
          and(
            eq(instructorQualification.userId, input.userId),
            eq(instructorQualification.schoolId, ctx.session!.schoolId),
            isNull(instructorQualification.revokedAt),
          ),
        );
    }),

  create: adminProcedure
    .input(qualificationCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      if (!ctx.session!.activeBaseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active base — qualifications are base-scoped',
        });
      }
      const rows = await tx
        .insert(instructorQualification)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId,
          userId: input.userId,
          kind: input.kind,
          descriptor: input.descriptor,
          grantedBy: ctx.session!.userId,
          notes: input.notes ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(qualificationUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(instructorQualification)
        .set({
          kind: input.kind,
          descriptor: input.descriptor,
          notes: input.notes ?? null,
        })
        .where(
          and(
            eq(instructorQualification.id, input.qualificationId),
            eq(instructorQualification.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Qualification not found',
        });
      }
      return rows[0]!;
    }),

  revoke: adminProcedure
    .input(qualificationRevokeInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(instructorQualification)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(instructorQualification.id, input.qualificationId),
            eq(instructorQualification.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning({ id: instructorQualification.id });
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Qualification not found',
        });
      }
      return { ok: true };
    }),
});
