/**
 * /admin/audit/logs — general-purpose audit_log query UI (REP-01).
 *
 * Server component that renders a client child for interactive filtering
 * and keyset pagination. Filters persist in URL params.
 *
 * Banned-term note: column headers avoid "approved" — we label the
 * reservation approver column as "Authorizer" everywhere user-facing.
 */
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { AuditLogsClient } from './AuditLogsClient';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Audit"
        title="Audit log"
        subtitle="Filter changes across every safety-relevant table by actor, table, record, or date."
      />
      <AuditLogsClient
        initialUserId={one(params.user)}
        initialTable={one(params.table)}
        initialRecord={one(params.record)}
        initialAction={one(params.action)}
        initialFrom={one(params.from)}
        initialTo={one(params.to)}
      />
    </main>
  );
}
