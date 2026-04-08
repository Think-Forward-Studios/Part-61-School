/**
 * people/infoReleases sub-router (PER-04).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { infoReleaseAuthorization } from '@part61/db';
import { infoReleaseCreateInput, infoReleaseRevokeInput } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const infoReleasesRouter = router({
  list: adminProcedure
    .input(z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return tx
        .select()
        .from(infoReleaseAuthorization)
        .where(
          and(
            eq(infoReleaseAuthorization.userId, input.userId),
            eq(infoReleaseAuthorization.schoolId, ctx.session!.schoolId),
            isNull(infoReleaseAuthorization.revokedAt),
          ),
        );
    }),

  create: adminProcedure
    .input(infoReleaseCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(infoReleaseAuthorization)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.userId,
          name: input.name,
          relationship: input.relationship ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  revoke: adminProcedure
    .input(infoReleaseRevokeInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(infoReleaseAuthorization)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(infoReleaseAuthorization.id, input.releaseId),
            eq(infoReleaseAuthorization.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning({ id: infoReleaseAuthorization.id });
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Info release not found',
        });
      }
      return { ok: true };
    }),
});
