/**
 * schedule.blocks sub-router (SCH-16).
 *
 * Admin CRUD for schedule_block + child schedule_block_instance rows.
 * blocks.create inserts one parent schedule_block row plus one
 * schedule_block_instance row per materialized time window.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import {
  scheduleBlock,
  scheduleBlockInstance,
} from '@part61/db';
import { blockCreateInput, blockDeleteInput } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure, protectedProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  delete: (typeof import('@part61/db').db)['delete'];
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const scheduleBlocksRouter = router({
  create: adminProcedure
    .input(blockCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const baseId = ctx.session!.activeBaseId;
      if (!baseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active base in session',
        });
      }
      const blockRows = await tx
        .insert(scheduleBlock)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId,
          kind: input.kind,
          instructorId: input.instructorId ?? null,
          aircraftId: input.aircraftId ?? null,
          roomId: input.roomId ?? null,
          notes: input.notes ?? null,
          createdBy: ctx.session!.userId,
        })
        .returning();
      const block = blockRows[0]!;

      for (const inst of input.instances) {
        const rangeLit = `[${inst.startsAt.toISOString()},${inst.endsAt.toISOString()})`;
        await tx.execute(sql`
          insert into public.schedule_block_instance
            (block_id, school_id, base_id, time_range)
          values (
            ${block.id}::uuid,
            ${ctx.session!.schoolId}::uuid,
            ${baseId}::uuid,
            ${rangeLit}::tstzrange
          )
        `);
      }
      return { blockId: block.id, instanceCount: input.instances.length };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(scheduleBlock)
      .where(eq(scheduleBlock.schoolId, ctx.session!.schoolId));
    return rows;
  }),

  delete: adminProcedure
    .input(blockDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await tx
        .delete(scheduleBlockInstance)
        .where(eq(scheduleBlockInstance.blockId, input.blockId));
      const rows = await tx
        .update(scheduleBlock)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(scheduleBlock.id, input.blockId),
            eq(scheduleBlock.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning({ id: scheduleBlock.id });
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Block not found' });
      }
      return { ok: true };
    }),
});
