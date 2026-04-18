import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DispatchBoard } from './DispatchBoard';
import { CueSubscriber } from '@/components/dispatch/CueSubscriber';
import { PageHeader } from '@/components/ui';

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader eyebrow="Operations" title="Dispatch" subtitle="Live · refreshes every 15s" />
      <DispatchBoard />
      <CueSubscriber />
    </main>
  );
}
