/**
 * admin.audit router — Phase 6-02 (SYL-24).
 *
 * Training record audit exception management: list open exceptions,
 * mark resolved, trigger a manual audit run. All admin-gated.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminAuditRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          severity: z
            .enum(['info', 'warn', 'critical'])
            .optional(),
          studentId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const sev = input?.severity ?? null;
      const stuId = input?.studentId ?? null;
      const lim = input?.limit ?? 100;

      const rows = (await tx.execute(sql`
        select
          e.*,
          stu.full_name as student_name
        from public.training_record_audit_exception e
        left join public.student_course_enrollment sce on sce.id = e.student_enrollment_id
        left join public.users stu on stu.id = sce.user_id
        where e.resolved_at is null
          and (${sev}::text is null or e.severity::text = ${sev}::text)
          and (${stuId}::uuid is null or sce.user_id = ${stuId}::uuid)
        order by
          case e.severity
            when 'critical' then 0
            when 'warn' then 1
            else 2
          end,
          e.last_detected_at desc
        limit ${lim}
      `)) as unknown as Array<Record<string, unknown>>;
      return rows;
    }),

  markResolved: adminProcedure
    .input(z.object({ exceptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        update public.training_record_audit_exception
        set resolved_at = now()
        where id = ${input.exceptionId}::uuid
          and resolved_at is null
        returning id
      `)) as unknown as Array<{ id: string }>;
      if (!rows[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Exception not found or already resolved',
        });
      }
      return { resolved: true };
    }),

  runNow: adminProcedure.mutation(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    await tx.execute(sql`select public.run_training_record_audit()`);
    const countRows = (await tx.execute(sql`
      select count(*)::int as open_count
      from public.training_record_audit_exception
      where resolved_at is null
    `)) as unknown as Array<{ open_count: number }>;
    return { openCount: countRows[0]?.open_count ?? 0 };
  }),
});
