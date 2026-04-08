/**
 * admin/squawks router (FLT-04).
 *
 * list — all open squawks for the school
 * resolve — mechanic or admin marks a squawk resolved. When the last
 *   open grounding squawk is cleared, the aircraft.grounded_at is NOT
 *   automatically unset (that is an explicit admin decision in Phase 4
 *   CAMP). Phase 3 keeps the behavior minimal.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { aircraftSquawk } from '@part61/db';
import { resolveSquawkInput } from '@part61/domain';
import { router } from '../../trpc';
import { protectedProcedure } from '../../procedures';
import { requireRole } from '../../middleware/role';

type Tx = {
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const mechanicOrAdminProcedure = protectedProcedure.use(
  requireRole('mechanic', 'admin'),
);

export const adminSquawksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(aircraftSquawk)
      .where(
        and(
          eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          isNull(aircraftSquawk.resolvedAt),
        ),
      );
    return rows;
  }),

  resolve: mechanicOrAdminProcedure
    .input(resolveSquawkInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(aircraftSquawk)
        .set({
          resolvedAt: new Date(),
          resolvedBy: ctx.session!.userId,
          resolutionNotes: input.resolutionNotes ?? null,
        })
        .where(
          and(
            eq(aircraftSquawk.id, input.squawkId),
            eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
      }
      return rows[0]!;
    }),
});
