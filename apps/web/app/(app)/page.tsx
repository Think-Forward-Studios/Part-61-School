/**
 * `/` — Phase 8 (08-02) role redirect shim.
 *
 * Post-login landing redirects to the role-appropriate dashboard:
 *   - admin    → /admin/dashboard
 *   - student  → /dashboard
 *   - instructor → /dashboard
 *   - mechanic → /dashboard
 *
 * The original role-switched dashboard at this path moved to
 * `/dashboard/page.tsx` (which dispatches between
 * StudentDashboard / InstructorDashboard / MechanicDashboard client
 * components). Unauthenticated callers are already handled by the
 * `(app)/layout.tsx` guard above.
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function RootRedirectPage() {
  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value ?? 'student';
  if (activeRole === 'admin') redirect('/admin/dashboard');
  redirect('/dashboard');
}
