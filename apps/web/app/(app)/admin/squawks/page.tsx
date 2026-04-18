/**
 * /admin/squawks — fleet squawk board (MNT-04/05).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

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

const MONO_TD: React.CSSProperties = {
  ...TD,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.76rem',
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  open: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' },
  triaged: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  deferred: { bg: 'rgba(251, 191, 36, 0.08)', fg: '#fbbf24' },
  in_work: { bg: 'rgba(56, 189, 248, 0.12)', fg: '#38bdf8' },
  fixed: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' },
  returned_to_service: { bg: 'rgba(122, 134, 154, 0.14)', fg: '#7a869a' },
  cancelled: { bg: 'rgba(122, 134, 154, 0.14)', fg: '#7a869a' },
};

const SEV_TONE: Record<string, { bg: string; fg: string }> = {
  grounding: { bg: 'rgba(248, 113, 113, 0.2)', fg: '#fca5a5' },
  watch: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  monitor: { bg: 'rgba(56, 189, 248, 0.12)', fg: '#38bdf8' },
};

function chipStyle(tone: { bg: string; fg: string }): React.CSSProperties {
  return {
    display: 'inline-flex',
    background: tone.bg,
    color: tone.fg,
    padding: '0.18rem 0.55rem',
    borderRadius: 4,
    fontSize: '0.68rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
  };
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Squawks"
        subtitle={`${rows.length} ${rows.length === 1 ? 'squawk' : 'squawks'} matching filter.`}
      />
      <div style={{ display: 'flex', gap: '0.4rem', margin: '0 0 1.25rem', flexWrap: 'wrap' }}>
        {chips.map(([v, label]) => {
          const active = filter === v;
          return (
            <Link
              key={v}
              href={`/admin/squawks?status=${v}`}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 6,
                fontSize: '0.72rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 500,
                background: active ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                color: active ? '#fbbf24' : '#7a869a',
                border: `1px solid ${active ? '#fbbf24' : '#1a2238'}`,
                textDecoration: 'none',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

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
          No squawks match the current filter.
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Opened</th>
                <th style={TH}>Aircraft</th>
                <th style={TH}>Severity</th>
                <th style={TH}>Status</th>
                <th style={TH}>Title</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const statusTone = STATUS_TONE[r.status] ?? {
                  bg: 'rgba(122, 134, 154, 0.14)',
                  fg: '#7a869a',
                };
                const sevTone = SEV_TONE[r.severity] ?? {
                  bg: 'rgba(122, 134, 154, 0.14)',
                  fg: '#7a869a',
                };
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={MONO_TD}>{new Date(r.opened_at).toLocaleString()}</td>
                    <td style={TD}>
                      <Link
                        href={`/admin/aircraft/${r.aircraft_id}`}
                        style={{
                          color: '#f7f9fc',
                          textDecoration: 'none',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontWeight: 600,
                        }}
                      >
                        {r.tail_number}
                      </Link>
                    </td>
                    <td style={TD}>
                      <span style={chipStyle(sevTone)}>{r.severity}</span>
                    </td>
                    <td style={TD}>
                      <span style={chipStyle(statusTone)}>{r.status.replace('_', ' ')}</span>
                    </td>
                    <td style={TD}>
                      <Link
                        href={`/admin/squawks/${r.id}`}
                        style={{ color: '#38bdf8', textDecoration: 'none' }}
                      >
                        {r.title}
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
