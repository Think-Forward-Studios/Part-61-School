/**
 * people/experience sub-router (PER-10).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { instructorExperience } from '@part61/db';
import { experienceCreateInput, experienceUpdateInput } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

function numOrNull(v: number | null | undefined): string | null {
  return v == null ? null : v.toFixed(1);
}

export const experienceRouter = router({
  list: adminProcedure
    .input(z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return tx
        .select()
        .from(instructorExperience)
        .where(
          and(
            eq(instructorExperience.userId, input.userId),
            eq(instructorExperience.schoolId, ctx.session!.schoolId),
          ),
        )
        .orderBy(desc(instructorExperience.asOfDate));
    }),

  create: adminProcedure
    .input(experienceCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(instructorExperience)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.userId,
          totalTime: numOrNull(input.totalTime ?? null),
          picTime: numOrNull(input.picTime ?? null),
          instructorTime: numOrNull(input.instructorTime ?? null),
          multiEngineTime: numOrNull(input.multiEngineTime ?? null),
          instrumentTime: numOrNull(input.instrumentTime ?? null),
          asOfDate: input.asOfDate,
          source: input.source,
          notes: input.notes ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(experienceUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(instructorExperience)
        .set({
          totalTime: numOrNull(input.totalTime ?? null),
          picTime: numOrNull(input.picTime ?? null),
          instructorTime: numOrNull(input.instructorTime ?? null),
          multiEngineTime: numOrNull(input.multiEngineTime ?? null),
          instrumentTime: numOrNull(input.instrumentTime ?? null),
          asOfDate: input.asOfDate,
          source: input.source,
          notes: input.notes ?? null,
        })
        .where(
          and(
            eq(instructorExperience.id, input.experienceId),
            eq(instructorExperience.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Experience row not found',
        });
      }
      return rows[0]!;
    }),
});
