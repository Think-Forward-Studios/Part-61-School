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
import { PageHeader } from '@/components/ui';

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

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  grounding: { bg: 'rgba(248, 113, 113, 0.2)', fg: '#f87171', label: 'GROUNDING' },
  overdue: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171', label: 'OVERDUE' },
  due_soon: { bg: 'rgba(251, 191, 36, 0.14)', fg: '#fbbf24', label: 'DUE SOON' },
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

function fmtHours(s: string | null): string {
  if (s == null) return '—';
  return `${Number(s).toFixed(1)} hrs`;
}

const NAV_LINK: React.CSSProperties = {
  color: '#cbd5e1',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  padding: '0.4rem 0.7rem',
  borderRadius: 6,
  border: '1px solid #1f2940',
  background: '#0d1220',
};

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Fleet Maintenance"
        subtitle="Every item across the fleet that is due soon, overdue, or currently grounding an aircraft. Items currently compliant are hidden; open an aircraft profile to view the full log."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/admin/ads" style={NAV_LINK}>
              ADs
            </Link>
            <Link href="/admin/work-orders" style={NAV_LINK}>
              Work Orders
            </Link>
            <Link href="/admin/squawks" style={NAV_LINK}>
              Squawks
            </Link>
            <Link href="/admin/parts" style={NAV_LINK}>
              Parts
            </Link>
            <Link href="/admin/maintenance-templates" style={NAV_LINK}>
              Templates
            </Link>
          </div>
        }
      />

      {byAircraft.size === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#34d399',
            fontSize: '0.95rem',
            background: 'rgba(52, 211, 153, 0.06)',
            border: '1px dashed rgba(52, 211, 153, 0.3)',
            borderRadius: 12,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.05em',
          }}
        >
          ✓ Fleet is fully compliant. Nothing due in the current warning window.
        </div>
      ) : null}

      {Array.from(byAircraft.entries()).map(([aircraftId, group]) => (
        <section
          key={aircraftId}
          style={{
            marginTop: '1.25rem',
            padding: '1rem 1.1rem',
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: '"Antonio", system-ui, sans-serif',
                fontSize: '1.1rem',
                color: '#f7f9fc',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              {group.tail}
            </h2>
            <Link
              href={`/admin/aircraft/${aircraftId}/maintenance`}
              style={{
                fontSize: '0.72rem',
                color: '#38bdf8',
                textDecoration: 'none',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Open maintenance tab →
            </Link>
          </div>
          <div
            style={{
              background: '#05070e',
              border: '1px solid #161d30',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>Kind</th>
                  <th style={TH}>Title</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Next due (date)</th>
                  <th style={TH}>Next due (hours)</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => {
                  const tone = STATUS_TONE[r.status] ?? {
                    bg: '#1a2238',
                    fg: '#7a869a',
                    label: r.status.toUpperCase(),
                  };
                  return (
                    <tr key={r.item_id} style={{ borderBottom: '1px solid #161d30' }}>
                      <td style={TD}>{maintenanceKindLabel(r.kind)}</td>
                      <td style={{ ...TD, color: '#f7f9fc' }}>{r.title}</td>
                      <td style={TD}>
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '0.15rem 0.55rem',
                            borderRadius: 4,
                            background: tone.bg,
                            color: tone.fg,
                            fontSize: '0.68rem',
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            letterSpacing: '0.1em',
                            fontWeight: 600,
                          }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: '0.76rem',
                        }}
                      >
                        {fmtDate(r.next_due_at)}
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: '0.76rem',
                        }}
                      >
                        {fmtHours(r.next_due_hours)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
