/**
 * API test helper — build a tRPC caller bound to a synthetic Session.
 *
 * The api tests run against the real local Postgres (same instance as
 * the RLS tests) via @part61/db's `db` singleton. withTenantTx opens
 * a transaction and sets the school/user/role GUCs so RLS and audit
 * triggers see the right caller.
 *
 * Tests DO need DATABASE_URL / DIRECT_DATABASE_URL in the env. Vitest
 * config in this package picks them up from .env.local / .env the same
 * way the RLS tests do.
 */
import { appRouter } from '@part61/api';
import type { Session, Role } from '@part61/api';

export interface TestCallerOpts {
  userId: string;
  schoolId: string;
  email?: string;
  roles?: Role[];
  activeRole?: Role;
  activeBaseId?: string | null;
}

export function adminCaller(opts: TestCallerOpts) {
  const session: Session = {
    userId: opts.userId,
    schoolId: opts.schoolId,
    email: opts.email ?? 'admin@test.local',
    roles: opts.roles ?? ['admin'],
    activeRole: opts.activeRole ?? 'admin',
    activeBaseId: opts.activeBaseId ?? null,
  };
  return appRouter.createCaller({
    session,
    supabase: null,
  });
}

export function publicCaller() {
  return appRouter.createCaller({
    session: null,
    supabase: null,
  });
}
