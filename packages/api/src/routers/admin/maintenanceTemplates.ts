/**
 * admin.maintenanceTemplates router.
 *
 * Admin manages maintenance_item_template + lines; applyToAircraft
 * copies the lines into maintenance_item rows for a specific aircraft.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, sql } from 'drizzle-orm';
import {
  maintenanceItemTemplate,
  maintenanceItemTemplateLine,
  maintenanceItem,
} from '@part61/db';
import { intervalRuleSchema } from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure, protectedProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const kindSchema = z.enum([
  'annual_inspection',
  'hundred_hour_inspection',
  'airworthiness_directive',
  'oil_change',
  'transponder_91_413',
  'pitot_static_91_411',
  'elt_battery',
  'elt_91_207',
  'vor_check',
  'component_life',
  'manufacturer_service_bulletin',
  'custom',
]);

export const adminMaintenanceTemplatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select *
        from public.maintenance_item_template
       where (school_id is null or school_id = ${ctx.session!.schoolId}::uuid)
         and deleted_at is null
       order by name
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),

  get: protectedProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const tplRows = await tx
        .select()
        .from(maintenanceItemTemplate)
        .where(eq(maintenanceItemTemplate.id, input.templateId))
        .limit(1);
      const tpl = tplRows[0];
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
      const lines = await tx
        .select()
        .from(maintenanceItemTemplateLine)
        .where(eq(maintenanceItemTemplateLine.templateId, tpl.id));
      return { ...tpl, lines };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        aircraftMake: z.string().optional(),
        aircraftModelPattern: z.string().optional(),
        description: z.string().optional(),
        lines: z
          .array(
            z.object({
              kind: kindSchema,
              title: z.string().min(1),
              intervalRule: intervalRuleSchema,
              defaultWarningDays: z.number().int().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const tplInserted = await tx
        .insert(maintenanceItemTemplate)
        .values({
          schoolId: ctx.session!.schoolId,
          name: input.name,
          aircraftMake: input.aircraftMake ?? null,
          aircraftModelPattern: input.aircraftModelPattern ?? null,
          description: input.description ?? null,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      const tpl = tplInserted[0]!;
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        await tx.insert(maintenanceItemTemplateLine).values({
          templateId: tpl.id,
          kind: line.kind,
          title: line.title,
          intervalRule: line.intervalRule,
          defaultWarningDays: line.defaultWarningDays ?? null,
          position: i,
        });
      }
      return tpl;
    }),

  applyToAircraft: adminProcedure
    .input(
      z.object({ templateId: z.string().uuid(), aircraftId: z.string().uuid() }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const lines = await tx
        .select()
        .from(maintenanceItemTemplateLine)
        .where(eq(maintenanceItemTemplateLine.templateId, input.templateId));
      let inserted = 0;
      for (const line of lines) {
        await tx.insert(maintenanceItem).values({
          schoolId: ctx.session!.schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          aircraftId: input.aircraftId,
          kind: line.kind,
          title: line.title,
          intervalRule: line.intervalRule,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        });
        inserted += 1;
      }
      await tx.execute(
        sql`select public.recompute_maintenance_status(${input.aircraftId}::uuid)`,
      );
      return { inserted };
    }),
});
