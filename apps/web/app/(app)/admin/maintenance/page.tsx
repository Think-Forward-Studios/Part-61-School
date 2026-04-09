/**
 * /admin/maintenance — cross-fleet maintenance dashboard (MNT-01/02/03/11).
 *
 * Lists every maintenance_item across the fleet whose status is
 * due_soon / overdue / grounding, grouped by aircraft and sorted by
 * (status severity, next_due_at asc). Read-only view; drill-in per
 * aircraft happens via /admin/aircraft/[id]/maintenance.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { maintenanceKindLabel } from '@part61/domain';

export const dynamic = 'force-dynamic';

type Row = {
  item_id: string;
  aircraft_id: string;
  tail_number: string;
  kind: string;
  title: string;
  status: string;
  next_due_at: string | null;
  next_due_hours: string | null;
};

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  if (status === 'grounding') return { bg: '#7f1d1d', fg: 'white', label: 'GROUNDING' };
  if (status === 'overdue') return { bg: '#dc2626', fg: 'white', label: 'OVERDUE' };
  if (status === 'due_soon') return { bg: '#eab308', fg: '#1f2937', label: 'DUE SOON' };
  return { bg: '#16a34a', fg: 'white', label: 'CURRENT' };
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

function fmtHours(s: string | null): string {
  if (s == null) return '—';
  return `${Number(s).toFixed(1)} hrs`;
}

export default async function AdminMaintenancePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const rows = (await db.execute(sql`
    select
      mi.id as item_id,
      mi.aircraft_id,
      a.tail_number,
      mi.kind::text as kind,
      mi.title,
      mi.status::text as status,
      mi.next_due_at,
      mi.next_due_hours::text as next_due_hours
    from public.maintenance_item mi
    join public.aircraft a on a.id = mi.aircraft_id
    where mi.school_id = ${me.schoolId}::uuid
      and mi.deleted_at is null
      and mi.status in ('due_soon','overdue','grounding')
    order by
      case mi.status
        when 'grounding' then 0
        when 'overdue' then 1
        when 'due_soon' then 2
        else 3
      end,
      mi.next_due_at nulls last,
      a.tail_number
    limit 500
  `)) as unknown as Row[];

  // Group by aircraft.
  const byAircraft = new Map<string, { tail: string; rows: Row[] }>();
  for (const r of rows) {
    const g = byAircraft.get(r.aircraft_id) ?? { tail: r.tail_number, rows: [] };
    g.rows.push(r);
    byAircraft.set(r.aircraft_id, g);
  }

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Fleet Maintenance</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/admin/ads">ADs</Link>
          <Link href="/admin/work-orders">Work Orders</Link>
          <Link href="/admin/squawks">Squawks</Link>
          <Link href="/admin/parts">Parts</Link>
          <Link href="/admin/maintenance-templates">Templates</Link>
        </div>
      </header>
      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        Every item across the fleet that is due soon, overdue, or currently grounding an
        aircraft. Items currently compliant are hidden; open an aircraft profile to view
        the full log.
      </p>

      {byAircraft.size === 0 ? (
        <p style={{ color: '#16a34a', fontSize: '1rem', marginTop: '2rem' }}>
          Fleet is fully compliant. Nothing due in the current warning window.
        </p>
      ) : null}

      {Array.from(byAircraft.entries()).map(([aircraftId, group]) => (
        <section
          key={aircraftId}
          style={{
            marginTop: '1.25rem',
            padding: '0.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <h2 style={{ margin: 0 }}>{group.tail}</h2>
            <Link
              href={`/admin/aircraft/${aircraftId}/maintenance`}
              style={{ fontSize: '0.85rem' }}
            >
              Open maintenance tab →
            </Link>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Kind</th>
                <th style={{ padding: '0.4rem' }}>Title</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
                <th style={{ padding: '0.4rem' }}>Next due (date)</th>
                <th style={{ padding: '0.4rem' }}>Next due (hours)</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => {
                const s = statusStyle(r.status);
                return (
                  <tr key={r.item_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.4rem' }}>{maintenanceKindLabel(r.kind)}</td>
                    <td style={{ padding: '0.4rem' }}>{r.title}</td>
                    <td style={{ padding: '0.4rem' }}>
                      <span
                        style={{
                          background: s.bg,
                          color: s.fg,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 3,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem' }}>{fmtDate(r.next_due_at)}</td>
                    <td style={{ padding: '0.4rem' }}>{fmtHours(r.next_due_hours)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
