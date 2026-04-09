/**
 * admin.maintenance router — MNT-01/02/03.
 *
 * List/create/update/complete maintenance items. Every write goes
 * through mechanicOrAdminProcedure + withTenantTx and calls
 * recompute_maintenance_status() at the end so auto-ground / un-ground
 * stays consistent with the SQL layer from Plan 04-02.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { maintenanceItem } from '@part61/db';
import { intervalRuleSchema } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure, mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';
import type { RequiredMechanicAuthority } from '../../helpers/signerSnapshot';
import { taskKindRequiredAuthority } from '../../helpers/maintenanceAuthority';
import type { MaintenanceItemKind } from '@part61/domain';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const kindSchema = z.enum([
  'annual_inspection',
  'hundred_hour_inspection',
  'airworthiness_directive',
  'oil_change',
  'transponder_91_413',
  'pitot_static_91_411',
  'elt_battery',
  'elt_91_207',
  'vor_check',
  'component_life',
  'manufacturer_service_bulletin',
  'custom',
]);

const createInput = z.object({
  aircraftId: z.string().uuid(),
  kind: kindSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  intervalRule: intervalRuleSchema,
  notes: z.string().optional(),
});

const updateInput = z.object({
  itemId: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  intervalRule: intervalRuleSchema.optional(),
  notes: z.string().optional(),
});

const completeInput = z.object({
  itemId: z.string().uuid(),
  completedAt: z.string().datetime().optional(),
  completedAtHours: z.record(z.string(), z.number()).optional(),
  workOrderId: z.string().uuid().optional(),
});

export const adminMaintenanceRouter = router({
  list: protectedProcedure
    .input(z.object({ aircraftId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(maintenanceItem)
        .where(
          and(
            eq(maintenanceItem.aircraftId, input.aircraftId),
            eq(maintenanceItem.schoolId, ctx.session!.schoolId),
            isNull(maintenanceItem.deletedAt),
          ),
        )
        .orderBy(desc(maintenanceItem.createdAt));
      return rows;
    }),

  get: protectedProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(maintenanceItem)
        .where(
          and(
            eq(maintenanceItem.id, input.itemId),
            eq(maintenanceItem.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Maintenance item not found' });
      }
      return row;
    }),

  create: mechanicOrAdminProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const inserted = await tx
        .insert(maintenanceItem)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          aircraftId: input.aircraftId,
          kind: input.kind,
          title: input.title,
          description: input.description ?? null,
          intervalRule: input.intervalRule,
          notes: input.notes ?? null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      await tx.execute(
        sql`select public.recompute_maintenance_status(${input.aircraftId}::uuid)`,
      );
      return inserted[0]!;
    }),

  update: mechanicOrAdminProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = { updatedBy: ctx.session!.userId, updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.intervalRule !== undefined) patch.intervalRule = input.intervalRule;
      if (input.notes !== undefined) patch.notes = input.notes;
      const rows = await tx
        .update(maintenanceItem)
        .set(patch)
        .where(
          and(
            eq(maintenanceItem.id, input.itemId),
            eq(maintenanceItem.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Maintenance item not found' });
      }
      await tx.execute(
        sql`select public.recompute_maintenance_status(${rows[0]!.aircraftId}::uuid)`,
      );
      return rows[0]!;
    }),

  complete: mechanicOrAdminProcedure
    .input(completeInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const existing = await tx
        .select()
        .from(maintenanceItem)
        .where(
          and(
            eq(maintenanceItem.id, input.itemId),
            eq(maintenanceItem.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const item = existing[0];
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Maintenance item not found' });
      }
      const required: RequiredMechanicAuthority = taskKindRequiredAuthority(
        item.kind as MaintenanceItemKind,
      );
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, required);
      const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
      await tx
        .update(maintenanceItem)
        .set({
          lastCompletedAt: completedAt,
          lastCompletedHours: input.completedAtHours ?? null,
          lastCompletedByUserId: ctx.session!.userId,
          lastWorkOrderId: input.workOrderId ?? null,
          updatedBy: ctx.session!.userId,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceItem.id, input.itemId));
      await tx.execute(
        sql`select public.recompute_maintenance_status(${item.aircraftId}::uuid)`,
      );
      return { ok: true as const, signer: snapshot };
    }),

  // admin-only: hard list across fleet
  listDueSoon: adminProcedure
    .input(z.object({ limit: z.number().int().positive().max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const limit = input?.limit ?? 100;
      const rows = await tx
        .select()
        .from(maintenanceItem)
        .where(
          and(
            eq(maintenanceItem.schoolId, ctx.session!.schoolId),
            isNull(maintenanceItem.deletedAt),
          ),
        )
        .orderBy(desc(maintenanceItem.updatedAt))
        .limit(limit);
      return rows.filter((r) => r.status === 'due_soon' || r.status === 'overdue' || r.status === 'grounding');
    }),
});
