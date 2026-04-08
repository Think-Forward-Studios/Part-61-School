import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, users, reservation } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ActivityChip } from '@/components/schedule/ActivityChip';
import { StatusLabel } from '@/components/schedule/StatusLabel';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function ReservationDetailPage({
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
  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me) redirect('/login');

  const r = (
    await db
      .select()
      .from(reservation)
      .where(
        and(eq(reservation.id, id), eq(reservation.schoolId, me.schoolId)),
      )
      .limit(1)
  )[0];
  if (!r) notFound();

  // Audit trail: query audit_log rows for this reservation via raw SQL
  // (the audit_log shape is already in the schema; we keep this
  // read-only and best-effort — show nothing if it errors).
  let audit: Array<{
    at: string;
    actor: string | null;
    op: string;
  }> = [];
  try {
    const rows = (await db.execute(sql`
      select changed_at::text as at, actor_user_id::text as actor, op
        from audit.audit_log
       where table_name = 'reservation'
         and row_pk = ${id}::text
       order by changed_at desc
       limit 50
    `)) as unknown as Array<{ at: string; actor: string | null; op: string }>;
    audit = rows;
  } catch {
    // best-effort
  }

  return (
    <main style={{ padding: '1rem', maxWidth: 900 }}>
      <h1>Reservation</h1>
      <section
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <ActivityChip type={r.activityType} />
        <StatusLabel status={r.status} />
      </section>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr',
          rowGap: '0.5rem',
        }}
      >
        <dt>When</dt>
        <dd>{r.timeRange}</dd>
        <dt>Aircraft</dt>
        <dd>{r.aircraftId ?? '—'}</dd>
        <dt>Instructor</dt>
        <dd>{r.instructorId ?? '—'}</dd>
        <dt>Student</dt>
        <dd>{r.studentId ?? '—'}</dd>
        <dt>Room</dt>
        <dd>{r.roomId ?? '—'}</dd>
        <dt>Route</dt>
        <dd>{r.routeString ?? '—'}</dd>
        <dt>Notes</dt>
        <dd style={{ whiteSpace: 'pre-wrap' }}>{r.notes ?? '—'}</dd>
      </dl>

      <h2 style={{ marginTop: '2rem' }}>Audit trail</h2>
      {audit.length === 0 ? (
        <p style={{ color: '#666' }}>No audit entries.</p>
      ) : (
        <table style={{ width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>When</th>
              <th style={{ textAlign: 'left' }}>Actor</th>
              <th style={{ textAlign: 'left' }}>Op</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a, i) => (
              <tr key={i}>
                <td>{a.at}</td>
                <td>{a.actor ?? '—'}</td>
                <td>{a.op}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
