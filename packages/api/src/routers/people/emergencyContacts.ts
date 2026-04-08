/**
 * people/emergencyContacts sub-router (PER-03).
 *
 * Hard-delete is permitted on this table (audit-only trigger, no
 * hard-delete blocker) because emergency contacts are not
 * training-record-relevant.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { emergencyContact } from '@part61/db';
import {
  emergencyContactCreateInput,
  emergencyContactUpdateInput,
  emergencyContactDeleteInput,
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

export const emergencyContactsRouter = router({
  list: adminProcedure
    .input(z.object({ userId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return tx
        .select()
        .from(emergencyContact)
        .where(
          and(
            eq(emergencyContact.userId, input.userId),
            eq(emergencyContact.schoolId, ctx.session!.schoolId),
          ),
        );
    }),

  create: adminProcedure
    .input(emergencyContactCreateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(emergencyContact)
        .values({
          schoolId: ctx.session!.schoolId,
          userId: input.userId,
          name: input.name,
          relationship: input.relationship ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          isPrimary: input.isPrimary,
        })
        .returning();
      return rows[0]!;
    }),

  update: adminProcedure
    .input(emergencyContactUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(emergencyContact)
        .set({
          name: input.name,
          relationship: input.relationship ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          isPrimary: input.isPrimary,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(emergencyContact.id, input.contactId),
            eq(emergencyContact.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
      }
      return rows[0]!;
    }),

  delete: adminProcedure
    .input(emergencyContactDeleteInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .delete(emergencyContact)
        .where(
          and(
            eq(emergencyContact.id, input.contactId),
            eq(emergencyContact.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning({ id: emergencyContact.id });
      if (rows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
      }
      return { ok: true };
    }),
});
