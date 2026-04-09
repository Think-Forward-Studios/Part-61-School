/**
 * admin.workOrders router — MNT-09.
 *
 * Full CRUD + task management + parts consumption (with FOR UPDATE
 * locking on the lot/part row to serialize concurrent decrements) +
 * the sign-off CEREMONY. Sign-off:
 *
 *   1. Verifies every task has completed_at set.
 *   2. Determines the highest required_authority across tasks and
 *      builds a signer snapshot for the caller at that level.
 *   3. Writes one sealed logbook_entry per book in booksTouchedByTaskKinds.
 *   4. Updates the source maintenance_item (last_completed_*) or
 *      squawk (returned_to_service + signer_snapshot).
 *   5. Calls recompute_maintenance_status which may clear grounded_at.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  workOrder,
  workOrderTask,
  workOrderPartConsumption,
  logbookEntry,
  maintenanceItem,
  aircraftSquawk,
} from '@part61/db';
import type { LogbookBook, MaintenanceItemKind, MechanicAuthorityKind } from '@part61/domain';
import { router } from '../../trpc';
import { mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';
import type { RequiredMechanicAuthority } from '../../helpers/signerSnapshot';
import { highestAuthority, taskKindRequiredAuthority } from '../../helpers/maintenanceAuthority';
import { booksTouchedByTaskKinds } from '../../helpers/workOrderBooks';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const workOrderKind = z.enum([
  'annual',
  '100_hour',
  'ad_compliance',
  'squawk_repair',
  'component_replacement',
  'oil_change',
  'custom',
]);

const maintenanceKind = z.enum([
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

const mechAuthority = z.enum(['none', 'a_and_p', 'ia']);

export const adminWorkOrdersRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          aircraftId: z.string().uuid().optional(),
          limit: z.number().int().positive().max(200).default(50),
          cursor: z
            .object({ createdAt: z.string(), id: z.string().uuid() })
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const limit = input?.limit ?? 50;
      const aircraftFilter = input?.aircraftId
        ? sql`and wo.aircraft_id = ${input.aircraftId}::uuid`
        : sql``;
      const cursorFilter = input?.cursor
        ? sql`and (wo.created_at, wo.id) < (${input.cursor.createdAt}::timestamptz, ${input.cursor.id}::uuid)`
        : sql``;
      const rows = (await tx.execute(sql`
        select wo.*
          from public.work_order wo
         where wo.school_id = ${ctx.session!.schoolId}::uuid
           and wo.deleted_at is null
           ${aircraftFilter}
           ${cursorFilter}
         order by wo.created_at desc, wo.id desc
         limit ${limit}
      `)) as unknown as Array<Record<string, unknown>>;
      return rows;
    }),

  get: protectedProcedure
    .input(z.object({ workOrderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(workOrder)
        .where(
          and(
            eq(workOrder.id, input.workOrderId),
            eq(workOrder.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Work order not found' });
      const tasks = await tx
        .select()
        .from(workOrderTask)
        .where(
          and(
            eq(workOrderTask.workOrderId, input.workOrderId),
            isNull(workOrderTask.deletedAt),
          ),
        );
      return { ...rows[0], tasks };
    }),

  create: mechanicOrAdminProcedure
    .input(
      z.object({
        aircraftId: z.string().uuid(),
        kind: workOrderKind,
        title: z.string().min(1),
        description: z.string().optional(),
        sourceSquawkId: z.string().uuid().optional(),
        sourceMaintenanceItemId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const inserted = await tx
        .insert(workOrder)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          aircraftId: input.aircraftId,
          status: 'open',
          kind: input.kind,
          title: input.title,
          description: input.description ?? null,
          sourceSquawkId: input.sourceSquawkId ?? null,
          sourceMaintenanceItemId: input.sourceMaintenanceItemId ?? null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  addTask: mechanicOrAdminProcedure
    .input(
      z.object({
        workOrderId: z.string().uuid(),
        description: z.string().min(1),
        position: z.number().int().nonnegative().default(0),
        // Required authority is derived from the maintenance kind if
        // provided; otherwise accept an explicit override.
        kind: maintenanceKind.optional(),
        requiredAuthority: mechAuthority.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const derived: RequiredMechanicAuthority = input.kind
        ? taskKindRequiredAuthority(input.kind as MaintenanceItemKind)
        : (input.requiredAuthority as RequiredMechanicAuthority | undefined) ?? 'a_and_p';
      const inserted = await tx
        .insert(workOrderTask)
        .values({
          workOrderId: input.workOrderId,
          description: input.description,
          position: input.position,
          requiredAuthority: derived as MechanicAuthorityKind,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  completeTask: mechanicOrAdminProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const taskRows = await tx
        .select()
        .from(workOrderTask)
        .where(eq(workOrderTask.id, input.taskId))
        .limit(1);
      const task = taskRows[0];
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      const required = (task.requiredAuthority as RequiredMechanicAuthority) ?? 'a_and_p';
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, required);
      const updated = await tx
        .update(workOrderTask)
        .set({
          completedAt: new Date(),
          completedByUserId: ctx.session!.userId,
          completionSignerSnapshot: snapshot,
          notes: input.notes ?? task.notes,
          updatedAt: new Date(),
          updatedBy: ctx.session!.userId,
        })
        .where(eq(workOrderTask.id, input.taskId))
        .returning();
      return updated[0]!;
    }),

  /**
   * Atomic parts consumption. Locks the lot row (or part row for
   * non-lot parts) with SELECT ... FOR UPDATE so concurrent
   * decrements serialize. Rejects on insufficient quantity.
   */
  consumePart: mechanicOrAdminProcedure
    .input(
      z.object({
        workOrderId: z.string().uuid(),
        partId: z.string().uuid(),
        partLotId: z.string().uuid().optional(),
        quantity: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      if (input.partLotId) {
        const locked = (await tx.execute(sql`
          select id, qty_remaining::numeric as qty_remaining
            from public.part_lot
           where id = ${input.partLotId}::uuid
             and part_id = ${input.partId}::uuid
             and school_id = ${ctx.session!.schoolId}::uuid
             and deleted_at is null
           for update
        `)) as unknown as Array<{ id: string; qty_remaining: string }>;
        const lot = locked[0];
        if (!lot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Part lot not found' });
        const remaining = Number(lot.qty_remaining);
        if (remaining < input.quantity) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient lot qty' });
        }
        await tx.execute(sql`
          update public.part_lot
             set qty_remaining = qty_remaining::numeric - ${input.quantity},
                 updated_at = now()
           where id = ${input.partLotId}::uuid
        `);
        await tx.execute(sql`
          update public.part
             set on_hand_qty = on_hand_qty::numeric - ${input.quantity},
                 updated_at = now()
           where id = ${input.partId}::uuid
             and school_id = ${ctx.session!.schoolId}::uuid
        `);
      } else {
        const locked = (await tx.execute(sql`
          select id, on_hand_qty::numeric as on_hand_qty
            from public.part
           where id = ${input.partId}::uuid
             and school_id = ${ctx.session!.schoolId}::uuid
             and deleted_at is null
           for update
        `)) as unknown as Array<{ id: string; on_hand_qty: string }>;
        const p = locked[0];
        if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'Part not found' });
        if (Number(p.on_hand_qty) < input.quantity) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient part qty' });
        }
        await tx.execute(sql`
          update public.part
             set on_hand_qty = on_hand_qty::numeric - ${input.quantity},
                 updated_at = now()
           where id = ${input.partId}::uuid
        `);
      }
      const inserted = await tx
        .insert(workOrderPartConsumption)
        .values({
          workOrderId: input.workOrderId,
          partId: input.partId,
          partLotId: input.partLotId ?? null,
          quantity: String(input.quantity),
          consumedBy: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  /**
   * Sign-off ceremony (MNT-09).
   */
  signOff: mechanicOrAdminProcedure
    .input(
      z.object({
        workOrderId: z.string().uuid(),
        returnToServiceTime: z.record(z.string(), z.number()).optional(),
        description: z.string().min(1),
        entryDate: z.string().optional(),
        taskKinds: z.array(maintenanceKind).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const woRows = await tx
        .select()
        .from(workOrder)
        .where(
          and(
            eq(workOrder.id, input.workOrderId),
            eq(workOrder.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const wo = woRows[0];
      if (!wo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Work order not found' });
      if (wo.status === 'closed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Work order already closed' });
      }

      const tasks = await tx
        .select()
        .from(workOrderTask)
        .where(
          and(eq(workOrderTask.workOrderId, wo.id), isNull(workOrderTask.deletedAt)),
        );
      if (tasks.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Work order has no tasks' });
      }
      for (const t of tasks) {
        if (!t.completedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'All tasks must be completed before sign-off',
          });
        }
      }

      const required = highestAuthority(
        tasks.map((t) => (t.requiredAuthority as RequiredMechanicAuthority) ?? 'a_and_p'),
      );
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, required);

      const kinds: MaintenanceItemKind[] =
        input.taskKinds.length > 0
          ? (input.taskKinds as MaintenanceItemKind[])
          : wo.kind === 'annual'
            ? ['annual_inspection']
            : wo.kind === '100_hour'
              ? ['hundred_hour_inspection']
              : wo.kind === 'oil_change'
                ? ['oil_change']
                : wo.kind === 'squawk_repair'
                  ? ['custom']
                  : ['custom'];
      const books: Set<LogbookBook> = booksTouchedByTaskKinds(kinds);
      if (books.size === 0) books.add('airframe');

      const entryDate = input.entryDate ?? new Date().toISOString().slice(0, 10);
      const signedAt = new Date();

      const entries: Array<{ id: string; book: LogbookBook }> = [];
      for (const book of books) {
        const inserted = await tx
          .insert(logbookEntry)
          .values({
            schoolId: wo.schoolId,
            baseId: wo.baseId,
            aircraftId: wo.aircraftId,
            bookKind: book,
            entryDate,
            description: input.description,
            workOrderId: wo.id,
            maintenanceItemId: wo.sourceMaintenanceItemId ?? null,
            signerSnapshot: snapshot,
            signedAt,
            sealed: true,
            createdByUserId: ctx.session!.userId,
          })
          .returning({ id: logbookEntry.id });
        entries.push({ id: inserted[0]!.id, book });
      }

      // Update source maintenance_item if any.
      if (wo.sourceMaintenanceItemId) {
        await tx
          .update(maintenanceItem)
          .set({
            lastCompletedAt: signedAt,
            lastCompletedHours: input.returnToServiceTime ?? null,
            lastCompletedByUserId: ctx.session!.userId,
            lastWorkOrderId: wo.id,
            updatedAt: new Date(),
            updatedBy: ctx.session!.userId,
          })
          .where(eq(maintenanceItem.id, wo.sourceMaintenanceItemId));
      }

      // Update source squawk if any.
      if (wo.sourceSquawkId) {
        await tx
          .update(aircraftSquawk)
          .set({
            status: 'returned_to_service',
            returnedToServiceAt: signedAt,
            returnedToServiceSignerSnapshot: snapshot,
            resolvedAt: signedAt,
            resolvedBy: ctx.session!.userId,
          })
          .where(eq(aircraftSquawk.id, wo.sourceSquawkId));
      }

      // Close the work order.
      await tx
        .update(workOrder)
        .set({
          status: 'closed',
          completedAt: signedAt,
          signedOffAt: signedAt,
          signedOffBy: ctx.session!.userId,
          signerSnapshot: snapshot,
          returnToServiceTime: input.returnToServiceTime ?? null,
          updatedAt: new Date(),
          updatedBy: ctx.session!.userId,
        })
        .where(eq(workOrder.id, wo.id));

      // Recompute may clear grounded_at.
      await tx.execute(sql`select public.recompute_maintenance_status(${wo.aircraftId}::uuid)`);

      return { ok: true as const, signer: snapshot, logbookEntries: entries };
    }),
});
