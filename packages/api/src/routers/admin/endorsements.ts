/**
 * admin.endorsements router — Phase 5-03 (SYL-09).
 *
 * Endpoints:
 *   - listTemplates()         — endorsement_template catalog
 *   - listStudentEndorsements({ studentUserId })
 *   - issue({ studentUserId, templateId, placeholderValues?, expiresAt?,
 *             aircraftContext?, notes? }) — renders the body_template by
 *     substituting placeholders from person_profile + now(), snapshots
 *     rendered_text + signer, seals immediately.
 *   - revoke({ endorsementId, reason }) — sets revoked_at + notes; soft.
 *
 * Gated by instructorOrAdminProcedure (instructors can issue).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { endorsementTemplate, studentEndorsement } from '@part61/db';
import { router } from '../../trpc';
import { instructorOrAdminProcedure } from '../../procedures';
import { buildInstructorSignerSnapshot } from '../../helpers/buildInstructorSignerSnapshot';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

function renderTemplate(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    return values[key] ?? `{{${key}}}`;
  });
}

export const adminEndorsementsRouter = router({
  listTemplates: instructorOrAdminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(endorsementTemplate)
      .where(isNull(endorsementTemplate.deletedAt));
    return rows;
  }),

  listStudentEndorsements: instructorOrAdminProcedure
    .input(z.object({ studentUserId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .select()
        .from(studentEndorsement)
        .where(
          and(
            eq(studentEndorsement.schoolId, ctx.session!.schoolId),
            eq(studentEndorsement.studentUserId, input.studentUserId),
            isNull(studentEndorsement.deletedAt),
          ),
        )
        .orderBy(desc(studentEndorsement.issuedAt));
      return rows;
    }),

  issue: instructorOrAdminProcedure
    .input(
      z.object({
        studentUserId: z.string().uuid(),
        templateId: z.string().uuid(),
        placeholderValues: z.record(z.string(), z.string()).optional(),
        expiresAt: z.date().optional(),
        aircraftContext: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Load template
      const tmplRows = await tx
        .select()
        .from(endorsementTemplate)
        .where(eq(endorsementTemplate.id, input.templateId))
        .limit(1);
      const tmpl = tmplRows[0];
      if (!tmpl) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Endorsement template not found',
        });
      }

      // Load student + instructor profile for default placeholders
      const profileRows = (await tx.execute(sql`
        select
          student.user_id as student_user_id,
          coalesce(
            nullif(trim(concat_ws(' ', student_pp.first_name, student_pp.last_name)), ''),
            student_u.full_name,
            student_u.email
          ) as student_name,
          coalesce(
            nullif(trim(concat_ws(' ', instr_pp.first_name, instr_pp.last_name)), ''),
            instr_u.full_name,
            instr_u.email
          ) as instructor_name,
          instr_pp.faa_airman_cert_number as instructor_cfi_number
        from public.users student_u
        left join public.person_profile student_pp on student_pp.user_id = student_u.id
        left join public.person_profile student on student.user_id = student_u.id
        left join public.users instr_u on instr_u.id = ${ctx.session!.userId}
        left join public.person_profile instr_pp on instr_pp.user_id = instr_u.id
        where student_u.id = ${input.studentUserId}
        limit 1
      `)) as unknown as Array<{
        student_name: string | null;
        instructor_name: string | null;
        instructor_cfi_number: string | null;
      }>;
      const profile = profileRows[0];
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Student not found' });
      }

      const today = new Date();
      const defaults: Record<string, string> = {
        student_name: profile.student_name ?? '',
        instructor_name: profile.instructor_name ?? '',
        instructor_cfi_number: profile.instructor_cfi_number ?? '',
        date: today.toISOString().slice(0, 10),
        aircraft: input.aircraftContext ?? '',
      };
      const values = { ...defaults, ...(input.placeholderValues ?? {}) };
      const renderedText = renderTemplate(tmpl.bodyTemplate, values);

      const snapshot = await buildInstructorSignerSnapshot(
        tx,
        ctx.session!.userId,
        ctx.session!.activeRole,
      );

      const [row] = await tx
        .insert(studentEndorsement)
        .values({
          schoolId: ctx.session!.schoolId,
          studentUserId: input.studentUserId,
          templateId: input.templateId,
          renderedText,
          issuedByUserId: ctx.session!.userId,
          signerSnapshot: snapshot as unknown as Record<string, unknown>,
          expiresAt: input.expiresAt,
          aircraftContext: input.aircraftContext,
          notes: input.notes,
          sealed: true,
          sealedAt: today,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  revoke: instructorOrAdminProcedure
    .input(
      z.object({
        endorsementId: z.string().uuid(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const [row] = await tx
        .update(studentEndorsement)
        .set({
          revokedAt: new Date(),
          notes: input.reason,
          updatedBy: ctx.session!.userId,
        })
        .where(eq(studentEndorsement.id, input.endorsementId))
        .returning();
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Endorsement not found',
        });
      }
      return row;
    }),
});
