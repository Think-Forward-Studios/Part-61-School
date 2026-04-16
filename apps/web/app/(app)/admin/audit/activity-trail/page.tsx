/**
 * /admin/audit/activity-trail — REP-02 training activity trail UI.
 *
 * Server wrapper; the client child handles URL-param filters and keyset
 * pagination against the public.training_activity_trail view.
 *
 * Banned-term note: we display the "approved_by" column as "Authorizer"
 * in the UI table per Phase 3 precedent.
 */
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ActivityTrailClient } from './ActivityTrailClient';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ActivityTrailPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  return (
    <main style={{ padding: '1rem', maxWidth: 1400 }}>
      <h1>Training activity trail</h1>
      <p style={{ color: '#4b5563', fontSize: '0.85rem' }}>
        Scheduler, authorizer, ramp-out, ramp-in, and close-out for every reservation.
      </p>
      <ActivityTrailClient
        initialStudent={one(params.student)}
        initialInstructor={one(params.instructor)}
        initialBase={one(params.base)}
        initialFrom={one(params.from)}
        initialTo={one(params.to)}
      />
    </main>
  );
}
