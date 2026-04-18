import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, users, reservation } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ActivityChip } from '@/components/schedule/ActivityChip';
import { StatusLabel } from '@/components/schedule/StatusLabel';
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
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};

const DT: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.7rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 500,
};

const DD: React.CSSProperties = {
  color: '#f7f9fc',
  fontSize: '0.9rem',
  margin: 0,
};

export default async function ReservationDetailPage({ params }: { params: Params }) {
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

  const dash = <span style={{ color: '#5b6784' }}>—</span>;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Operations"
        title="Reservation"
        subtitle="Single-reservation detail with audit trail."
      />
      <section
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <ActivityChip type={r.activityType} />
        <StatusLabel status={r.status} />
      </section>
      <div
        style={{
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 12,
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '180px 1fr',
            rowGap: '0.85rem',
            columnGap: '1rem',
            margin: 0,
          }}
        >
          <dt style={DT}>When</dt>
          <dd
            style={{
              ...DD,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.82rem',
            }}
          >
            {r.timeRange}
          </dd>
          <dt style={DT}>Aircraft</dt>
          <dd style={DD}>{r.aircraftId ?? dash}</dd>
          <dt style={DT}>Instructor</dt>
          <dd style={DD}>{r.instructorId ?? dash}</dd>
          <dt style={DT}>Student</dt>
          <dd style={DD}>{r.studentId ?? dash}</dd>
          <dt style={DT}>Room</dt>
          <dd style={DD}>{r.roomId ?? dash}</dd>
          <dt style={DT}>Route</dt>
          <dd style={DD}>{r.routeString ?? dash}</dd>
          <dt style={DT}>Notes</dt>
          <dd style={{ ...DD, whiteSpace: 'pre-wrap' }}>{r.notes ?? dash}</dd>
        </dl>
      </div>

      <h2
        style={{
          margin: '0 0 0.75rem',
          fontFamily: '"Antonio", system-ui, sans-serif',
          fontSize: '1.35rem',
          fontWeight: 600,
          color: '#f7f9fc',
          letterSpacing: '-0.01em',
        }}
      >
        Audit trail
      </h2>
      {audit.length === 0 ? (
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
          No audit entries.
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
                <th style={TH}>When</th>
                <th style={TH}>Actor</th>
                <th style={TH}>Op</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={TD}>{a.at}</td>
                  <td style={TD}>{a.actor ?? dash}</td>
                  <td style={TD}>{a.op}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
