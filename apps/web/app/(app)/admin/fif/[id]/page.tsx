import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, fifNotice } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RevokeFifButton } from './RevokeFifButton';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

type AckRow = {
  user_id: string;
  email: string;
  acknowledged_at: string;
};

function sevColor(sev: string): string {
  if (sev === 'critical') return '#b91c1c';
  if (sev === 'important') return '#b45309';
  return '#0369a1';
}

export default async function AdminFifDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const notice = (
    await db
      .select()
      .from(fifNotice)
      .where(
        and(eq(fifNotice.id, id), eq(fifNotice.schoolId, me.schoolId), isNull(fifNotice.deletedAt)),
      )
      .limit(1)
  )[0];
  if (!notice) notFound();

  const acks = (await db.execute(sql`
    select a.user_id, u.email, a.acknowledged_at
      from public.fif_acknowledgement a
      join public.users u on u.id = a.user_id
     where a.notice_id = ${id}::uuid
     order by a.acknowledged_at desc
  `)) as unknown as AckRow[];

  const now = new Date();
  const isActive =
    notice.effectiveAt.getTime() <= now.getTime() &&
    (notice.expiresAt == null || notice.expiresAt.getTime() > now.getTime());

  return (
    <main style={{ padding: '1rem', maxWidth: 900 }}>
      <p>
        <Link href="/admin/fif">← Back to notices</Link>
      </p>
      <header style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>{notice.title}</h1>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'white',
            background: sevColor(notice.severity),
            padding: '0.15rem 0.5rem',
            borderRadius: 3,
            textTransform: 'uppercase',
          }}
        >
          {notice.severity}
        </span>
        {isActive ? (
          <span style={{ color: '#16a34a', fontSize: '0.85rem' }}>● Active</span>
        ) : (
          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>○ Inactive</span>
        )}
      </header>

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          background: 'white',
          whiteSpace: 'pre-wrap',
          fontSize: '0.9rem',
        }}
      >
        {notice.body}
      </section>

      <section style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#374151' }}>
        <div>
          <strong>Posted:</strong> {notice.postedAt.toLocaleString()}
        </div>
        <div>
          <strong>Effective:</strong> {notice.effectiveAt.toLocaleString()}
        </div>
        <div>
          <strong>Expires:</strong>{' '}
          {notice.expiresAt ? notice.expiresAt.toLocaleString() : '— never'}
        </div>
      </section>

      {isActive ? (
        <section style={{ marginTop: '1rem' }}>
          <RevokeFifButton noticeId={notice.id} />
        </section>
      ) : null}

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Acknowledgements ({acks.length})</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>User</th>
              <th style={{ padding: '0.5rem' }}>Acknowledged</th>
            </tr>
          </thead>
          <tbody>
            {acks.map((a) => (
              <tr key={a.user_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>{a.email}</td>
                <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                  {new Date(a.acknowledged_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {acks.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ padding: '0.75rem', color: '#666', fontSize: '0.85rem' }}>
                  No acknowledgements yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
