/**
 * withTenantTx — opens a Drizzle transaction and sets the tenant GUCs
 * (`app.school_id` / `app.user_id` / `app.active_role`) before any query
 * runs. This is the defense-in-depth layer on top of RLS — even if an
 * RLS policy is missing or misauthored, the tenant context is still
 * present for the audit trigger to stamp actor_user_id / actor_role.
 *
 * See research §Pattern 3 and packages/db/src/tx.ts::withSchoolContext.
 */
import { TRPCError } from '@trpc/server';
import { db, withSchoolContext } from '@part61/db';
import { t } from '../trpc';

export const withTenantTx = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  const session = ctx.session;
  return await db.transaction(async (tx) => {
    return withSchoolContext(
      tx,
      {
        schoolId: session.schoolId,
        userId: session.userId,
        activeRole: session.activeRole,
        baseId: session.activeBaseId,
      },
      () => next({ ctx: { ...ctx, session, tx } }),
    );
  });
});
