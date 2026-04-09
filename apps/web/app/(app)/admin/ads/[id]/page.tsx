/**
 * /admin/ads/[id] — AD detail + per-aircraft compliance grid.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import {
  db,
  users,
  airworthinessDirective,
  aircraftAdCompliance,
  aircraft,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

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
    await db
      .select()
      .from(airworthinessDirective)
      .where(eq(airworthinessDirective.id, id))
      .limit(1)
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
      and(
        eq(aircraftAdCompliance.adId, ad.id),
        eq(aircraftAdCompliance.schoolId, me.schoolId),
      ),
    );

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <Link href="/admin/ads">← Back to ADs</Link>
      <h1 style={{ marginTop: '0.5rem' }}>
        {ad.adNumber} — {ad.title}
      </h1>
      {ad.effectiveDate ? (
        <p style={{ color: '#6b7280' }}>Effective {ad.effectiveDate}</p>
      ) : null}

      {ad.summary ? (
        <section
          style={{
            padding: '0.75rem',
            background: '#f8fafc',
            borderRadius: 4,
            marginTop: '1rem',
          }}
        >
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', margin: 0 }}>
            {ad.summary}
          </pre>
        </section>
      ) : null}

      <section
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0' }}>Fleet compliance</h2>
        {grid.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            No compliance rows yet. Use &quot;Apply to fleet&quot; on the AD list.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Aircraft</th>
                <th style={{ padding: '0.4rem' }}>Applicable</th>
                <th style={{ padding: '0.4rem' }}>Status</th>
                <th style={{ padding: '0.4rem' }}>First due</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((g) => (
                <tr key={g.complianceId} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    <Link href={`/admin/aircraft/${g.aircraftId}/maintenance`}>
                      {g.tailNumber}
                    </Link>
                  </td>
                  <td style={{ padding: '0.4rem' }}>{g.applicable ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '0.4rem' }}>{g.status ?? '—'}</td>
                  <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                    {g.firstDueAt ? new Date(g.firstDueAt).toLocaleDateString() : '—'}
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
