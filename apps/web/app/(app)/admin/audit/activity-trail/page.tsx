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
import { PageHeader } from '@/components/ui';
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Audit"
        title="Training activity trail"
        subtitle="Scheduler, authorizer, ramp-out, ramp-in, and close-out for every reservation."
      />
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
