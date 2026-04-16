import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ActiveSessionsClient } from './_components/ActiveSessionsClient';

export const dynamic = 'force-dynamic';

export default async function ActiveSessionsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'admin') notFound();

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1 style={{ margin: '0 0 1rem' }}>Active Sessions</h1>
      <ActiveSessionsClient />
    </main>
  );
}
