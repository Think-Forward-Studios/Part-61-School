/**
 * admin.overrides router — Phase 6-02 (SYL-17, IPF-06).
 *
 * Management override lifecycle: list, grant, revoke.
 * grant is gated by chiefInstructorOnlyProcedure (admin-only REJECTED).
 * list + revoke are gated by adminOrChiefInstructorProcedure.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import {
  adminOrChiefInstructorProcedure,
  chiefInstructorOnlyProcedure,
} from '../../procedures';
import { buildOverrideSignerSnapshot } from '../../helpers/buildOverrideSignerSnapshot';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminOverridesRouter = router({
  list: adminOrChiefInstructorProcedure
    .input(
      z.object({
        scope: z.enum(['active', 'recent30d', 'all']).default('active'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      let whereClause: string;
      if (input.scope === 'active') {
        whereClause = `lo.consumed_at is null and lo.revoked_at is null and lo.expires_at > now()`;
      } else if (input.scope === 'recent30d') {
        whereClause = `lo.granted_at >= now() - interval '30 days'`;
      } else {
        whereClause = `true`;
      }
      const rows = (await tx.execute(sql.raw(`
        select
          lo.*,
          u.full_name as granted_by_name,
          stu.full_name as student_name
        from public.lesson_override lo
        left join public.users u on u.id = lo.granted_by_user_id
        left join public.student_course_enrollment sce on sce.id = lo.student_enrollment_id
        left join public.users stu on stu.id = sce.user_id
        where ${whereClause}
        order by lo.granted_at desc
        limit 500
      `))) as unknown as Array<Record<string, unknown>>;
      return rows;
    }),

  grant: chiefInstructorOnlyProcedure
    .input(
      z.object({
        enrollmentId: z.string().uuid(),
        lessonId: z.string().uuid(),
        kind: z.enum(['prerequisite_skip', 'repeat_limit_exceeded', 'currency_waiver']),
        justification: z.string().min(20, 'Justification must be at least 20 characters'),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const snapshot = await buildOverrideSignerSnapshot(tx, ctx.session!.userId);

      // Derive school_id + base_id from the enrollment
      const enrRows = (await tx.execute(sql`
        select sce.school_id, sce.id
        from public.student_course_enrollment sce
        where sce.id = ${input.enrollmentId}::uuid
        limit 1
      `)) as unknown as Array<{ school_id: string; id: string }>;
      if (!enrRows[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Enrollment not found' });
      }

      const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const rows = (await tx.execute(sql`
        insert into public.lesson_override (
          school_id, base_id, student_enrollment_id, lesson_id,
          kind, justification, granted_by_user_id, signer_snapshot,
          expires_at
        ) values (
          ${ctx.session!.schoolId}::uuid,
          ${ctx.session!.activeBaseId}::uuid,
          ${input.enrollmentId}::uuid,
          ${input.lessonId}::uuid,
          ${input.kind}::public.lesson_override_kind,
          ${input.justification},
          ${ctx.session!.userId}::uuid,
          ${JSON.stringify(snapshot)}::jsonb,
          ${expiresAt.toISOString()}::timestamptz
        )
        returning *
      `)) as unknown as Array<Record<string, unknown>>;
      return rows[0];
    }),

  revoke: adminOrChiefInstructorProcedure
    .input(
      z.object({
        overrideId: z.string().uuid(),
        reason: z.string().min(1, 'Revocation reason is required'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        update public.lesson_override
        set revoked_at = now(),
            revoked_by_user_id = ${ctx.session!.userId}::uuid,
            revocation_reason = ${input.reason}
        where id = ${input.overrideId}::uuid
          and revoked_at is null
        returning *
      `)) as unknown as Array<Record<string, unknown>>;
      if (!rows[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Override not found or already revoked',
        });
      }
      return rows[0];
    }),
});
