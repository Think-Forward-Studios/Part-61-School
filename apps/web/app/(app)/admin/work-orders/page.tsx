/**
 * /admin/work-orders — fleet work-order list (MNT-09).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { maintenanceKindLabel } from '@part61/domain';

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

function statusColor(s: string): string {
  if (s === 'draft') return '#6b7280';
  if (s === 'open') return '#0369a1';
  if (s === 'in_progress') return '#b45309';
  if (s === 'pending_signoff') return '#7c3aed';
  if (s === 'closed') return '#16a34a';
  return '#6b7280';
}

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

  const statusCond =
    filter === 'all' ? sql`true` : sql`wo.status::text = ${filter}`;

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
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <h1>Work Orders</h1>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
        {chips.map(([v, label]) => (
          <Link
            key={v}
            href={`/admin/work-orders?status=${v}`}
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
            <th style={{ padding: '0.4rem' }}>Created</th>
            <th style={{ padding: '0.4rem' }}>Aircraft</th>
            <th style={{ padding: '0.4rem' }}>Title</th>
            <th style={{ padding: '0.4rem' }}>Kind</th>
            <th style={{ padding: '0.4rem' }}>Status</th>
            <th style={{ padding: '0.4rem' }}>Tasks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                {new Date(r.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '0.4rem' }}>
                <Link href={`/admin/aircraft/${r.aircraft_id}`}>{r.tail_number}</Link>
              </td>
              <td style={{ padding: '0.4rem' }}>
                <Link href={`/admin/work-orders/${r.id}`}>{r.title}</Link>
              </td>
              <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                {maintenanceKindLabel(r.kind)}
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
              <td style={{ padding: '0.4rem', fontSize: '0.85rem' }}>
                {r.done_tasks} / {r.total_tasks}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No work orders match the current filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
