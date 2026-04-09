/**
 * admin.components router — MNT-06.
 *
 * Install / overhaul / remove serial-tracked aircraft components. The
 * bridge trigger from Plan 04-02 auto-creates the companion
 * maintenance_item when a component with a life limit is installed.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { aircraftComponent, aircraftComponentOverhaul } from '@part61/db';
import { router } from '../../trpc';
import { mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const componentKind = z.enum([
  'magneto',
  'prop',
  'vacuum_pump',
  'alternator',
  'elt',
  'elt_battery',
  'starter',
  'mag_points',
  'spark_plug',
  'custom',
]);

export const adminComponentsRouter = router({
  list: protectedProcedure
    .input(z.object({ aircraftId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return await tx
        .select()
        .from(aircraftComponent)
        .where(
          and(
            eq(aircraftComponent.aircraftId, input.aircraftId),
            eq(aircraftComponent.schoolId, ctx.session!.schoolId),
            isNull(aircraftComponent.deletedAt),
          ),
        );
    }),

  install: mechanicOrAdminProcedure
    .input(
      z.object({
        aircraftId: z.string().uuid(),
        engineId: z.string().uuid().optional(),
        kind: componentKind,
        serialNumber: z.string().optional(),
        partNumber: z.string().optional(),
        manufacturer: z.string().optional(),
        lifeLimitHours: z.number().positive().optional(),
        lifeLimitMonths: z.number().int().positive().optional(),
        overhaulIntervalHours: z.number().positive().optional(),
        installedAtHours: z.record(z.string(), z.number()).optional(),
        installedAtDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const inserted = await tx
        .insert(aircraftComponent)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          aircraftId: input.aircraftId,
          engineId: input.engineId ?? null,
          kind: input.kind,
          serialNumber: input.serialNumber ?? null,
          partNumber: input.partNumber ?? null,
          manufacturer: input.manufacturer ?? null,
          lifeLimitHours: input.lifeLimitHours != null ? String(input.lifeLimitHours) : null,
          lifeLimitMonths: input.lifeLimitMonths ?? null,
          overhaulIntervalHours:
            input.overhaulIntervalHours != null ? String(input.overhaulIntervalHours) : null,
          installedAtHours: input.installedAtHours ?? null,
          installedAtDate: input.installedAtDate ?? null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  overhaul: mechanicOrAdminProcedure
    .input(
      z.object({
        componentId: z.string().uuid(),
        overhauledAtHours: z.record(z.string(), z.number()).optional(),
        workOrderId: z.string().uuid().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const compRows = await tx
        .select()
        .from(aircraftComponent)
        .where(
          and(
            eq(aircraftComponent.id, input.componentId),
            eq(aircraftComponent.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const comp = compRows[0];
      if (!comp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Component not found' });

      await tx.insert(aircraftComponentOverhaul).values({
        componentId: comp.id,
        schoolId: comp.schoolId,
        overhauledAtHours: input.overhauledAtHours ?? null,
        workOrderId: input.workOrderId ?? null,
        signerSnapshot: snapshot,
        notes: input.notes ?? null,
      });
      await tx
        .update(aircraftComponent)
        .set({
          lastOverhaulAtHours: input.overhauledAtHours ?? null,
          updatedAt: new Date(),
          updatedBy: ctx.session!.userId,
        })
        .where(eq(aircraftComponent.id, comp.id));
      return { ok: true as const, signer: snapshot };
    }),

  remove: mechanicOrAdminProcedure
    .input(z.object({ componentId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(aircraftComponent)
        .set({
          removedAt: new Date(),
          removedReason: input.reason,
          updatedAt: new Date(),
          updatedBy: ctx.session!.userId,
        })
        .where(
          and(
            eq(aircraftComponent.id, input.componentId),
            eq(aircraftComponent.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Component not found' });
      return rows[0];
    }),
});
