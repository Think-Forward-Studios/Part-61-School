import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db, users, reservation, aircraft, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Calendar, type CalendarMode } from './Calendar';
import { PageHeader } from '@/components/ui';

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

  const showApprovals = activeRole === 'instructor' || activeRole === 'admin';

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Operations"
        title="Schedule"
        subtitle="Reservations, instructor availability, and aircraft utilization at a glance."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {showApprovals ? (
              <Link
                href="/schedule/approvals"
                style={{
                  padding: '0.5rem 0.95rem',
                  background: '#0d1220',
                  border: '1px solid #1f2940',
                  color: '#cbd5e1',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: '0.72rem',
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Pending approvals
              </Link>
            ) : null}
            <Link
              href="/schedule/request"
              style={{
                padding: '0.55rem 0.95rem',
                background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#0a0e1a',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                boxShadow:
                  '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
              }}
            >
              + New reservation
            </Link>
          </div>
        }
      />
      <Calendar mode={mode} initialRows={initialRows} resources={resources} />
    </main>
  );
}
