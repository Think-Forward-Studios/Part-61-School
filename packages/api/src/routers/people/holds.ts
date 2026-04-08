/**
 * people/holds sub-router (PER-05, PER-06).
 *
 * Holds are never deleted — clearing sets cleared_at, cleared_by,
 * cleared_reason.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { personHold } from '@part61/db';
import { holdCreateInput, holdClearInput } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const holdsRouter = router({
  list: adminProcedure
    .input(z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(personHold)
        .where(
          and(
            eq(personHold.userId, input.userId),
            eq(personHold.schoolId, ctx.session!.schoolId),
          ),
        )
        .orderBy(desc(personHold.createdAt));
      return rows;
    }),

  create: adminProcedure
    .input(holdCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(personHold)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.userId,
          kind: input.kind,
          reason: input.reason,
          createdBy: ctx.session!.userId,
        })
        .returning();
      return rows[0]!;
    }),

  clear: adminProcedure
    .input(holdClearInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(personHold)
        .set({
          clearedAt: new Date(),
          clearedBy: ctx.session!.userId,
          clearedReason: input.clearedReason,
        })
        .where(
          and(
            eq(personHold.id, input.holdId),
            eq(personHold.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hold not found' });
      }
      return rows[0]!;
    }),
});
