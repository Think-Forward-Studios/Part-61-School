import { and, eq, isNull, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db, users, aircraft, aircraftCurrentTotals } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ManagementOverridesPanel } from '../_components/ManagementOverridesPanel';
import { WorkloadMonitor } from './_components/WorkloadMonitor';

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

  // Today's flight line — count of reservations with start inside today
  // (in UTC — display only; server doesn't convert TZ for the count).
  // allow-banned-term: reservation_status enum values, not UI copy
  const flightLineRow = (await db.execute(sql`
    select count(*)::int as count
      from public.reservation
     where school_id = ${schoolId}::uuid
       and deleted_at is null
       and status in ('approved','dispatched','flown')
       and lower(time_range) >= date_trunc('day', now())
       and lower(time_range) <  date_trunc('day', now()) + interval '1 day'
  `)) as unknown as Array<{ count: number }>;
  const flightLineCount = flightLineRow[0]?.count ?? 0;

  // Pending approvals — requested reservations awaiting confirmation.
  const pendingRow = (await db.execute(sql`
    select count(*)::int as count
      from public.reservation
     where school_id = ${schoolId}::uuid
       and deleted_at is null
       and status = 'requested'
  `)) as unknown as Array<{ count: number }>;
  const pendingCount = pendingRow[0]?.count ?? 0;

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
      <h1>Admin Dashboard</h1>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Link
          href="/dispatch"
          style={{
            padding: '1rem',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            background: '#eff6ff',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#1e40af' }}>Today&apos;s flight line</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{flightLineCount}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Open the dispatch board →</div>
        </Link>
        <Link
          href="/schedule/approvals"
          style={{
            padding: '1rem',
            border: '1px solid #fde68a',
            borderRadius: 8,
            background: '#fffbeb',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#b45309' }}>Pending approvals</div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{pendingCount}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Review the queue →</div>
        </Link>
        <Link
          href="/admin/fif"
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: 'white',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#374151' }}>Flight Information File</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '0.25rem' }}>
            Post & manage notices
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Open →</div>
        </Link>
      </section>

      <h2 style={{ fontSize: '1.1rem' }}>Fleet totals</h2>
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
                Last flown: {r.lastFlownAt ? new Date(r.lastFlownAt).toLocaleString() : 'never'}
              </div>
            </Link>
          ))}
        </div>
      )}
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>Instructor Workload</h2>
        <WorkloadMonitor />
      </section>
      <ManagementOverridesPanel schoolId={schoolId} />
    </main>
  );
}
