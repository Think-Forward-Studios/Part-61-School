/**
 * admin.parts router — MNT-08.
 *
 * Inventory CRUD + lot receipt + consumption history. Consumption is
 * done inside admin.workOrders.consumePart (this router just reads
 * the ledger).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { part, partLot } from '@part61/db';
import { router } from '../../trpc';
import { mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const partKind = z.enum(['consumable', 'overhaul_item', 'life_limited', 'hardware']);
const partUnit = z.enum(['each', 'qt', 'gal', 'ft', 'oz', 'lb']);

export const adminPartsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    return await tx
      .select()
      .from(part)
      .where(and(eq(part.schoolId, ctx.session!.schoolId), isNull(part.deletedAt)));
  }),

  get: protectedProcedure
    .input(z.object({ partId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(part)
        .where(and(eq(part.id, input.partId), eq(part.schoolId, ctx.session!.schoolId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Part not found' });
      return rows[0];
    }),

  create: mechanicOrAdminProcedure
    .input(
      z.object({
        partNumber: z.string().min(1),
        description: z.string().optional(),
        manufacturer: z.string().optional(),
        kind: partKind,
        unit: partUnit,
        minReorderQty: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const inserted = await tx
        .insert(part)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          partNumber: input.partNumber,
          description: input.description ?? null,
          manufacturer: input.manufacturer ?? null,
          kind: input.kind,
          unit: input.unit,
          onHandQty: '0',
          minReorderQty: input.minReorderQty != null ? String(input.minReorderQty) : null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  update: mechanicOrAdminProcedure
    .input(
      z.object({
        partId: z.string().uuid(),
        description: z.string().optional(),
        manufacturer: z.string().optional(),
        minReorderQty: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = { updatedAt: new Date(), updatedBy: ctx.session!.userId };
      if (input.description !== undefined) patch.description = input.description;
      if (input.manufacturer !== undefined) patch.manufacturer = input.manufacturer;
      if (input.minReorderQty !== undefined) patch.minReorderQty = String(input.minReorderQty);
      const rows = await tx
        .update(part)
        .set(patch)
        .where(and(eq(part.id, input.partId), eq(part.schoolId, ctx.session!.schoolId)))
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Part not found' });
      return rows[0];
    }),

  receiveLot: mechanicOrAdminProcedure
    .input(
      z.object({
        partId: z.string().uuid(),
        lotNumber: z.string().optional(),
        serialNumber: z.string().optional(),
        receivedQty: z.number().positive(),
        expiresAt: z.string().datetime().optional(),
        supplier: z.string().optional(),
        invoiceRef: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const inserted = await tx
        .insert(partLot)
        .values({
          partId: input.partId,
          schoolId,
          lotNumber: input.lotNumber ?? null,
          serialNumber: input.serialNumber ?? null,
          receivedBy: ctx.session!.userId,
          receivedQty: String(input.receivedQty),
          qtyRemaining: String(input.receivedQty),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          supplier: input.supplier ?? null,
          invoiceRef: input.invoiceRef ?? null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      // Keep part.on_hand_qty in sync (no trigger assumed).
      await tx.execute(sql`
        update public.part
           set on_hand_qty = coalesce(on_hand_qty, 0) + ${input.receivedQty},
               updated_at = now()
         where id = ${input.partId}::uuid and school_id = ${schoolId}::uuid
      `);
      return inserted[0]!;
    }),

  listLots: protectedProcedure
    .input(z.object({ partId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return await tx
        .select()
        .from(partLot)
        .where(
          and(
            eq(partLot.partId, input.partId),
            eq(partLot.schoolId, ctx.session!.schoolId),
            isNull(partLot.deletedAt),
          ),
        )
        .orderBy(desc(partLot.receivedAt));
    }),

  consumptionHistory: protectedProcedure
    .input(z.object({ partId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select wopc.*
          from public.work_order_part_consumption wopc
         where wopc.part_id = ${input.partId}::uuid
           and exists (
             select 1 from public.work_order wo
              where wo.id = wopc.work_order_id
                and wo.school_id = ${ctx.session!.schoolId}::uuid
           )
         order by wopc.consumed_at desc
      `)) as unknown as Array<Record<string, unknown>>;
      return rows;
    }),
});
