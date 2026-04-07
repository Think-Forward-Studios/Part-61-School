/**
 * requireRole — middleware factory that gates a procedure on the caller's
 * current active_role. This is the SOLE server-side defense for AUTH-08:
 * UI hiding is cosmetic only — every admin/mechanic action MUST pass
 * through a requireRole() check inside tRPC middleware.
 */
import { TRPCError } from '@trpc/server';
import { t } from '../trpc';
import type { Role } from '../session';

export function requireRole(...allowed: Role[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
    }
    if (!allowed.includes(ctx.session.activeRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Requires one of: ${allowed.join(', ')}`,
      });
    }
    return next({ ctx });
  });
}
