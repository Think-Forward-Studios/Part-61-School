import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, users, reservation, passengerManifest, aircraft } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PrintButtonClient } from './PrintButtonClient';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * /dispatch/manifest/[id] — print-friendly passenger manifest (FTR-06).
 *
 * Single-page A4/letter layout, large legible type, hides nav on
 * print. The "Print" button calls window.print() inline. No PDF
 * library — print-to-PDF from the browser is enough for v1.
 */
export default async function ManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const r = (
    await db
      .select()
      .from(reservation)
      .where(and(eq(reservation.id, id), eq(reservation.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!r) notFound();

  const pax = await db
    .select()
    .from(passengerManifest)
    .where(eq(passengerManifest.reservationId, id));

  let tail: string | null = null;
  if (r.aircraftId) {
    const ac = (
      await db
        .select({ tailNumber: aircraft.tailNumber })
        .from(aircraft)
        .where(eq(aircraft.id, r.aircraftId))
        .limit(1)
    )[0];
    tail = ac?.tailNumber ?? null;
  }

  const totalWeight = pax.reduce((sum, p) => sum + (p.weightLbs ? Number(p.weightLbs) : 0), 0);

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
    fontSize: '0.85rem',
    borderBottom: '1px solid #161d30',
  };

  const kvLabelTD: React.CSSProperties = {
    padding: '0.55rem 0.9rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#7a869a',
    borderBottom: '1px solid #161d30',
    width: '30%',
  };

  const kvValueTD: React.CSSProperties = {
    padding: '0.55rem 0.9rem',
    color: '#f7f9fc',
    fontSize: '0.88rem',
    borderBottom: '1px solid #161d30',
  };

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1600, margin: '0 auto' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: letter; margin: 0.75in; }
          body { font-size: 12pt; background: white !important; color: black !important; }
          .manifest-root { color: black !important; background: white !important; }
          .manifest-card { background: white !important; border: 1px solid #333 !important; }
          .manifest-card th, .manifest-card td { color: black !important; border-color: #333 !important; }
          .manifest-header-row { background: #f3f4f6 !important; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          eyebrow="Operations"
          title="Manifest"
          subtitle={
            tail
              ? `Passenger manifest · ${tail}`
              : `Passenger manifest · ${pax.length} ${pax.length === 1 ? 'passenger' : 'passengers'}`
          }
          actions={<PrintButtonClient />}
        />
      </div>

      <div
        className="manifest-root"
        style={{ color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
      >
        <div
          className="manifest-card"
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={kvLabelTD}>Reservation</td>
                <td
                  style={{
                    ...kvValueTD,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '0.82rem',
                  }}
                >
                  {r.id}
                </td>
              </tr>
              <tr>
                <td style={kvLabelTD}>Aircraft</td>
                <td style={kvValueTD}>{tail ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
              </tr>
              <tr>
                <td style={kvLabelTD}>Activity</td>
                <td style={kvValueTD}>{r.activityType}</td>
              </tr>
              <tr>
                <td style={kvLabelTD}>Status</td>
                <td style={kvValueTD}>{r.status}</td>
              </tr>
              <tr>
                <td style={kvLabelTD}>Notes</td>
                <td style={kvValueTD}>{r.notes ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: '0.75rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#7a869a',
            fontWeight: 500,
          }}
        >
          Persons on board
        </h2>

        <div
          className="manifest-card"
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="manifest-header-row" style={{ background: '#121826' }}>
                <th style={TH}>Position</th>
                <th style={TH}>Name</th>
                <th style={TH}>Weight (lb)</th>
                <th style={TH}>Emergency contact</th>
                <th style={TH}>Phone</th>
              </tr>
            </thead>
            <tbody>
              {pax.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: '#7a869a',
                      fontSize: '0.85rem',
                    }}
                  >
                    No persons on manifest
                  </td>
                </tr>
              ) : (
                pax.map((p) => (
                  <tr key={p.id}>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                        letterSpacing: '0.1em',
                        color: '#38bdf8',
                        fontWeight: 600,
                      }}
                    >
                      {p.position.toUpperCase()}
                    </td>
                    <td style={TD}>{p.name}</td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    >
                      {p.weightLbs ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={TD}>
                      {p.emergencyContactName ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    >
                      {p.emergencyContactPhone ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#121826' }}>
                <th colSpan={2} style={{ ...TH, textAlign: 'right', borderBottom: 'none' }}>
                  Total weight
                </th>
                <th
                  style={{
                    ...TH,
                    color: '#f7f9fc',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    borderBottom: 'none',
                  }}
                >
                  {totalWeight.toFixed(0)}
                </th>
                <th colSpan={2} style={{ borderBottom: 'none' }} />
              </tr>
            </tfoot>
          </table>
        </div>

        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: '#5b6784',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.08em',
          }}
        >
          Generated {new Date().toLocaleString()}
        </p>
      </div>
    </main>
  );
}
