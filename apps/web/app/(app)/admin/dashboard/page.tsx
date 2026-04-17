import { and, eq, isNull, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db, users, aircraft, aircraftCurrentTotals } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ManagementOverridesPanel } from '../_components/ManagementOverridesPanel';
import { WorkloadMonitor } from './_components/WorkloadMonitor';
import { PageHeader, Metric, Card } from '@/components/ui';

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Operations"
        title="Admin Dashboard"
        subtitle="Today's flight line, approvals, and fleet status at a glance."
      />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.9rem',
          marginBottom: '2rem',
        }}
      >
        <Metric
          label="Today's flight line"
          value={flightLineCount}
          caption="Open the dispatch board →"
          href="/dispatch"
          accent="#38bdf8"
        />
        <Metric
          label="Pending requests"
          value={pendingCount}
          caption="Review the queue →"
          href="/schedule/approvals"
          tone="warn"
        />
        <Metric
          label="Flight Information"
          value="FIF"
          caption="Post & manage notices →"
          href="/admin/fif"
          accent="#a78bfa"
        />
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.75rem',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.7rem',
              letterSpacing: '0.3em',
              color: '#7a869a',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Fleet · {rows.length} aircraft
          </h2>
          <Link
            href="/admin/aircraft"
            style={{
              fontSize: '0.78rem',
              color: '#38bdf8',
              textDecoration: 'none',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            All aircraft →
          </Link>
        </div>
        {rows.length === 0 ? (
          <p style={{ color: '#7a869a', fontSize: '0.88rem' }}>
            No aircraft in your fleet yet. Add one in{' '}
            <Link href="/admin/aircraft/new">Aircraft → New</Link>.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '0.9rem',
            }}
          >
            {rows.map((r) => (
              <Card
                key={r.aircraftId}
                href={`/admin/aircraft/${r.aircraftId}`}
                accent="#38bdf8"
                title={
                  <span
                    style={{
                      fontFamily: '"Antonio", system-ui, sans-serif',
                      fontSize: '1.3rem',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {r.tail}
                  </span>
                }
                subtitle={`${r.make ?? ''} ${r.model ?? ''}`.trim() || undefined}
                footer={
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    Last flown: {r.lastFlownAt ? new Date(r.lastFlownAt).toLocaleString() : 'never'}
                  </span>
                }
              >
                <table
                  style={{
                    width: '100%',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '0.8rem',
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ color: '#7a869a', padding: '0.1rem 0' }}>HOBBS</td>
                      <td style={{ textAlign: 'right', color: '#f7f9fc' }}>
                        {fmt(r.currentHobbs)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: '#7a869a', padding: '0.1rem 0' }}>TACH</td>
                      <td style={{ textAlign: 'right', color: '#f7f9fc' }}>{fmt(r.currentTach)}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#7a869a', padding: '0.1rem 0' }}>AIRFRAME</td>
                      <td style={{ textAlign: 'right', color: '#f7f9fc' }}>
                        {fmt(r.currentAirframe)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.75rem',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.7rem',
              letterSpacing: '0.3em',
              color: '#7a869a',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Instructor workload · this week
          </h2>
        </div>
        <Card padded={false} elev={1}>
          <div style={{ padding: '0.5rem 1rem' }}>
            <WorkloadMonitor />
          </div>
        </Card>
      </section>
      <ManagementOverridesPanel schoolId={schoolId} />
    </main>
  );
}
