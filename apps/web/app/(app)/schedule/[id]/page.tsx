import { notFound, redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
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

interface DetailRow {
  id: string;
  activity_type: string;
  status: string;
  notes: string | null;
  route_string: string | null;
  range_start: string | null;
  range_end: string | null;
  aircraft_id: string | null;
  aircraft_tail: string | null;
  aircraft_make: string | null;
  aircraft_model: string | null;
  instructor_id: string | null;
  instructor_name: string | null;
  student_id: string | null;
  student_name: string | null;
  room_id: string | null;
  room_name: string | null;
}

/** Render the active person/asset name plus a faint UUID hint as a tooltip. */
function NameOrDash({ name, id }: { name: string | null; id: string | null }) {
  if (name) return <span title={id ?? undefined}>{name}</span>;
  if (id)
    return (
      <span style={{ color: '#94a3b8' }}>
        <code style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
          {id.slice(0, 8)}…
        </code>{' '}
        <span style={{ color: '#5b6784', fontSize: '0.78rem' }}>(deleted)</span>
      </span>
    );
  return <span style={{ color: '#5b6784' }}>—</span>;
}

function AircraftCell({ row }: { row: DetailRow }) {
  if (row.aircraft_tail) {
    const mm = [row.aircraft_make, row.aircraft_model].filter(Boolean).join(' ');
    return (
      <span title={row.aircraft_id ?? undefined}>
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            color: '#fbbf24',
            letterSpacing: '0.04em',
            fontWeight: 700,
          }}
        >
          {row.aircraft_tail}
        </span>
        {mm ? <span style={{ color: '#cbd5e1' }}> · {mm}</span> : null}
      </span>
    );
  }
  return <NameOrDash name={null} id={row.aircraft_id} />;
}

function formatRange(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  if (sameDay) {
    return `${s.toLocaleDateString('en-US', dateFmt)} · ${s.toLocaleTimeString(
      'en-US',
      timeFmt,
    )} – ${e.toLocaleTimeString('en-US', timeFmt)}`;
  }
  return `${s.toLocaleString('en-US', { ...dateFmt, ...timeFmt })} – ${e.toLocaleString('en-US', {
    ...dateFmt,
    ...timeFmt,
  })}`;
}

export default async function ReservationDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  // Single joined query — pulls in tail number, make/model, instructor
  // and student names, and room name so the detail card can render
  // human-readable labels instead of raw UUIDs. lower(time_range) /
  // upper(time_range) split the tstzrange into ISO strings the UI can
  // localize.
  const rows = (await db.execute(sql`
    select
      r.id,
      r.activity_type::text                    as activity_type,
      r.status::text                           as status,
      r.notes,
      r.route_string,
      lower(r.time_range)::text                as range_start,
      upper(r.time_range)::text                as range_end,
      r.aircraft_id,
      ac.tail_number                            as aircraft_tail,
      ac.make                                   as aircraft_make,
      ac.model                                  as aircraft_model,
      r.instructor_id,
      coalesce(
        nullif(trim(concat_ws(' ', ipp.first_name, ipp.last_name)), ''),
        iu.full_name,
        iu.email
      )                                          as instructor_name,
      r.student_id,
      coalesce(
        nullif(trim(concat_ws(' ', spp.first_name, spp.last_name)), ''),
        su.full_name,
        su.email
      )                                          as student_name,
      r.room_id,
      rm.name                                    as room_name
    from public.reservation r
    left join public.aircraft       ac on ac.id = r.aircraft_id
    left join public.users          iu on iu.id = r.instructor_id
    left join public.person_profile ipp on ipp.user_id = r.instructor_id
    left join public.users          su on su.id = r.student_id
    left join public.person_profile spp on spp.user_id = r.student_id
    left join public.room           rm on rm.id = r.room_id
    where r.id = ${id}::uuid
      and r.school_id = ${me.schoolId}::uuid
    limit 1
  `)) as unknown as DetailRow[];

  const row = rows[0];
  if (!row) notFound();

  // Audit trail. Resolve actor_user_id to a name in the same query so
  // the table doesn't show another column of UUIDs.
  let audit: Array<{
    at: string;
    actor_id: string | null;
    actor_name: string | null;
    op: string;
  }> = [];
  try {
    audit = (await db.execute(sql`
      select
        al.changed_at::text  as at,
        al.actor_user_id::text as actor_id,
        coalesce(
          nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''),
          u.full_name,
          u.email
        ) as actor_name,
        al.op
      from audit.audit_log al
      left join public.users          u  on u.id  = al.actor_user_id
      left join public.person_profile pp on pp.user_id = al.actor_user_id
      where al.table_name = 'reservation'
        and al.row_pk = ${id}::text
      order by al.changed_at desc
      limit 50
    `)) as unknown as Array<{
      at: string;
      actor_id: string | null;
      actor_name: string | null;
      op: string;
    }>;
  } catch {
    // best-effort
  }

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
        <ActivityChip type={row.activity_type as never} />
        <StatusLabel status={row.status as never} />
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
          <dd style={DD}>{formatRange(row.range_start, row.range_end)}</dd>

          <dt style={DT}>Aircraft</dt>
          <dd style={DD}>
            <AircraftCell row={row} />
          </dd>

          <dt style={DT}>Instructor</dt>
          <dd style={DD}>
            <NameOrDash name={row.instructor_name} id={row.instructor_id} />
          </dd>

          <dt style={DT}>Student</dt>
          <dd style={DD}>
            <NameOrDash name={row.student_name} id={row.student_id} />
          </dd>

          <dt style={DT}>Room</dt>
          <dd style={DD}>
            <NameOrDash name={row.room_name} id={row.room_id} />
          </dd>

          <dt style={DT}>Route</dt>
          <dd style={DD}>{row.route_string ?? <span style={{ color: '#5b6784' }}>—</span>}</dd>

          <dt style={DT}>Notes</dt>
          <dd style={{ ...DD, whiteSpace: 'pre-wrap' }}>
            {row.notes ?? <span style={{ color: '#5b6784' }}>—</span>}
          </dd>
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
                  <td style={TD}>{new Date(a.at).toLocaleString()}</td>
                  <td style={TD}>
                    <NameOrDash name={a.actor_name} id={a.actor_id} />
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      color: '#94a3b8',
                      fontSize: '0.78rem',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {a.op}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
