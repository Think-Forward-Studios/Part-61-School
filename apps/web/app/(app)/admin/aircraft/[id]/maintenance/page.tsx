/**
 * /admin/aircraft/[id]/maintenance — per-aircraft CAMP tab.
 *
 * Three sections: Maintenance Items (grouped by status), ADs
 * (aircraft_ad_compliance), Components (aircraft_component). Each
 * maintenance item has a "Complete" button that opens a modal
 * calling admin.maintenance.complete (mechanic + signer snapshot).
 */
import { and, eq, isNull } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  db,
  users,
  aircraft,
  maintenanceItem,
  aircraftAdCompliance,
  aircraftComponent,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { maintenanceKindLabel } from '@part61/domain';
import { CompleteMaintenanceButton } from './CompleteMaintenanceButton';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

function statusBadge(status: string | null | undefined) {
  const s = status ?? 'current';
  const map: Record<string, { bg: string; fg: string }> = {
    current: { bg: '#16a34a', fg: 'white' },
    due_soon: { bg: '#eab308', fg: '#1f2937' },
    overdue: { bg: '#dc2626', fg: 'white' },
    grounding: { bg: '#7f1d1d', fg: 'white' },
    not_applicable: { bg: '#6b7280', fg: 'white' },
  };
  const c = map[s] ?? { bg: '#6b7280', fg: 'white' };
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: '0.15rem 0.45rem',
        borderRadius: 3,
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {s.replace('_', ' ')}
    </span>
  );
}

export default async function AircraftMaintenancePage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const ac = (
    await db
      .select()
      .from(aircraft)
      .where(and(eq(aircraft.id, id), eq(aircraft.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!ac) notFound();

  const items = await db
    .select()
    .from(maintenanceItem)
    .where(
      and(
        eq(maintenanceItem.aircraftId, id),
        eq(maintenanceItem.schoolId, me.schoolId),
        isNull(maintenanceItem.deletedAt),
      ),
    );

  const adCompliance = await db
    .select()
    .from(aircraftAdCompliance)
    .where(
      and(
        eq(aircraftAdCompliance.aircraftId, id),
        eq(aircraftAdCompliance.schoolId, me.schoolId),
      ),
    );

  const components = await db
    .select()
    .from(aircraftComponent)
    .where(
      and(
        eq(aircraftComponent.aircraftId, id),
        eq(aircraftComponent.schoolId, me.schoolId),
        isNull(aircraftComponent.deletedAt),
      ),
    );

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header style={{ marginBottom: '1rem' }}>
        <Link href={`/admin/aircraft/${id}`}>← Back to {ac.tailNumber}</Link>
        <h1 style={{ margin: '0.5rem 0 0 0' }}>{ac.tailNumber} — Maintenance</h1>
      </header>

      <section
        style={{
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Maintenance Items</h2>
        {items.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            No items yet. Apply a maintenance template to seed the standard set.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Kind</th>
                <th style={{ padding: '0.4rem' }}>Title</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
                <th style={{ padding: '0.4rem' }}>Last completed</th>
                <th style={{ padding: '0.4rem' }}>Next due</th>
                <th style={{ padding: '0.4rem' }}>Next due (hrs)</th>
                <th style={{ padding: '0.4rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    {maintenanceKindLabel(it.kind)}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{it.title}</td>
                  <td style={{ padding: '0.4rem' }}>{statusBadge(it.status)}</td>
                  <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                    {it.lastCompletedAt
                      ? new Date(it.lastCompletedAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                    {it.nextDueAt
                      ? new Date(it.nextDueAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                    {it.nextDueHours != null
                      ? Number(it.nextDueHours).toFixed(1)
                      : '—'}
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    <CompleteMaintenanceButton
                      itemId={it.id}
                      itemTitle={it.title}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section
        style={{
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Airworthiness Directives</h2>
        {adCompliance.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            No AD compliance rows for this aircraft. Apply an AD from the catalog.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>AD</th>
                <th style={{ padding: '0.4rem' }}>Applicable</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
                <th style={{ padding: '0.4rem' }}>First due</th>
              </tr>
            </thead>
            <tbody>
              {adCompliance.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    <Link href={`/admin/ads/${c.adId}`}>{c.adId.slice(0, 8)}</Link>
                  </td>
                  <td style={{ padding: '0.4rem' }}>{c.applicable ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '0.4rem' }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                    {c.firstDueAt
                      ? new Date(c.firstDueAt).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section
        style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: 6 }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Components</h2>
        {components.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            No serial-tracked components installed.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Kind</th>
                <th style={{ padding: '0.4rem' }}>Serial</th>
                <th style={{ padding: '0.4rem' }}>Part #</th>
                <th style={{ padding: '0.4rem' }}>Life limit (hrs)</th>
                <th style={{ padding: '0.4rem' }}>Installed</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>{c.kind}</td>
                  <td style={{ padding: '0.4rem' }}>{c.serialNumber ?? '—'}</td>
                  <td style={{ padding: '0.4rem' }}>{c.partNumber ?? '—'}</td>
                  <td style={{ padding: '0.4rem' }}>
                    {c.lifeLimitHours != null
                      ? Number(c.lifeLimitHours).toFixed(1)
                      : '—'}
                  </td>
                  <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                    {c.installedAtDate ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
