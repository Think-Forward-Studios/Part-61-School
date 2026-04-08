/**
 * admin/rooms router (SCH-18).
 *
 * CRUD for bookable rooms. Admin-only. Rooms participate in the
 * reservation exclusion constraint via reservation.room_id.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { room } from '@part61/db';
import {
  roomCreateInput,
  roomIdInput,
  roomUpdateInput,
} from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure, protectedProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminRoomsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(room)
      .where(
        and(eq(room.schoolId, ctx.session!.schoolId), isNull(room.deletedAt)),
      );
    return rows;
  }),

  create: adminProcedure
    .input(roomCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const baseId = input.baseId ?? ctx.session!.activeBaseId;
      if (!baseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'baseId required (no active base in session)',
        });
      }
      const rows = await tx
        .insert(room)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId,
          name: input.name,
          capacity: input.capacity ?? null,
          features: input.features ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(roomUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.capacity !== undefined) patch.capacity = input.capacity;
      if (input.features !== undefined) patch.features = input.features;
      const rows = await tx
        .update(room)
        .set(patch)
        .where(
          and(
            eq(room.id, input.roomId),
            eq(room.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
      }
      return rows[0]!;
    }),

  softDelete: adminProcedure
    .input(roomIdInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(room)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(room.id, input.roomId),
            eq(room.schoolId, ctx.session!.schoolId),
            isNull(room.deletedAt),
          ),
        )
        .returning({ id: room.id });
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
      }
      return { ok: true };
    }),
});
