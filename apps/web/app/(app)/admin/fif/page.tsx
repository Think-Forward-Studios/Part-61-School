import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

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

const ACTION_LINK: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.3rem 0.7rem',
  border: '1px solid rgba(56, 189, 248, 0.35)',
  background: 'rgba(56, 189, 248, 0.10)',
  color: '#38bdf8',
  borderRadius: 6,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  textDecoration: 'none',
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="Flight Instruction Forms"
        subtitle="Notices pilots must acknowledge before dispatch. Revoke to pull a notice immediately; expired notices stay here for the audit record."
        actions={
          <Link
            href="/admin/fif/new"
            style={{
              padding: '0.55rem 0.95rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            + Post Notice
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No notices posted yet.
        </div>
      ) : (
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
                <th style={TH}>Title</th>
                <th style={TH}>Severity</th>
                <th style={TH}>Posted</th>
                <th style={TH}>Effective</th>
                <th style={TH}>Expires</th>
                <th style={TH}>Acks</th>
                <th style={TH}>Status</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = sevTone(r.severity);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={{ ...TD, color: '#f7f9fc', fontWeight: 500 }}>{r.title}</td>
                    <td style={TD}>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          padding: '0.15rem 0.5rem',
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
                        {r.severity}
                      </span>
                    </td>
                    <td style={{ ...TD, fontSize: '0.78rem' }}>
                      {new Date(r.posted_at).toLocaleString()}
                    </td>
                    <td style={{ ...TD, fontSize: '0.78rem' }}>
                      {new Date(r.effective_at).toLocaleString()}
                    </td>
                    <td style={{ ...TD, fontSize: '0.78rem' }}>
                      {r.expires_at ? (
                        new Date(r.expires_at).toLocaleString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    >
                      {r.ack_count}
                    </td>
                    <td style={TD}>
                      {r.is_active ? (
                        <span style={{ color: '#34d399' }}>● Active</span>
                      ) : (
                        <span style={{ color: '#7a869a' }}>○ Inactive</span>
                      )}
                    </td>
                    <td style={TD}>
                      <Link href={`/admin/fif/${r.id}`} style={ACTION_LINK}>
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
