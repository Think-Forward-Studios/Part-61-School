/**
 * /profile/documents — personal-document page with admin scope-switching.
 *
 * Self-serve for any role. When an admin, a target-user picker appears
 * at the top so they can upload / view / delete on behalf of anyone in
 * their school. Non-admin roles operate on their own documents only
 * (picker is hidden).
 *
 * Server shell — resolves the auth user + role and hands off to the
 * client DocumentsPanel which owns the target state + queries.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DocumentsPanel } from './DocumentsPanel';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  const isAdmin = activeRole === 'admin';

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Account & School"
        title="Documents"
        subtitle={
          isAdmin
            ? 'Upload a medical, pilot license, government ID, or insurance document. As an admin you can also upload on behalf of anyone in your school — use the target picker below. Files are stored privately and retrieved only through short-lived download links.'
            : 'Upload a medical, pilot license, government ID, or insurance document. Files are stored privately and retrieved only through short-lived download links.'
        }
      />
      <DocumentsPanel currentUserId={user.id} isAdmin={isAdmin} />
    </main>
  );
}
