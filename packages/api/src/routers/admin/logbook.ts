/**
 * admin.logbook router — MNT-10.
 *
 * Once sealed=true, a logbook entry cannot be UPDATEd — enforced by a
 * DB trigger from plan 04-01. Corrections are NEW entries with
 * corrects_entry_id pointing back to the original.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { logbookEntry } from '@part61/db';
import { router } from '../../trpc';
import { mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const bookKind = z.enum(['airframe', 'engine', 'prop']);

export const adminLogbookRouter = router({
  list: protectedProcedure
    .input(z.object({ aircraftId: z.string().uuid(), bookKind: bookKind.optional() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const bookFilter = input.bookKind
        ? and(eq(logbookEntry.bookKind, input.bookKind))
        : undefined;
      const rows = await tx
        .select()
        .from(logbookEntry)
        .where(
          and(
            eq(logbookEntry.aircraftId, input.aircraftId),
            eq(logbookEntry.schoolId, ctx.session!.schoolId),
            bookFilter,
          ),
        )
        .orderBy(desc(logbookEntry.entryDate), desc(logbookEntry.createdAt));
      return rows;
    }),

  createDraft: mechanicOrAdminProcedure
    .input(
      z.object({
        aircraftId: z.string().uuid(),
        bookKind,
        entryDate: z.string(),
        description: z.string().min(1),
        hobbs: z.number().optional(),
        tach: z.number().optional(),
        airframeTime: z.number().optional(),
        engineTime: z.number().optional(),
        engineId: z.string().uuid().optional(),
        workOrderId: z.string().uuid().optional(),
        maintenanceItemId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const inserted = await tx
        .insert(logbookEntry)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          aircraftId: input.aircraftId,
          engineId: input.engineId ?? null,
          bookKind: input.bookKind,
          entryDate: input.entryDate,
          hobbs: input.hobbs != null ? String(input.hobbs) : null,
          tach: input.tach != null ? String(input.tach) : null,
          airframeTime: input.airframeTime != null ? String(input.airframeTime) : null,
          engineTime: input.engineTime != null ? String(input.engineTime) : null,
          description: input.description,
          workOrderId: input.workOrderId ?? null,
          maintenanceItemId: input.maintenanceItemId ?? null,
          sealed: false,
          createdByUserId: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  seal: mechanicOrAdminProcedure
    .input(z.object({ entryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const rows = await tx
        .update(logbookEntry)
        .set({
          sealed: true,
          signerSnapshot: snapshot,
          signedAt: new Date(),
        })
        .where(
          and(
            eq(logbookEntry.id, input.entryId),
            eq(logbookEntry.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });
      return rows[0];
    }),

  correct: mechanicOrAdminProcedure
    .input(
      z.object({
        originalEntryId: z.string().uuid(),
        description: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const originalRows = await tx
        .select()
        .from(logbookEntry)
        .where(
          and(
            eq(logbookEntry.id, input.originalEntryId),
            eq(logbookEntry.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const original = originalRows[0];
      if (!original) throw new TRPCError({ code: 'NOT_FOUND', message: 'Original entry not found' });
      const inserted = await tx
        .insert(logbookEntry)
        .values({
          schoolId: original.schoolId,
          baseId: original.baseId,
          aircraftId: original.aircraftId,
          engineId: original.engineId,
          bookKind: original.bookKind,
          entryDate: new Date().toISOString().slice(0, 10),
          description: input.description,
          correctsEntryId: original.id,
          sealed: false,
          createdByUserId: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),
});
