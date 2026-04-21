import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * AdminGuard (Pitfall 13).
 *
 * Server-side check: only callers whose active_role cookie is 'admin'
 * can access anything under /admin. Non-admins get a 404 (not a 403)
 * so we don't leak which routes exist. Defense-in-depth — every
 * admin.* tRPC procedure also enforces adminProcedure.
 *
 * The admin sub-nav moved up to `(app)/layout.tsx` (via AdminSubNav)
 * so it also renders on cross-role pages like /record, /flight-log,
 * /fleet-map, and /profile/*. This layout is now just the guard.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'admin') {
    notFound();
  }
  return <>{children}</>;
}
