/**
 * tRPC root — shared Context shape and initTRPC instance.
 *
 * Context:
 *   session     — resolved Session or null for public procedures
 *   supabase    — request-scoped Supabase SSR client (anon-key, user-authed)
 *   tx          — optional Drizzle transaction handle (set by withTenantTx)
 *   rawJwt      — raw access token string (used by auth router when it
 *                 needs to forward the caller identity to Supabase admin
 *                 APIs or audit logs)
 */
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import type { Session } from './session';

// Loose type for the Supabase client — the concrete type lives in the
// web layer, which passes an instance into createContext. Typing it as
// `unknown` here keeps @part61/api free of a direct @supabase/ssr dep.
export interface TRPCContext {
  session: Session | null;
  supabase: unknown;
  tx?: unknown;
  rawJwt?: string;
}

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
});

export const router = t.router;
export const publicProcedure = t.procedure;
