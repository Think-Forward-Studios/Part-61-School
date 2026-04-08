/**
 * flightLog router (FLT-02, FLT-03).
 *
 * APPEND-ONLY CONTRACT.
 * - list     — query (protectedProcedure)
 * - create   — mutation, kind='flight'
 * - createCorrection — mutation, kind='correction', correctsId set
 *
 * There is no update procedure. There is no delete procedure. Three
 * layers of defense keep flight history honest:
 *   1. The database has no UPDATE policy on flight_log_entry (RLS
 *      denies every UPDATE).
 *   2. A hard-delete trigger raises on any DELETE.
 *   3. This router exposes neither verb to the client.
 *
 * Corrections are a new row that points at the original via
 * corrects_id. Per-engine deltas ride along in the same transaction
 * via flight_log_entry_engine.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { aircraft, flightLogEntry, flightLogEntryEngine } from '@part61/db';
import {
  flightLogEntryCreateInput,
  flightLogCorrectionCreateInput,
  flightLogListInput,
} from '@part61/domain';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

function numStr(v: number | null | undefined): string | null {
  return v == null ? null : v.toFixed(1);
}

async function loadAircraftOrThrow(tx: Tx, aircraftId: string, schoolId: string) {
  const rows = await tx
    .select()
    .from(aircraft)
    .where(and(eq(aircraft.id, aircraftId), eq(aircraft.schoolId, schoolId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Aircraft not found' });
  }
  return row;
}

export const flightLogRouter = router({
  list: protectedProcedure
    .input(flightLogListInput)
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadAircraftOrThrow(tx, input.aircraftId, ctx.session!.schoolId);
      const rows = await tx
        .select()
        .from(flightLogEntry)
        .where(eq(flightLogEntry.aircraftId, input.aircraftId))
        .orderBy(desc(flightLogEntry.flownAt))
        .limit(input.limit);
      return rows;
    }),

  create: protectedProcedure
    .input(flightLogEntryCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const ac = await loadAircraftOrThrow(
        tx,
        input.aircraftId,
        ctx.session!.schoolId,
      );
      const rows = await tx
        .insert(flightLogEntry)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: ac.baseId,
          aircraftId: input.aircraftId,
          kind: 'flight',
          flownAt: input.flownAt,
          hobbsOut: numStr(input.hobbsOut),
          hobbsIn: numStr(input.hobbsIn),
          tachOut: numStr(input.tachOut),
          tachIn: numStr(input.tachIn),
          airframeDelta: input.airframeDelta.toFixed(1),
          notes: input.notes ?? null,
          recordedBy: ctx.session!.userId,
        })
        .returning();
      const entry = rows[0]!;
      if (input.engineDeltas.length > 0) {
        await tx.insert(flightLogEntryEngine).values(
          input.engineDeltas.map((d) => ({
            flightLogEntryId: entry.id,
            engineId: d.engineId,
            deltaHours: d.deltaHours.toFixed(1),
          })),
        );
      }
      return entry;
    }),

  createCorrection: protectedProcedure
    .input(flightLogCorrectionCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Look up the original to inherit aircraft + base.
      const originalRows = await tx
        .select()
        .from(flightLogEntry)
        .where(
          and(
            eq(flightLogEntry.id, input.correctsId),
            eq(flightLogEntry.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const original = originalRows[0];
      if (!original) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Original flight log entry not found',
        });
      }
      const rows = await tx
        .insert(flightLogEntry)
        .values({
          schoolId: original.schoolId,
          baseId: original.baseId,
          aircraftId: original.aircraftId,
          kind: 'correction',
          flownAt: input.flownAt,
          hobbsOut: numStr(input.hobbsOut),
          hobbsIn: numStr(input.hobbsIn),
          tachOut: numStr(input.tachOut),
          tachIn: numStr(input.tachIn),
          airframeDelta: input.airframeDelta.toFixed(1),
          correctsId: input.correctsId,
          notes: input.notes ?? null,
          recordedBy: ctx.session!.userId,
        })
        .returning();
      const entry = rows[0]!;
      if (input.engineDeltas.length > 0) {
        await tx.insert(flightLogEntryEngine).values(
          input.engineDeltas.map((d) => ({
            flightLogEntryId: entry.id,
            engineId: d.engineId,
            deltaHours: d.deltaHours.toFixed(1),
          })),
        );
      }
      return entry;
    }),
});
