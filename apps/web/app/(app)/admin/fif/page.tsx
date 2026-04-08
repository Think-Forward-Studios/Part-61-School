import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  title: string;
  severity: string;
  posted_at: string;
  effective_at: string;
  expires_at: string | null;
  ack_count: number;
  is_active: boolean;
};

function sevColor(sev: string): string {
  if (sev === 'critical') return '#b91c1c';
  if (sev === 'important') return '#b45309';
  return '#0369a1';
}

export default async function AdminFifPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const rows = (await db.execute(sql`
    select
      n.id,
      n.title,
      n.severity::text as severity,
      n.posted_at,
      n.effective_at,
      n.expires_at,
      (select count(*)::int
         from public.fif_acknowledgement a
         where a.notice_id = n.id) as ack_count,
      (n.effective_at <= now()
        and (n.expires_at is null or n.expires_at > now())) as is_active
    from public.fif_notice n
    where n.school_id = ${me.schoolId}::uuid
      and n.deleted_at is null
    order by n.posted_at desc
    limit 500
  `)) as unknown as Row[];

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1>Flight Information File</h1>
        <Link
          href="/admin/fif/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          + Post notice
        </Link>
      </header>
      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        Notices pilots must acknowledge before dispatch. Revoke to pull a notice immediately;
        expired notices stay here for the audit record.
      </p>
      <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Title</th>
            <th style={{ padding: '0.5rem' }}>Severity</th>
            <th style={{ padding: '0.5rem' }}>Posted</th>
            <th style={{ padding: '0.5rem' }}>Effective</th>
            <th style={{ padding: '0.5rem' }}>Expires</th>
            <th style={{ padding: '0.5rem' }}>Acks</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
            <th style={{ padding: '0.5rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{r.title}</td>
              <td style={{ padding: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'white',
                    background: sevColor(r.severity),
                    padding: '0.1rem 0.4rem',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                  }}
                >
                  {r.severity}
                </span>
              </td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {new Date(r.posted_at).toLocaleString()}
              </td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {new Date(r.effective_at).toLocaleString()}
              </td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {r.expires_at ? new Date(r.expires_at).toLocaleString() : '—'}
              </td>
              <td style={{ padding: '0.5rem' }}>{r.ack_count}</td>
              <td style={{ padding: '0.5rem' }}>
                {r.is_active ? (
                  <span style={{ color: '#16a34a' }}>● Active</span>
                ) : (
                  <span style={{ color: '#6b7280' }}>○ Inactive</span>
                )}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <Link href={`/admin/fif/${r.id}`}>Open</Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: '0.75rem', color: '#666' }}>
                No notices posted yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
