import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { db, users, userRoles } from '@part61/db';
import type { Role } from '@part61/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FifInbox } from '@/components/dispatch/FifInbox';

export const dynamic = 'force-dynamic';

const ROLES: readonly Role[] = ['student', 'instructor', 'mechanic', 'admin'];
function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x);
}

type ReservationSummary = {
  id: string;
  activity_type: string;
  status: string;
  lower: string;
  upper: string;
  tail: string | null;
};

type SquawkRow = {
  id: string;
  title: string;
  severity: string;
  tail: string | null;
};

async function resolveActiveRole(userId: string): Promise<Role> {
  const cookieStore = await cookies();
  const cookieRole = cookieStore.get('part61.active_role')?.value;
  const roleRows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  const rolesList = roleRows.map((r) => r.role as Role).filter(isRole);
  if (isRole(cookieRole) && rolesList.includes(cookieRole)) return cookieRole;
  const def = roleRows.find((r) => r.isDefault)?.role;
  if (isRole(def)) return def;
  return rolesList[0] ?? 'student';
}

function panel(title: string, children: React.ReactNode, accent = '#e5e7eb'): React.ReactNode {
  return (
    <section
      style={{
        padding: '0.75rem',
        border: `1px solid ${accent}`,
        borderRadius: 8,
        background: 'white',
      }}
    >
      <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0' }}>{title}</h2>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const activeRole = await resolveActiveRole(user.id);

  // Student: next reservation + aircraft open squawks for upcoming flight.
  // Instructor: today's schedule + pending approvals waiting on me.
  // Admin: today's flight line count + pending approvals count.

  let nextReservation: ReservationSummary | null = null;
  let openSquawks: SquawkRow[] = [];
  let todaysSchedule: ReservationSummary[] = [];
  let pendingApprovalCount = 0;
  let flightLineCount = 0;

  if (activeRole === 'student') {
    // allow-banned-term: reservation_status enum values, not UI copy
    const rows = (await db.execute(sql`
      select r.id,
             r.activity_type::text as activity_type,
             r.status::text as status,
             lower(r.time_range)::text as lower,
             upper(r.time_range)::text as upper,
             a.tail_number as tail
        from public.reservation r
        left join public.aircraft a on a.id = r.aircraft_id
       where r.school_id = ${me.schoolId}::uuid
         and r.deleted_at is null
         and r.student_id = ${user.id}::uuid
         and r.status in ('requested','approved','dispatched')
         and upper(r.time_range) > now()
       order by lower(r.time_range) asc
       limit 1
    `)) as unknown as ReservationSummary[];
    nextReservation = rows[0] ?? null;

    if (nextReservation) {
      openSquawks = (await db.execute(sql`
        select s.id, s.title, s.severity::text as severity, a.tail_number as tail
          from public.aircraft_squawk s
          join public.aircraft a on a.id = s.aircraft_id
         where s.school_id = ${me.schoolId}::uuid
           and s.resolved_at is null
           and s.aircraft_id = (
             select aircraft_id from public.reservation where id = ${nextReservation.id}::uuid
           )
         order by s.opened_at desc
      `)) as unknown as SquawkRow[];
    }
  } else if (activeRole === 'instructor') {
    // allow-banned-term: reservation_status enum values, not UI copy
    todaysSchedule = (await db.execute(sql`
      select r.id,
             r.activity_type::text as activity_type,
             r.status::text as status,
             lower(r.time_range)::text as lower,
             upper(r.time_range)::text as upper,
             a.tail_number as tail
        from public.reservation r
        left join public.aircraft a on a.id = r.aircraft_id
       where r.school_id = ${me.schoolId}::uuid
         and r.deleted_at is null
         and r.instructor_id = ${user.id}::uuid
         and r.status in ('approved','dispatched','flown')
         and lower(r.time_range) >= date_trunc('day', now())
         and lower(r.time_range) <  date_trunc('day', now()) + interval '1 day'
       order by lower(r.time_range) asc
    `)) as unknown as ReservationSummary[];
    const pendingRow = (await db.execute(sql`
      select count(*)::int as count
        from public.reservation
       where school_id = ${me.schoolId}::uuid
         and deleted_at is null
         and instructor_id = ${user.id}::uuid
         and status = 'requested'
    `)) as unknown as Array<{ count: number }>;
    pendingApprovalCount = pendingRow[0]?.count ?? 0;
  } else if (activeRole === 'admin') {
    // allow-banned-term: reservation_status enum values, not UI copy
    const flightRow = (await db.execute(sql`
      select count(*)::int as count
        from public.reservation
       where school_id = ${me.schoolId}::uuid
         and deleted_at is null
         and status in ('approved','dispatched','flown')
         and lower(time_range) >= date_trunc('day', now())
         and lower(time_range) <  date_trunc('day', now()) + interval '1 day'
    `)) as unknown as Array<{ count: number }>;
    flightLineCount = flightRow[0]?.count ?? 0;
    const pendingRow = (await db.execute(sql`
      select count(*)::int as count
        from public.reservation
       where school_id = ${me.schoolId}::uuid
         and deleted_at is null
         and status = 'requested'
    `)) as unknown as Array<{ count: number }>;
    pendingApprovalCount = pendingRow[0]?.count ?? 0;
  }

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Part 61 School</h1>
      <p style={{ color: '#6b7280' }}>
        Signed in as {me.email} — {activeRole}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        {activeRole === 'student' ? (
          <>
            {panel(
              'Next reservation',
              nextReservation ? (
                <div style={{ fontSize: '0.85rem' }}>
                  <div>
                    <strong>{nextReservation.activity_type}</strong> — {nextReservation.status}
                  </div>
                  <div>
                    {new Date(nextReservation.lower).toLocaleString()} →{' '}
                    {new Date(nextReservation.upper).toLocaleString()}
                  </div>
                  {nextReservation.tail ? <div>Aircraft: {nextReservation.tail}</div> : null}
                  <Link href={`/schedule/${nextReservation.id}`}>Open →</Link>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                  None on the books. <Link href="/schedule">Book one →</Link>
                </p>
              ),
              '#bfdbfe',
            )}
            <FifInbox />
            {panel(
              'Open squawks on your next aircraft',
              openSquawks.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>No open squawks.</p>
              ) : (
                <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem' }}>
                  {openSquawks.map((s) => (
                    <li key={s.id}>
                      <strong>{s.severity}</strong>: {s.title}
                    </li>
                  ))}
                </ul>
              ),
              '#fde68a',
            )}
          </>
        ) : null}

        {activeRole === 'instructor' ? (
          <>
            {panel(
              "Today's schedule",
              todaysSchedule.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>Nothing on the books today.</p>
              ) : (
                <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem' }}>
                  {todaysSchedule.map((r) => (
                    <li key={r.id}>
                      {new Date(r.lower).toLocaleTimeString()} — {r.activity_type}{' '}
                      {r.tail ? `(${r.tail})` : ''} — {r.status}
                    </li>
                  ))}
                </ul>
              ),
              '#bfdbfe',
            )}
            {panel(
              'Pending approvals',
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{pendingApprovalCount}</div>
                <Link href="/schedule/approvals">Open queue →</Link>
              </div>,
              '#fde68a',
            )}
            <FifInbox />
          </>
        ) : null}

        {activeRole === 'admin' ? (
          <>
            {panel(
              "Today's flight line",
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{flightLineCount}</div>
                <Link href="/dispatch">Dispatch board →</Link>
              </div>,
              '#bfdbfe',
            )}
            {panel(
              'Pending approvals',
              <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{pendingApprovalCount}</div>
                <Link href="/schedule/approvals">Review →</Link>
              </div>,
              '#fde68a',
            )}
            <FifInbox />
          </>
        ) : null}

        {activeRole === 'mechanic' ? <FifInbox /> : null}
      </div>
    </main>
  );
}
