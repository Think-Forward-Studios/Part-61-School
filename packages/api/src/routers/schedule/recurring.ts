/**
 * schedule.recurring sub-router (SCH-06).
 *
 * Recurring series CREATION is handled inline inside
 * schedule.reservations.request (the single-transaction expansion that
 * rolls back the whole series on any child conflict). This sub-router
 * provides the series editScope operations: 'occurrence' | 'following'
 * | 'series'.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { reservation } from '@part61/db';
import { router } from '../../trpc';
import { instructorOrAdminProcedure } from '../../procedures';

type Tx = {
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  delete: (typeof import('@part61/db').db)['delete'];
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const uuid = z.string().regex(/^[0-9a-fA-F-]{36}$/);

export const scheduleRecurringRouter = router({
  cancelScope: instructorOrAdminProcedure
    .input(
      z.object({
        seriesId: uuid,
        fromReservationId: uuid.optional(),
        scope: z.enum(['occurrence', 'following', 'series']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      if (input.scope === 'occurrence') {
        if (!input.fromReservationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'fromReservationId required for occurrence scope',
          });
        }
        await tx
          .update(reservation)
          .set({ status: 'cancelled', closeOutReason: 'cancelled_free' })
          .where(
            and(
              eq(reservation.id, input.fromReservationId),
              eq(reservation.schoolId, schoolId),
            ),
          );
        return { ok: true, count: 1 };
      }
      if (input.scope === 'series') {
        const rows = await tx
          .update(reservation)
          .set({ status: 'cancelled', closeOutReason: 'cancelled_free' })
          .where(
            and(
              eq(reservation.seriesId, input.seriesId),
              eq(reservation.schoolId, schoolId),
            ),
          )
          .returning({ id: reservation.id });
        return { ok: true, count: rows.length };
      }
      // 'following'
      if (!input.fromReservationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'fromReservationId required for following scope',
        });
      }
      const anchor = await tx
        .select()
        .from(reservation)
        .where(eq(reservation.id, input.fromReservationId))
        .limit(1);
      if (!anchor[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Anchor not found' });
      }
      // Walk the series and cancel rows whose lower bound >= anchor's lower bound.
      const anchorLowerMatch = anchor[0].timeRange.match(/^\[([^,]+),/);
      const anchorLower = anchorLowerMatch?.[1];
      if (!anchorLower) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Cannot parse anchor time range',
        });
      }
      const rows = (await tx.execute(sql`
        update public.reservation
           set status = 'cancelled',
               close_out_reason = 'cancelled_free'
         where series_id = ${input.seriesId}::uuid
           and school_id = ${schoolId}::uuid
           and lower(time_range) >= ${anchorLower}::timestamptz
         returning id
      `)) as unknown as Array<{ id: string }>;
      return { ok: true, count: rows.length };
    }),
});

// Silence unused-import warning.
void gte;
