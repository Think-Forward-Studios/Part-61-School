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
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <h1>Audit log</h1>
      <p style={{ color: '#4b5563', fontSize: '0.85rem' }}>
        Filter changes across every safety-relevant table by actor, table, record, or date.
      </p>
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
