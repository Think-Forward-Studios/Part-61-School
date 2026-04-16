import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DispatchBoard } from './DispatchBoard';
import { CueSubscriber } from '@/components/dispatch/CueSubscriber';

export const dynamic = 'force-dynamic';

/**
 * /dispatch — flight-line operations hub (FTR-01..04).
 *
 * Server guard: instructor or admin only. Defense-in-depth: every
 * dispatch.* tRPC procedure also runs through instructorOrAdminProcedure.
 */
export default async function DispatchPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'instructor' && activeRole !== 'admin') {
    notFound();
  }

  return (
    <main style={{ padding: '1rem', maxWidth: 1600 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Dispatch</h1>
        <span style={{ color: '#666', fontSize: '0.85rem' }}>Live · refreshes every 15s</span>
      </header>
      <DispatchBoard />
      <CueSubscriber />
    </main>
  );
}
