/**
 * admin/aircraft router (FLT-01, FLT-05, FLT-06, ADM-05).
 *
 * CRUD + engine management + equipment tag set replacement +
 * recentFlights. setEquipment replaces the entire tag set in one
 * transaction (DELETE then INSERT).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  aircraft,
  aircraftEngine,
  aircraftEquipment,
  flightLogEntry,
} from '@part61/db';
import {
  createAircraftInput,
  updateAircraftInput,
  aircraftIdInput,
  addEngineInput,
  removeEngineInput,
  setEquipmentInput,
  listAircraftInput,
} from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  delete: typeof import('@part61/db').db.delete;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

async function loadAircraft(tx: Tx, id: string, schoolId: string) {
  const rows = await tx
    .select()
    .from(aircraft)
    .where(and(eq(aircraft.id, id), eq(aircraft.schoolId, schoolId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Aircraft not found' });
  }
  return row;
}

export const adminAircraftRouter = router({
  list: adminProcedure.input(listAircraftInput).query(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const baseFilter = input.baseId
      ? and(eq(aircraft.schoolId, ctx.session!.schoolId), eq(aircraft.baseId, input.baseId))
      : eq(aircraft.schoolId, ctx.session!.schoolId);
    const rows = await tx
      .select()
      .from(aircraft)
      .where(and(baseFilter, isNull(aircraft.deletedAt)))
      .orderBy(aircraft.tailNumber)
      .limit(input.limit)
      .offset(input.offset);
    return rows;
  }),

  getById: adminProcedure.input(aircraftIdInput).query(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const ac = await loadAircraft(tx, input.aircraftId, ctx.session!.schoolId);
    const engines = await tx
      .select()
      .from(aircraftEngine)
      .where(eq(aircraftEngine.aircraftId, input.aircraftId));
    const equipment = await tx
      .select()
      .from(aircraftEquipment)
      .where(eq(aircraftEquipment.aircraftId, input.aircraftId));
    return { aircraft: ac, engines, equipment };
  }),

  create: adminProcedure
    .input(createAircraftInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const baseId = input.baseId ?? ctx.session!.activeBaseId;
      if (!baseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'baseId is required (no active base in session)',
        });
      }
      const rows = await tx
        .insert(aircraft)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId,
          tailNumber: input.tailNumber,
          make: input.make ?? null,
          model: input.model ?? null,
          year: input.year ?? null,
          equipmentNotes: input.equipmentNotes ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(updateAircraftInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadAircraft(tx, input.aircraftId, ctx.session!.schoolId);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.tailNumber !== undefined) patch.tailNumber = input.tailNumber;
      if (input.make !== undefined) patch.make = input.make;
      if (input.model !== undefined) patch.model = input.model;
      if (input.year !== undefined) patch.year = input.year;
      if (input.equipmentNotes !== undefined)
        patch.equipmentNotes = input.equipmentNotes;
      if (input.baseId !== undefined) patch.baseId = input.baseId;
      const rows = await tx
        .update(aircraft)
        .set(patch)
        .where(eq(aircraft.id, input.aircraftId))
        .returning();
      return rows[0]!;
    }),

  softDelete: adminProcedure
    .input(aircraftIdInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(aircraft)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(aircraft.id, input.aircraftId),
            eq(aircraft.schoolId, ctx.session!.schoolId),
            isNull(aircraft.deletedAt),
          ),
        )
        .returning({ id: aircraft.id });
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Aircraft not found' });
      }
      return { ok: true };
    }),

  addEngine: adminProcedure
    .input(addEngineInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadAircraft(tx, input.aircraftId, ctx.session!.schoolId);
      const rows = await tx
        .insert(aircraftEngine)
        .values({
          aircraftId: input.aircraftId,
          position: input.position,
          serialNumber: input.serialNumber ?? null,
          installedAt: input.installedAt ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  removeEngine: adminProcedure
    .input(removeEngineInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(aircraftEngine)
        .set({ removedAt: new Date() })
        .where(eq(aircraftEngine.id, input.engineId))
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Engine not found' });
      }
      return { ok: true };
    }),

  setEquipment: adminProcedure
    .input(setEquipmentInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadAircraft(tx, input.aircraftId, ctx.session!.schoolId);
      await tx
        .delete(aircraftEquipment)
        .where(eq(aircraftEquipment.aircraftId, input.aircraftId));
      if (input.tags.length > 0) {
        await tx.insert(aircraftEquipment).values(
          input.tags.map((tag) => ({ aircraftId: input.aircraftId, tag })),
        );
      }
      return { ok: true, count: input.tags.length };
    }),

  recentFlights: adminProcedure
    .input(z.object({ aircraftId: z.string().regex(/^[0-9a-fA-F-]{36}$/), limit: z.number().int().min(1).max(200).default(25) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadAircraft(tx, input.aircraftId, ctx.session!.schoolId);
      return tx
        .select()
        .from(flightLogEntry)
        .where(eq(flightLogEntry.aircraftId, input.aircraftId))
        .orderBy(desc(flightLogEntry.flownAt))
        .limit(input.limit);
    }),
});
