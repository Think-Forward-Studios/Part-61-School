import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db, users, reservation, aircraft, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Calendar, type CalendarMode } from './Calendar';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value ?? 'student';
  const mode: CalendarMode =
    activeRole === 'instructor' || activeRole === 'admin' ? 'full' : 'mine';

  // Server-side initial fetch. We intentionally skip RLS niceties and
  // go straight through Drizzle (same pattern as other Server Component
  // pages in the app). The tRPC refetch on the client will narrow
  // further via server-side role logic.
  const rows =
    mode === 'full'
      ? await db
          .select()
          .from(reservation)
          .where(and(eq(reservation.schoolId, me.schoolId), isNull(reservation.deletedAt)))
          .limit(1000)
      : await db
          .select()
          .from(reservation)
          .where(
            and(
              eq(reservation.schoolId, me.schoolId),
              isNull(reservation.deletedAt),
              or(
                eq(reservation.studentId, user.id),
                eq(reservation.instructorId, user.id),
                eq(reservation.requestedBy, user.id),
              ),
            ),
          )
          .limit(500);

  const initialRows = rows.map((r) => ({
    id: r.id,
    activityType: r.activityType,
    status: r.status,
    timeRange: r.timeRange,
    aircraftId: r.aircraftId,
    instructorId: r.instructorId,
    studentId: r.studentId,
    roomId: r.roomId,
    notes: r.notes,
  }));

  let resources:
    | {
        aircraft: Array<{ id: string; label: string }>;
        instructors: Array<{ id: string; label: string }>;
        rooms: Array<{ id: string; label: string }>;
      }
    | undefined;
  if (mode === 'full') {
    const [ac, inst, rms] = await Promise.all([
      db
        .select({ id: aircraft.id, tail: aircraft.tailNumber })
        .from(aircraft)
        .where(and(eq(aircraft.schoolId, me.schoolId), isNull(aircraft.deletedAt))),
      db.execute(sql`
        select u.id, coalesce(p.first_name || ' ' || p.last_name, u.email) as label
          from public.users u
          left join public.person_profile p on p.user_id = u.id
          inner join public.user_roles r on r.user_id = u.id
         where u.school_id = ${me.schoolId}::uuid
           and r.role = 'instructor'
      `),
      db
        .select({ id: room.id, name: room.name })
        .from(room)
        .where(and(eq(room.schoolId, me.schoolId), isNull(room.deletedAt))),
    ]);
    const instRows = inst as unknown as Array<{ id: string; label: string }>;
    resources = {
      aircraft: ac.map((a) => ({ id: a.id, label: a.tail })),
      instructors: instRows.map((i) => ({ id: i.id, label: i.label })),
      rooms: rms.map((r) => ({ id: r.id, label: r.name })),
    };
  }

  return (
    <main style={{ padding: '1rem', maxWidth: 1400 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h1>Schedule</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeRole === 'instructor' || activeRole === 'admin' ? (
            <a
              href="/schedule/approvals"
              style={{
                padding: '0.5rem 1rem',
                background: '#f1f5f9',
                borderRadius: 4,
                textDecoration: 'none',
                color: '#0f172a',
              }}
            >
              Pending approvals
            </a>
          ) : null}
          <a
            href="/schedule/request"
            style={{
              padding: '0.5rem 1rem',
              background: '#0070f3',
              color: 'white',
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            + New reservation
          </a>
        </div>
      </header>
      <Calendar mode={mode} initialRows={initialRows} resources={resources} />
    </main>
  );
}
