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
