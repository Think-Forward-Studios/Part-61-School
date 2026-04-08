import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * AdminGuard (Pitfall 13).
 *
 * Server-side check: only callers whose active_role cookie is 'admin'
 * can access anything under /admin. Non-admins get a 404 (not a 403)
 * so we don't leak which routes exist. Defense-in-depth — every
 * admin.* tRPC procedure also enforces adminProcedure.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'admin') {
    notFound();
  }
  return (
    <div>
      <nav
        style={{
          display: 'flex',
          gap: '1rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #eee',
          background: '#fafafa',
        }}
      >
        <Link href="/admin/dashboard">Dashboard</Link>
        <Link href="/admin/people">People</Link>
        <Link href="/admin/people/pending">Pending</Link>
        <Link href="/admin/aircraft">Aircraft</Link>
        <Link href="/admin/school">School Settings</Link>
      </nav>
      {children}
    </div>
  );
}
