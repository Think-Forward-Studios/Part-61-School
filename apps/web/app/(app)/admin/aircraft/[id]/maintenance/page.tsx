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
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

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

const SECTION: React.CSSProperties = {
  padding: '1rem 1.25rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
  marginBottom: '1rem',
};

const STATUS_HUE: Record<string, { bg: string; fg: string }> = {
  current: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' },
  due_soon: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  overdue: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' },
  grounding: { bg: 'rgba(248, 113, 113, 0.2)', fg: '#fca5a5' },
  not_applicable: { bg: 'rgba(122, 134, 154, 0.14)', fg: '#7a869a' },
};

function statusBadge(status: string | null | undefined) {
  const s = status ?? 'current';
  const tone = STATUS_HUE[s] ?? STATUS_HUE.not_applicable ?? { bg: '#1a2238', fg: '#7a869a' };
  return (
    <span
      style={{
        background: tone.bg,
        color: tone.fg,
        padding: '0.18rem 0.55rem',
        borderRadius: 4,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: '0.68rem',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      {s.replace('_', ' ')}
    </span>
  );
}

function emptyCell(text: string) {
  return (
    <div
      style={{
        padding: '1.5rem 0.5rem',
        textAlign: 'center',
        color: '#7a869a',
        fontSize: '0.85rem',
        background: '#0d1220',
        border: '1px dashed #1f2940',
        borderRadius: 8,
      }}
    >
      {text}
    </div>
  );
}

export default async function AircraftMaintenancePage({ params }: { params: Params }) {
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
      and(eq(aircraftAdCompliance.aircraftId, id), eq(aircraftAdCompliance.schoolId, me.schoolId)),
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link
          href={`/admin/aircraft/${id}`}
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontSize: '0.78rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          ← Back to {ac.tailNumber}
        </Link>
      </div>
      <PageHeader
        eyebrow="Maintenance"
        title={`${ac.tailNumber} — Maintenance`}
        subtitle="Items, ADs, and serial-tracked components for this airframe."
      />

      <section style={SECTION}>
        <h2 style={{ margin: '0 0 0.75rem 0', color: '#f7f9fc', fontSize: '1rem' }}>
          Maintenance Items
        </h2>
        {items.length === 0 ? (
          emptyCell('No items yet. Apply a maintenance template to seed the standard set.')
        ) : (
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>Kind</th>
                  <th style={TH}>Title</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Last completed</th>
                  <th style={TH}>Next due</th>
                  <th style={TH}>Next due (hrs)</th>
                  <th style={TH}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>{maintenanceKindLabel(it.kind)}</td>
                    <td style={TD}>{it.title}</td>
                    <td style={TD}>{statusBadge(it.status)}</td>
                    <td style={MONO_TD}>
                      {it.lastCompletedAt ? (
                        new Date(it.lastCompletedAt).toLocaleDateString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={MONO_TD}>
                      {it.nextDueAt ? (
                        new Date(it.nextDueAt).toLocaleDateString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={MONO_TD}>
                      {it.nextDueHours != null ? (
                        Number(it.nextDueHours).toFixed(1)
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem' }}>
                      <CompleteMaintenanceButton itemId={it.id} itemTitle={it.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={SECTION}>
        <h2 style={{ margin: '0 0 0.75rem 0', color: '#f7f9fc', fontSize: '1rem' }}>
          Airworthiness Directives
        </h2>
        {adCompliance.length === 0 ? (
          emptyCell('No AD compliance rows for this aircraft. Apply an AD from the catalog.')
        ) : (
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>AD</th>
                  <th style={TH}>Applicable</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>First due</th>
                </tr>
              </thead>
              <tbody>
                {adCompliance.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>
                      <Link
                        href={`/admin/ads/${c.adId}`}
                        style={{ color: '#38bdf8', textDecoration: 'none' }}
                      >
                        {c.adId.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={TD}>{c.applicable ? 'Yes' : 'No'}</td>
                    <td style={TD}>{statusBadge(c.status)}</td>
                    <td style={MONO_TD}>
                      {c.firstDueAt ? (
                        new Date(c.firstDueAt).toLocaleDateString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={SECTION}>
        <h2 style={{ margin: '0 0 0.75rem 0', color: '#f7f9fc', fontSize: '1rem' }}>Components</h2>
        {components.length === 0 ? (
          emptyCell('No serial-tracked components installed.')
        ) : (
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>Kind</th>
                  <th style={TH}>Serial</th>
                  <th style={TH}>Part #</th>
                  <th style={TH}>Life limit (hrs)</th>
                  <th style={TH}>Installed</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>{c.kind}</td>
                    <td style={MONO_TD}>
                      {c.serialNumber ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={MONO_TD}>
                      {c.partNumber ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={MONO_TD}>
                      {c.lifeLimitHours != null ? (
                        Number(c.lifeLimitHours).toFixed(1)
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={MONO_TD}>
                      {c.installedAtDate ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
