/**
 * admin.rates router — school rate configuration.
 *
 * CRUD for school_rate rows. Immutable-history semantics: "update"
 * expires the old row and inserts a new one.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { schoolRate } from '@part61/db';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const rateKindInput = z.enum([
  'aircraft_wet',
  'aircraft_dry',
  'instructor',
  'ground_instructor',
  'simulator',
  'surcharge_fixed',
]);

export const adminRatesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(schoolRate)
      .where(and(eq(schoolRate.schoolId, ctx.session!.schoolId), isNull(schoolRate.deletedAt)));
    return rows;
  }),

  create: adminProcedure
    .input(
      z.object({
        kind: rateKindInput,
        amountCents: z.number().int().nonnegative(),
        aircraftId: z.string().uuid().optional(),
        aircraftMakeModel: z.string().optional(),
        instructorId: z.string().uuid().optional(),
        currencyCode: z.string().default('USD'),
        effectiveFrom: z.string().datetime().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(schoolRate)
        .values({
          schoolId: ctx.session!.schoolId,
          kind: input.kind,
          amountCents: input.amountCents,
          aircraftId: input.aircraftId ?? null,
          aircraftMakeModel: input.aircraftMakeModel ?? null,
          instructorId: input.instructorId ?? null,
          currencyCode: input.currencyCode,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
          notes: input.notes ?? null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(
      z.object({
        rateId: z.string().uuid(),
        amountCents: z.number().int().nonnegative(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Expire the old row
      const expired = await tx
        .update(schoolRate)
        .set({
          effectiveUntil: new Date(),
          updatedBy: ctx.session!.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(schoolRate.id, input.rateId), eq(schoolRate.schoolId, ctx.session!.schoolId)))
        .returning();

      const old = expired[0];
      if (!old) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rate not found' });
      }

      // Insert new row with same scope
      const rows = await tx
        .insert(schoolRate)
        .values({
          schoolId: old.schoolId,
          kind: old.kind,
          amountCents: input.amountCents,
          aircraftId: old.aircraftId,
          aircraftMakeModel: old.aircraftMakeModel,
          instructorId: old.instructorId,
          currencyCode: old.currencyCode,
          effectiveFrom: new Date(),
          notes: input.notes ?? old.notes,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return rows[0]!;
    }),

  softDelete: adminProcedure
    .input(z.object({ rateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(schoolRate)
        .set({
          deletedAt: new Date(),
          effectiveUntil: new Date(),
          updatedBy: ctx.session!.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(schoolRate.id, input.rateId), eq(schoolRate.schoolId, ctx.session!.schoolId)))
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rate not found' });
      }
      return rows[0]!;
    }),
});
