import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, reservation, aircraft, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Calendar } from '../../schedule/Calendar';

export const dynamic = 'force-dynamic';

export default async function AdminSchedulePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const rows = await db
    .select()
    .from(reservation)
    .where(and(eq(reservation.schoolId, me.schoolId), isNull(reservation.deletedAt)))
    .limit(1000);

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

  return (
    <main style={{ padding: '1rem', maxWidth: 1400 }}>
      <h1>Base schedule</h1>
      <Calendar
        mode="full"
        initialRows={rows.map((r) => ({
          id: r.id,
          activityType: r.activityType,
          status: r.status,
          timeRange: r.timeRange,
          aircraftId: r.aircraftId,
          instructorId: r.instructorId,
          studentId: r.studentId,
          roomId: r.roomId,
          notes: r.notes,
        }))}
        resources={{
          aircraft: ac.map((a) => ({ id: a.id, label: a.tail })),
          instructors: instRows.map((i) => ({ id: i.id, label: i.label })),
          rooms: rms.map((r) => ({ id: r.id, label: r.name })),
        }}
      />
    </main>
  );
}
