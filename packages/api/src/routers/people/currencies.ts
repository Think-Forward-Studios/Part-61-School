/**
 * people/currencies sub-router (IPF-01).
 *
 * Soft-delete via deleted_at for typo corrections only.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { instructorCurrency } from '@part61/db';
import { currencyCreateInput, currencyUpdateInput } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const currenciesRouter = router({
  list: adminProcedure
    .input(z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return tx
        .select()
        .from(instructorCurrency)
        .where(
          and(
            eq(instructorCurrency.userId, input.userId),
            eq(instructorCurrency.schoolId, ctx.session!.schoolId),
            isNull(instructorCurrency.deletedAt),
          ),
        );
    }),

  create: adminProcedure
    .input(currencyCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(instructorCurrency)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.userId,
          kind: input.kind,
          effectiveAt: input.effectiveAt,
          expiresAt: input.expiresAt ?? null,
          notes: input.notes ?? null,
          documentId: input.documentId ?? null,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(currencyUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(instructorCurrency)
        .set({
          kind: input.kind,
          effectiveAt: input.effectiveAt,
          expiresAt: input.expiresAt ?? null,
          notes: input.notes ?? null,
          documentId: input.documentId ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(instructorCurrency.id, input.currencyId),
            eq(instructorCurrency.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Currency not found',
        });
      }
      return rows[0]!;
    }),

  softDelete: adminProcedure
    .input(z.object({ currencyId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(instructorCurrency)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(instructorCurrency.id, input.currencyId),
            eq(instructorCurrency.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning({ id: instructorCurrency.id });
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Currency not found',
        });
      }
      return { ok: true };
    }),
});
