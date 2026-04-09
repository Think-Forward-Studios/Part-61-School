/**
 * admin.studentCurrencies router — Phase 5-03 (SYL-13).
 *
 * Manages personnel_currency rows with subject_kind='student'. Mirrors
 * the Phase 2 instructor currency shape but scoped to students only.
 *
 * Gated by adminOrChiefInstructorProcedure.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { personnelCurrency } from '@part61/db';
import { router } from '../../trpc';
import { adminOrChiefInstructorProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
};

const currencyKindSchema = z.enum([
  'cfi',
  'cfii',
  'mei',
  'medical',
  'bfr',
  'ipc',
]);

export const adminStudentCurrenciesRouter = router({
  list: adminOrChiefInstructorProcedure
    .input(z.object({ studentUserId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(personnelCurrency)
        .where(
          and(
            eq(personnelCurrency.schoolId, ctx.session!.schoolId),
            eq(personnelCurrency.userId, input.studentUserId),
            eq(personnelCurrency.subjectKind, 'student'),
            isNull(personnelCurrency.deletedAt),
          ),
        )
        .orderBy(desc(personnelCurrency.effectiveAt));
      return rows;
    }),

  record: adminOrChiefInstructorProcedure
    .input(
      z.object({
        studentUserId: z.string().uuid(),
        kind: currencyKindSchema,
        effectiveAt: z.date(),
        expiresAt: z.date().optional(),
        notes: z.string().optional(),
        documentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const [row] = await tx
        .insert(personnelCurrency)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.studentUserId,
          subjectKind: 'student',
          kind: input.kind,
          effectiveAt: input.effectiveAt,
          expiresAt: input.expiresAt,
          notes: input.notes,
          documentId: input.documentId,
        })
        .returning();
      return row;
    }),

  update: adminOrChiefInstructorProcedure
    .input(
      z.object({
        currencyId: z.string().uuid(),
        effectiveAt: z.date().optional(),
        expiresAt: z.date().nullable().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.effectiveAt !== undefined) patch.effectiveAt = input.effectiveAt;
      if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;
      if (input.notes !== undefined) patch.notes = input.notes;
      const [row] = await tx
        .update(personnelCurrency)
        .set(patch)
        .where(
          and(
            eq(personnelCurrency.id, input.currencyId),
            eq(personnelCurrency.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Currency not found' });
      }
      return row;
    }),

  softDelete: adminOrChiefInstructorProcedure
    .input(z.object({ currencyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const [row] = await tx
        .update(personnelCurrency)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(personnelCurrency.id, input.currencyId),
            eq(personnelCurrency.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Currency not found' });
      }
      return row;
    }),
});
