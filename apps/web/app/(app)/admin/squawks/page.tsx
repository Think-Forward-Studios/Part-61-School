/**
 * /admin/squawks — fleet squawk board (MNT-04/05).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  opened_at: string;
  tail_number: string;
  aircraft_id: string;
  severity: string;
  status: string;
  title: string;
  triaged_by: string | null;
};

function statusColor(s: string): string {
  if (s === 'open') return '#dc2626';
  if (s === 'triaged') return '#b45309';
  if (s === 'deferred') return '#eab308';
  if (s === 'in_work') return '#0369a1';
  if (s === 'fixed') return '#16a34a';
  if (s === 'returned_to_service') return '#6b7280';
  return '#6b7280';
}

function sevColor(s: string): string {
  if (s === 'grounding') return '#7f1d1d';
  if (s === 'watch') return '#b45309';
  return '#0369a1';
}

export default async function AdminSquawksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.status ?? 'active';

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const statusCond =
    filter === 'active'
      ? sql`s.status not in ('returned_to_service','cancelled')`
      : filter === 'all'
        ? sql`true`
        : sql`s.status::text = ${filter}`;

  const rows = (await db.execute(sql`
    select
      s.id,
      s.opened_at,
      s.status::text as status,
      s.severity::text as severity,
      s.title,
      s.triaged_by,
      a.tail_number,
      a.id as aircraft_id
    from public.aircraft_squawk s
    join public.aircraft a on a.id = s.aircraft_id
    where s.school_id = ${me.schoolId}::uuid
      and ${statusCond}
    order by s.opened_at desc
    limit 500
  `)) as unknown as Row[];

  const chips: Array<[string, string]> = [
    ['active', 'Active'],
    ['open', 'Open'],
    ['triaged', 'Triaged'],
    ['deferred', 'Deferred (MEL)'],
    ['in_work', 'In work'],
    ['fixed', 'Fixed'],
    ['all', 'All'],
  ];

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Squawks</h1>
      </header>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
        {chips.map(([v, label]) => (
          <Link
            key={v}
            href={`/admin/squawks?status=${v}`}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 3,
              fontSize: '0.8rem',
              background: filter === v ? '#0070f3' : '#f8fafc',
              color: filter === v ? 'white' : '#1f2937',
              border: '1px solid #e5e7eb',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.4rem' }}>Opened</th>
            <th style={{ padding: '0.4rem' }}>Aircraft</th>
            <th style={{ padding: '0.4rem' }}>Severity</th>
            <th style={{ padding: '0.4rem' }}>Status</th>
            <th style={{ padding: '0.4rem' }}>Title</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                {new Date(r.opened_at).toLocaleString()}
              </td>
              <td style={{ padding: '0.4rem' }}>
                <Link href={`/admin/aircraft/${r.aircraft_id}`}>{r.tail_number}</Link>
              </td>
              <td style={{ padding: '0.4rem' }}>
                <span
                  style={{
                    background: sevColor(r.severity),
                    color: 'white',
                    padding: '0.1rem 0.45rem',
                    borderRadius: 3,
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {r.severity}
                </span>
              </td>
              <td style={{ padding: '0.4rem' }}>
                <span
                  style={{
                    background: statusColor(r.status),
                    color: 'white',
                    padding: '0.1rem 0.45rem',
                    borderRadius: 3,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  {r.status.replace('_', ' ')}
                </span>
              </td>
              <td style={{ padding: '0.4rem' }}>
                <Link href={`/admin/squawks/${r.id}`}>{r.title}</Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No squawks match the current filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
