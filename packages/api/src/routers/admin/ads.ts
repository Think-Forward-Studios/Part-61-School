/**
 * admin.ads router — MNT-07.
 *
 * AD catalog CRUD (admin-only for create/update), applyToFleet loops
 * aircraft and calls apply_ads_to_aircraft for each, and
 * recordCompliance builds an IA signer snapshot and appends an
 * ad_compliance_history row.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  airworthinessDirective,
  aircraftAdCompliance,
  adComplianceHistory,
  aircraft,
} from '@part61/db';
import { adApplicabilitySchema } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure, mechanicOrAdminProcedure, protectedProcedure } from '../../procedures';
import { buildSignerSnapshot } from '../../helpers/signerSnapshot';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminAdsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx.select().from(airworthinessDirective).where(isNull(airworthinessDirective.deletedAt));
    return rows;
  }),

  get: protectedProcedure
    .input(z.object({ adId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(airworthinessDirective)
        .where(eq(airworthinessDirective.id, input.adId))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'AD not found' });
      return rows[0];
    }),

  create: adminProcedure
    .input(
      z.object({
        adNumber: z.string().min(1),
        title: z.string().min(1),
        summary: z.string().optional(),
        effectiveDate: z.string().optional(),
        complianceMethod: z.string().optional(),
        applicability: adApplicabilitySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const inserted = await tx
        .insert(airworthinessDirective)
        .values({
          schoolId: ctx.session!.schoolId,
          adNumber: input.adNumber,
          title: input.title,
          summary: input.summary ?? null,
          effectiveDate: input.effectiveDate ?? null,
          complianceMethod: input.complianceMethod ?? null,
          applicability: input.applicability ?? {},
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return inserted[0]!;
    }),

  update: adminProcedure
    .input(
      z.object({
        adId: z.string().uuid(),
        title: z.string().min(1).optional(),
        summary: z.string().optional(),
        complianceMethod: z.string().optional(),
        applicability: adApplicabilitySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const patch: Record<string, unknown> = { updatedBy: ctx.session!.userId, updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.complianceMethod !== undefined) patch.complianceMethod = input.complianceMethod;
      if (input.applicability !== undefined) patch.applicability = input.applicability;
      const rows = await tx
        .update(airworthinessDirective)
        .set(patch)
        .where(
          and(
            eq(airworthinessDirective.id, input.adId),
            eq(airworthinessDirective.schoolId, ctx.session!.schoolId),
          ),
        )
        .returning();
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'AD not found' });
      return rows[0];
    }),

  /**
   * Apply an AD catalog row to every aircraft in the school and count
   * how many new aircraft_ad_compliance rows get inserted.
   */
  applyToFleet: adminProcedure
    .input(z.object({ adId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const fleet = await tx
        .select({ id: aircraft.id })
        .from(aircraft)
        .where(
          and(
            eq(aircraft.schoolId, ctx.session!.schoolId),
            isNull(aircraft.deletedAt),
          ),
        );
      let newRows = 0;
      for (const a of fleet) {
        // Count compliance rows linked to this specific AD before+after.
        const before = (await tx.execute(sql`
          select count(*)::int as c
            from public.aircraft_ad_compliance
           where aircraft_id = ${a.id}::uuid and ad_id = ${input.adId}::uuid
        `)) as unknown as Array<{ c: number }>;
        await tx.execute(sql`select public.apply_ads_to_aircraft(${a.id}::uuid)`);
        const after = (await tx.execute(sql`
          select count(*)::int as c
            from public.aircraft_ad_compliance
           where aircraft_id = ${a.id}::uuid and ad_id = ${input.adId}::uuid
        `)) as unknown as Array<{ c: number }>;
        newRows += (after[0]?.c ?? 0) - (before[0]?.c ?? 0);
      }
      return { newComplianceRows: newRows };
    }),

  recordCompliance: mechanicOrAdminProcedure
    .input(
      z.object({
        complianceRecordId: z.string().uuid(),
        method: z.string().min(1),
        compliedAtHours: z.record(z.string(), z.number()).optional(),
        workOrderId: z.string().uuid().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const snapshot = await buildSignerSnapshot(tx, ctx.session!.userId, 'a_and_p');
      const rows = await tx
        .select()
        .from(aircraftAdCompliance)
        .where(
          and(
            eq(aircraftAdCompliance.id, input.complianceRecordId),
            eq(aircraftAdCompliance.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      const record = rows[0];
      if (!record) throw new TRPCError({ code: 'NOT_FOUND', message: 'AD compliance not found' });

      await tx.insert(adComplianceHistory).values({
        complianceRecordId: record.id,
        schoolId: record.schoolId,
        compliedAtHours: input.compliedAtHours ?? null,
        methodUsed: input.method,
        workOrderId: input.workOrderId ?? null,
        signerSnapshot: snapshot,
        notes: input.notes ?? null,
      });
      await tx
        .update(aircraftAdCompliance)
        .set({ status: 'current', updatedAt: new Date(), updatedBy: ctx.session!.userId })
        .where(eq(aircraftAdCompliance.id, record.id));
      return { ok: true as const, signer: snapshot };
    }),
});
