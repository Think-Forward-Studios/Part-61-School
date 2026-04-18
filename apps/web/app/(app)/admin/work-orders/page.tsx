/**
 * /admin/work-orders — fleet work-order list (MNT-09).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { maintenanceKindLabel } from '@part61/domain';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  created_at: string;
  kind: string;
  status: string;
  title: string;
  tail_number: string;
  aircraft_id: string;
  total_tasks: number;
  done_tasks: number;
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
  draft: { bg: 'rgba(122, 134, 154, 0.14)', fg: '#7a869a' },
  open: { bg: 'rgba(56, 189, 248, 0.12)', fg: '#38bdf8' },
  in_progress: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  pending_signoff: { bg: 'rgba(167, 139, 250, 0.15)', fg: '#a78bfa' },
  closed: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' },
};

export default async function AdminWorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.status ?? 'all';

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const statusCond = filter === 'all' ? sql`true` : sql`wo.status::text = ${filter}`;

  const rows = (await db.execute(sql`
    select
      wo.id,
      wo.created_at,
      wo.kind::text as kind,
      wo.status::text as status,
      wo.title,
      a.tail_number,
      a.id as aircraft_id,
      (select count(*)::int from public.work_order_task t
         where t.work_order_id = wo.id and t.deleted_at is null) as total_tasks,
      (select count(*)::int from public.work_order_task t
         where t.work_order_id = wo.id and t.deleted_at is null and t.completed_at is not null) as done_tasks
    from public.work_order wo
    join public.aircraft a on a.id = wo.aircraft_id
    where wo.school_id = ${me.schoolId}::uuid
      and wo.deleted_at is null
      and ${statusCond}
    order by wo.created_at desc
    limit 300
  `)) as unknown as Row[];

  const chips: Array<[string, string]> = [
    ['all', 'All'],
    ['open', 'Open'],
    ['in_progress', 'In progress'],
    ['pending_signoff', 'Pending sign-off'],
    ['closed', 'Closed'],
  ];

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Work Orders"
        subtitle={`${rows.length} ${rows.length === 1 ? 'order' : 'orders'} matching filter.`}
      />
      <div style={{ display: 'flex', gap: '0.4rem', margin: '0 0 1.25rem', flexWrap: 'wrap' }}>
        {chips.map(([v, label]) => {
          const active = filter === v;
          return (
            <Link
              key={v}
              href={`/admin/work-orders?status=${v}`}
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
          No work orders match the current filter.
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
                <th style={TH}>Created</th>
                <th style={TH}>Aircraft</th>
                <th style={TH}>Title</th>
                <th style={TH}>Kind</th>
                <th style={TH}>Status</th>
                <th style={TH}>Tasks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = STATUS_TONE[r.status] ?? {
                  bg: 'rgba(122, 134, 154, 0.14)',
                  fg: '#7a869a',
                };
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={MONO_TD}>{new Date(r.created_at).toLocaleDateString()}</td>
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
                      <Link
                        href={`/admin/work-orders/${r.id}`}
                        style={{ color: '#38bdf8', textDecoration: 'none' }}
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td style={MONO_TD}>{maintenanceKindLabel(r.kind)}</td>
                    <td style={TD}>
                      <span
                        style={{
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
                        }}
                      >
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={MONO_TD}>
                      {r.done_tasks} / {r.total_tasks}
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
