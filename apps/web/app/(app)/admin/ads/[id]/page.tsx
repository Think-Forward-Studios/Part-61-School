/**
 * /admin/ads/[id] — AD detail + per-aircraft compliance grid.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, users, airworthinessDirective, aircraftAdCompliance, aircraft } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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

const STATUS_HUE: Record<string, { bg: string; fg: string }> = {
  current: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' },
  due_soon: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  overdue: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' },
  grounding: { bg: 'rgba(248, 113, 113, 0.2)', fg: '#f87171' },
};

export default async function AdDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const ad = (
    await db.select().from(airworthinessDirective).where(eq(airworthinessDirective.id, id)).limit(1)
  )[0];
  if (!ad) notFound();

  const grid = await db
    .select({
      complianceId: aircraftAdCompliance.id,
      aircraftId: aircraftAdCompliance.aircraftId,
      applicable: aircraftAdCompliance.applicable,
      status: aircraftAdCompliance.status,
      firstDueAt: aircraftAdCompliance.firstDueAt,
      tailNumber: aircraft.tailNumber,
    })
    .from(aircraftAdCompliance)
    .innerJoin(aircraft, eq(aircraft.id, aircraftAdCompliance.aircraftId))
    .where(
      and(eq(aircraftAdCompliance.adId, ad.id), eq(aircraftAdCompliance.schoolId, me.schoolId)),
    );

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link
          href="/admin/ads"
          style={{
            color: '#7a869a',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Back to ADs
        </Link>
      </div>
      <PageHeader
        eyebrow="Maintenance"
        title={`${ad.adNumber} — ${ad.title}`}
        subtitle={ad.effectiveDate ? `Effective ${ad.effectiveDate}` : undefined}
      />

      {ad.summary ? (
        <section
          style={{
            padding: '1rem 1.1rem',
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            marginTop: '0.5rem',
          }}
        >
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: '0.82rem',
              margin: 0,
              color: '#cbd5e1',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              background: 'transparent',
              padding: 0,
            }}
          >
            {ad.summary}
          </pre>
        </section>
      ) : null}

      <section style={{ marginTop: '1rem' }}>
        <h2
          style={{
            margin: '0 0 0.75rem',
            fontSize: '0.75rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            color: '#7a869a',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            fontWeight: 500,
          }}
        >
          Fleet compliance
        </h2>
        {grid.length === 0 ? (
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
            No compliance rows yet. Use &quot;Apply to fleet&quot; on the AD list.
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
                  <th style={TH}>Aircraft</th>
                  <th style={TH}>Applicable</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>First due</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((g) => {
                  const tone = (g.status && STATUS_HUE[g.status]) ??
                    STATUS_HUE.current ?? { bg: '#1a2238', fg: '#7a869a' };
                  return (
                    <tr key={g.complianceId} style={{ borderBottom: '1px solid #161d30' }}>
                      <td style={TD}>
                        <Link
                          href={`/admin/aircraft/${g.aircraftId}/maintenance`}
                          style={{
                            color: '#38bdf8',
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            fontSize: '0.78rem',
                            textDecoration: 'none',
                          }}
                        >
                          {g.tailNumber}
                        </Link>
                      </td>
                      <td style={TD}>
                        {g.applicable ? (
                          <span style={{ color: '#34d399' }}>Yes</span>
                        ) : (
                          <span style={{ color: '#5b6784' }}>No</span>
                        )}
                      </td>
                      <td style={TD}>
                        {g.status ? (
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
                              textTransform: 'uppercase',
                              fontWeight: 600,
                            }}
                          >
                            {g.status.replace('_', ' ')}
                          </span>
                        ) : (
                          <span style={{ color: '#5b6784' }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: '0.76rem',
                        }}
                      >
                        {g.firstDueAt ? (
                          new Date(g.firstDueAt).toLocaleDateString()
                        ) : (
                          <span style={{ color: '#5b6784' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
