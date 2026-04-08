/**
 * admin/dashboard router (ADM-07).
 *
 * fleetStatus reads from the aircraft_current_totals view (security_invoker
 * = true) joined with aircraft. RLS on aircraft handles the school/base
 * filtering automatically — the query just does the join.
 *
 * Phase 2 derives `status` purely from aircraft.deleted_at; Phase 4 CAMP
 * will layer in airworthiness / open squawks.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { aircraft, aircraftCurrentTotals } from '@part61/db';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  select: typeof import('@part61/db').db.select;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminDashboardRouter = router({
  fleetStatus: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select({
        aircraftId: aircraftCurrentTotals.aircraftId,
        currentHobbs: aircraftCurrentTotals.currentHobbs,
        currentTach: aircraftCurrentTotals.currentTach,
        currentAirframe: aircraftCurrentTotals.currentAirframe,
        lastFlownAt: aircraftCurrentTotals.lastFlownAt,
        tail: aircraft.tailNumber,
        make: aircraft.make,
        model: aircraft.model,
        baseId: aircraft.baseId,
        deletedAt: aircraft.deletedAt,
      })
      .from(aircraftCurrentTotals)
      .innerJoin(
        aircraft,
        and(
          eq(aircraft.id, aircraftCurrentTotals.aircraftId),
          eq(aircraft.schoolId, ctx.session!.schoolId),
        ),
      )
      .where(isNull(aircraft.deletedAt));
    return rows.map((r) => ({
      ...r,
      status: r.deletedAt ? 'retired' : 'available',
    }));
  }),
});
