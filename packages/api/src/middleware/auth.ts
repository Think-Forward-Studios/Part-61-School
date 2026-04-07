/**
 * requireSession middleware — rejects requests with no resolved Session.
 *
 * Does NOT re-verify the JWT itself. JWT verification happens in the
 * web layer's createContext (via @supabase/ssr getUser()), which refuses
 * to return a user object for expired or tampered tokens. By the time
 * a Session lands in ctx, it has already been validated against Supabase.
 */
import { TRPCError } from '@trpc/server';
import { t } from '../trpc';
import type { Session } from '../session';

export const requireSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  // Narrow session to non-null for downstream middleware.
  const session: Session = ctx.session;
  return next({ ctx: { ...ctx, session } });
});
