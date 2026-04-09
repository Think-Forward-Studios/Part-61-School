/**
 * admin.overruns router — §91.409(b) ten-hour overrun (MNT-03, FLT-04).
 *
 * IA-only. Validates the source item is a 100-hour inspection in TS
 * (defense one); the DB trigger from plan 04-02 enforces the same at
 * the DB layer (defense two, PITFALL 5).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  maintenanceItem,
  maintenanceOverrun,
} from '@part61/db';
import { router } from '../../trpc';
import { mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminOverrunsRouter = router({
  active: protectedProcedure
    .input(z.object({ aircraftId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return await tx
        .select()
        .from(maintenanceOverrun)
        .where(
          and(
            eq(maintenanceOverrun.aircraftId, input.aircraftId),
            eq(maintenanceOverrun.schoolId, ctx.session!.schoolId),
            isNull(maintenanceOverrun.revokedAt),
            isNull(maintenanceOverrun.deletedAt),
          ),
        );
    }),

  grant: mechanicOrAdminProcedure
    .input(
      z.object({
        itemId: z.string().uuid(),
        justification: z.string().min(20),
        maxAdditionalHours: z.number().int().min(1).max(10),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // IA required
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, 'ia');
      const itemRows = await tx
        .select()
        .from(maintenanceItem)
        .where(
          and(
            eq(maintenanceItem.id, input.itemId),
            eq(maintenanceItem.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const item = itemRows[0];
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Maintenance item not found' });
      if (item.kind !== 'hundred_hour_inspection') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '§91.409(b) overrun only applies to 100-hour inspections',
        });
      }
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      try {
        const inserted = await tx
          .insert(maintenanceOverrun)
          .values({
            schoolId: item.schoolId,
            baseId: item.baseId,
            aircraftId: item.aircraftId,
            itemId: item.id,
            authorityCfrCite: '§91.409(b)',
            justification: input.justification,
            maxAdditionalHours: input.maxAdditionalHours,
            grantedByUserId: ctx.session!.userId,
            signerSnapshot: snapshot,
            expiresAt,
            createdBy: ctx.session!.userId,
            updatedBy: ctx.session!.userId,
          })
          .returning();
        await tx.execute(
          sql`select public.recompute_maintenance_status(${item.aircraftId}::uuid)`,
        );
        return inserted[0]!;
      } catch (err) {
        // Partial unique index prevents duplicate active overrun.
        const msg = (err as Error).message ?? '';
        if (msg.includes('unique') || msg.includes('duplicate')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An active overrun already exists for this item',
          });
        }
        throw err;
      }
    }),

  revoke: mechanicOrAdminProcedure
    .input(z.object({ overrunId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(maintenanceOverrun)
        .set({
          revokedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ctx.session!.userId,
        })
        .where(
          and(
            eq(maintenanceOverrun.id, input.overrunId),
            eq(maintenanceOverrun.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Overrun not found' });
      await tx.execute(
        sql`select public.recompute_maintenance_status(${rows[0]!.aircraftId}::uuid)`,
      );
      return rows[0]!;
    }),
});
