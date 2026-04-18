import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, fifNotice } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RevokeFifButton } from './RevokeFifButton';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

type AckRow = {
  user_id: string;
  email: string;
  acknowledged_at: string;
};

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

const BACK_LINK: React.CSSProperties = {
  display: 'inline-block',
  color: '#7a869a',
  textDecoration: 'none',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
};

const SECTION_HEADING: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontFamily: '"Barlow Condensed", system-ui, sans-serif',
  fontSize: '0.95rem',
  letterSpacing: '0.08em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

function sevTone(sev: string): { bg: string; fg: string; border: string } {
  if (sev === 'critical')
    return {
      bg: 'rgba(248, 113, 113, 0.14)',
      fg: '#f87171',
      border: 'rgba(248, 113, 113, 0.35)',
    };
  if (sev === 'important')
    return {
      bg: 'rgba(251, 191, 36, 0.12)',
      fg: '#fbbf24',
      border: 'rgba(251, 191, 36, 0.35)',
    };
  return {
    bg: 'rgba(56, 189, 248, 0.12)',
    fg: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.35)',
  };
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

  const tone = sevTone(notice.severity);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href="/admin/fif" style={BACK_LINK}>
        ← Back to notices
      </Link>
      <PageHeader
        eyebrow="Training"
        title={notice.title}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.66rem',
                padding: '0.18rem 0.55rem',
                borderRadius: 999,
                background: tone.bg,
                color: tone.fg,
                border: `1px solid ${tone.border}`,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {notice.severity}
            </span>
            {isActive ? (
              <span style={{ color: '#34d399', fontSize: '0.85rem' }}>● Active</span>
            ) : (
              <span style={{ color: '#7a869a', fontSize: '0.85rem' }}>○ Inactive</span>
            )}
          </div>
        }
      />

      <section
        style={{
          marginTop: '0.5rem',
          padding: '1rem',
          border: '1px solid #1f2940',
          borderRadius: 10,
          background: '#0d1220',
          whiteSpace: 'pre-wrap',
          fontSize: '0.9rem',
          color: '#cbd5e1',
        }}
      >
        {notice.body}
      </section>

      <section
        style={{
          marginTop: '1rem',
          fontSize: '0.85rem',
          color: '#cbd5e1',
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '0.35rem 1rem',
        }}
      >
        <strong style={{ color: '#7a869a' }}>Posted:</strong>
        <span>{notice.postedAt.toLocaleString()}</span>
        <strong style={{ color: '#7a869a' }}>Effective:</strong>
        <span>{notice.effectiveAt.toLocaleString()}</span>
        <strong style={{ color: '#7a869a' }}>Expires:</strong>
        <span>
          {notice.expiresAt ? (
            notice.expiresAt.toLocaleString()
          ) : (
            <span style={{ color: '#5b6784' }}>— never</span>
          )}
        </span>
      </section>

      {isActive ? (
        <section style={{ marginTop: '1rem' }}>
          <RevokeFifButton noticeId={notice.id} />
        </section>
      ) : null}

      <section style={{ marginTop: '2rem' }}>
        <h2 style={SECTION_HEADING}>Acknowledgements ({acks.length})</h2>
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>User</th>
                <th style={TH}>Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {acks.map((a) => (
                <tr key={a.user_id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.78rem',
                      color: '#f7f9fc',
                    }}
                  >
                    {a.email}
                  </td>
                  <td style={{ ...TD, fontSize: '0.8rem' }}>
                    {new Date(a.acknowledged_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {acks.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    style={{
                      ...TD,
                      color: '#7a869a',
                      textAlign: 'center',
                      fontSize: '0.85rem',
                      padding: '1.5rem',
                    }}
                  >
                    No acknowledgements yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
