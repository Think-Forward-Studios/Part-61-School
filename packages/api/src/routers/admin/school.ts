/**
 * admin/school router — school settings (ADM-06 partial).
 */
import { eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { schools } from '@part61/db';
import { updateSchoolInput } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminSchoolRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(schools)
      .where(eq(schools.id, ctx.session!.schoolId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'School not found' });
    }
    return row;
  }),

  update: adminProcedure
    .input(updateSchoolInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.timezone !== undefined) patch.timezone = input.timezone;
      // defaultBaseId column does not exist on schools in Phase 1/2 schema;
      // v1 deploys ship with a single base per school, so storing the
      // default base is deferred. Accept the input to keep the UI contract
      // forward-compatible and silently ignore when the column is absent.
      if (Object.keys(patch).length === 0) return { ok: true };
      const rows = await tx
        .update(schools)
        .set(patch)
        .where(eq(schools.id, ctx.session!.schoolId))
        .returning();
      return rows[0]!;
    }),
});
