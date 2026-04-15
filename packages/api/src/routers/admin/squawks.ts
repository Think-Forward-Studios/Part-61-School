/**
 * admin/squawks router — FLT-04 + MNT-04/05.
 *
 * Phase 3 shipped `list` and `resolve`. Phase 4 extends to the full
 * 5-state lifecycle (open → triaged → deferred|in_work → fixed →
 * returned_to_service). Every transition that writes a signature goes
 * through mechanicOrAdminProcedure + buildSignerSnapshot. RTS uses
 * A&P (or IA); the DB trigger trg_squawk_rts_maybe_unground may clear
 * aircraft.grounded_at if no other cause remains.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { aircraftSquawk } from '@part61/db';
import { resolveSquawkInput } from '@part61/domain';
import { router } from '../../trpc';
import { mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';
import { createNotification } from '../../helpers/notifications';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

async function loadSquawk(tx: Tx, squawkId: string, schoolId: string) {
  const rows = await tx
    .select()
    .from(aircraftSquawk)
    .where(and(eq(aircraftSquawk.id, squawkId), eq(aircraftSquawk.schoolId, schoolId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
  return row;
}

export const adminSquawksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(aircraftSquawk)
      .where(
        and(eq(aircraftSquawk.schoolId, ctx.session!.schoolId), isNull(aircraftSquawk.resolvedAt)),
      );
    return rows;
  }),

  get: protectedProcedure
    .input(z.object({ squawkId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      return await loadSquawk(tx, input.squawkId, ctx.session!.schoolId);
    }),

  // Phase 3 legacy: mechanic or admin marks resolved. Retained so
  // Phase 3 callers keep working unchanged.
  resolve: mechanicOrAdminProcedure.input(resolveSquawkInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .update(aircraftSquawk)
      .set({
        resolvedAt: new Date(),
        resolvedBy: ctx.session!.userId,
        resolutionNotes: input.resolutionNotes ?? null,
      })
      .where(
        and(
          eq(aircraftSquawk.id, input.squawkId),
          eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
        ),
      )
      .returning();
    if (rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
    }
    return rows[0]!;
  }),

  triage: mechanicOrAdminProcedure
    .input(
      z.object({
        squawkId: z.string().uuid(),
        action: z.enum(['defer', 'in_work']),
        deferredUntil: z.string().optional(),
        deferralJustification: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Verify caller has at least A&P mechanic authority (admin callers
      // without mechanic_authority can still open/close per Phase 3
      // contract; the signature-writing transitions below gate on it).
      await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const now = new Date();
      const nextStatus = input.action === 'defer' ? 'deferred' : 'in_work';
      if (
        input.action === 'defer' &&
        (!input.deferralJustification || input.deferralJustification.length < 5)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Deferral justification required',
        });
      }
      const rows = await tx
        .update(aircraftSquawk)
        .set({
          status: nextStatus,
          triagedAt: now,
          triagedBy: ctx.session!.userId,
          deferredUntil: input.deferredUntil ?? null,
          deferralJustification: input.deferralJustification ?? null,
        })
        .where(
          and(
            eq(aircraftSquawk.id, input.squawkId),
            eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
      return rows[0]!;
    }),

  moveToInWork: mechanicOrAdminProcedure
    .input(z.object({ squawkId: z.string().uuid(), workOrderId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const rows = await tx
        .update(aircraftSquawk)
        .set({ status: 'in_work', workOrderId: input.workOrderId ?? null })
        .where(
          and(
            eq(aircraftSquawk.id, input.squawkId),
            eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
      return rows[0]!;
    }),

  markFixed: mechanicOrAdminProcedure
    .input(
      z.object({
        squawkId: z.string().uuid(),
        workOrderId: z.string().uuid().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const rows = await tx
        .update(aircraftSquawk)
        .set({
          status: 'fixed',
          workOrderId: input.workOrderId ?? null,
          resolutionNotes: input.notes ?? null,
        })
        .where(
          and(
            eq(aircraftSquawk.id, input.squawkId),
            eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
      return rows[0]!;
    }),

  returnToService: mechanicOrAdminProcedure
    .input(z.object({ squawkId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const now = new Date();
      const rows = await tx
        .update(aircraftSquawk)
        .set({
          status: 'returned_to_service',
          returnedToServiceAt: now,
          returnedToServiceSignerSnapshot: snapshot,
          resolvedAt: now,
          resolvedBy: ctx.session!.userId,
        })
        .where(
          and(
            eq(aircraftSquawk.id, input.squawkId),
            eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });

      // Phase 8 NOT-01: notify the original opener + all admins /
      // instructors in the school that the aircraft is cleared.
      const squawkRow = rows[0]!;
      const tailRows = (await tx.execute(sql`
        select tail_number from public.aircraft where id = ${squawkRow.aircraftId}::uuid
      `)) as unknown as Array<{ tail_number: string | null }>;
      const aircraftTail = tailRows[0]?.tail_number ?? 'unknown';

      const recipients = (await tx.execute(sql`
        select distinct u.id
          from public.users u
          left join public.user_roles ur on ur.user_id = u.id
         where u.school_id = ${ctx.session!.schoolId}::uuid
           and (
             u.id = ${squawkRow.openedBy}::uuid
             or ur.role in ('admin', 'instructor')
           )
      `)) as unknown as Array<{ id: string }>;

      for (const rcpt of recipients) {
        if (rcpt.id === ctx.session!.userId) continue;
        await createNotification(tx, {
          schoolId: ctx.session!.schoolId,
          baseId: squawkRow.baseId,
          userId: rcpt.id,
          kind: 'squawk_returned_to_service',
          title: `Cleared for flight: ${aircraftTail}`,
          body: `${squawkRow.title} — returned to service`,
          linkUrl: `/admin/squawks/${squawkRow.id}`,
          sourceTable: 'aircraft_squawk',
          sourceRecordId: squawkRow.id,
          emailTemplateKey: 'squawk_returned_to_service',
          emailTemplateProps: {
            recipientName: 'Team',
            aircraftTail,
            mechanicName: ctx.session!.email ?? 'Mechanic',
          },
        });
      }

      return { ...rows[0]!, signer: snapshot };
    }),

  cancel: mechanicOrAdminProcedure
    .input(z.object({ squawkId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(aircraftSquawk)
        .set({
          status: 'cancelled',
          resolvedAt: new Date(),
          resolvedBy: ctx.session!.userId,
          resolutionNotes: input.reason,
        })
        .where(
          and(
            eq(aircraftSquawk.id, input.squawkId),
            eq(aircraftSquawk.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Squawk not found' });
      return rows[0]!;
    }),
});
