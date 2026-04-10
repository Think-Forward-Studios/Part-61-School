/**
 * Composed procedures.
 *
 *   publicProcedure    — no auth, no tx
 *   protectedProcedure — requires Session, opens tenant-scoped transaction
 *   adminProcedure     — protectedProcedure + requireRole('admin')
 *
 * Use adminProcedure (and future mechanicProcedure, instructorProcedure)
 * for every role-gated endpoint. Never gate on UI alone. (AUTH-08)
 */
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { t } from './trpc';
import { withTenantTx } from './middleware/tenant';
import { requireRole } from './middleware/role';

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(withTenantTx);
export const adminProcedure = protectedProcedure.use(requireRole('admin'));
export const instructorOrAdminProcedure = protectedProcedure.use(
  requireRole('instructor', 'admin'),
);
export const mechanicOrAdminProcedure = protectedProcedure.use(
  requireRole('mechanic', 'admin'),
);

/**
 * adminOrChiefInstructorProcedure (Phase 5-03)
 *
 * Permits:
 *   - activeRole === 'admin', OR
 *   - activeRole === 'instructor' AND the caller has any user_roles row
 *     with is_chief_instructor = true.
 *
 * Used to gate syllabus authoring (course / version / tree CRUD,
 * enrollments, stage check scheduling, endorsement issuance, student
 * currency management). See SYL-01/03/04.
 */
/**
 * chiefInstructorOnlyProcedure (Phase 6-02)
 *
 * Permits ONLY:
 *   - activeRole === 'instructor' AND the caller has any user_roles row
 *     with is_chief_instructor = true.
 *
 * Admin-only users are REJECTED. This is STRICTER than
 * adminOrChiefInstructorProcedure. Used for override grants and
 * actions that require specific chief instructor authority.
 */
export const chiefInstructorOnlyProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
    }
    if (ctx.session.activeRole !== 'instructor') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Chief instructor role required',
      });
    }
    const tx = ctx.tx as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
    const rows = (await tx.execute(sql`
      select 1
        from public.user_roles ur
        where ur.user_id = ${ctx.session.userId}
          and ur.is_chief_instructor = true
        limit 1
    `)) as unknown as Array<{ '?column?'?: number }>;
    if (!rows || rows.length === 0) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Chief instructor flag required for this action',
      });
    }
    return next({ ctx });
  },
);

export const adminOrChiefInstructorProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
    }
    if (ctx.session.activeRole === 'admin') return next({ ctx });
    if (ctx.session.activeRole !== 'instructor') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin or chief instructor required',
      });
    }
    const tx = ctx.tx as { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
    const rows = (await tx.execute(sql`
      select 1
        from public.user_roles ur
        where ur.user_id = ${ctx.session.userId}
          and ur.is_chief_instructor = true
        limit 1
    `)) as unknown as Array<{ '?column?'?: number }>;
    if (!rows || rows.length === 0) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Chief instructor flag required for this action',
      });
    }
    return next({ ctx });
  },
);
