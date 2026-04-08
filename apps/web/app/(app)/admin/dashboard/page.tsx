import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db, users, aircraft, aircraftCurrentTotals } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function fmt(x: string | number | null | undefined): string {
  if (x == null) return '—';
  return Number(x).toFixed(1);
}

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const rows = await db
    .select({
      aircraftId: aircraftCurrentTotals.aircraftId,
      currentHobbs: aircraftCurrentTotals.currentHobbs,
      currentTach: aircraftCurrentTotals.currentTach,
      currentAirframe: aircraftCurrentTotals.currentAirframe,
      lastFlownAt: aircraftCurrentTotals.lastFlownAt,
      tail: aircraft.tailNumber,
      make: aircraft.make,
      model: aircraft.model,
    })
    .from(aircraftCurrentTotals)
    .innerJoin(
      aircraft,
      and(eq(aircraft.id, aircraftCurrentTotals.aircraftId), eq(aircraft.schoolId, schoolId)),
    )
    .where(isNull(aircraft.deletedAt));

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <h1>Fleet Dashboard</h1>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>No aircraft in your fleet yet.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {rows.map((r) => (
            <Link
              key={r.aircraftId}
              href={`/admin/aircraft/${r.aircraftId}`}
              style={{
                display: 'block',
                padding: '1rem',
                border: '1px solid #ddd',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                background: 'white',
              }}
            >
              <h3 style={{ margin: 0 }}>{r.tail}</h3>
              <div style={{ color: '#555', fontSize: '0.85rem' }}>
                {r.make ?? ''} {r.model ?? ''}
              </div>
              <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                <tbody>
                  <tr>
                    <td>Hobbs</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.currentHobbs)}</td>
                  </tr>
                  <tr>
                    <td>Tach</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.currentTach)}</td>
                  </tr>
                  <tr>
                    <td>Airframe</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.currentAirframe)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
                Last flown:{' '}
                {r.lastFlownAt ? new Date(r.lastFlownAt).toLocaleString() : 'never'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
