import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, aircraft, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReservationForm } from './ReservationForm';

export const dynamic = 'force-dynamic';

type Search = Promise<{
  start?: string;
  end?: string;
  studentId?: string;
  lessonId?: string;
  enrollmentId?: string;
}>;

export default async function NewReservationPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  // Phase 6: detect admin or chief instructor for override eligibility
  const roleRows = (await db.execute(sql`
    select role, is_chief_instructor
    from public.user_roles
    where user_id = ${user.id}::uuid
  `)) as unknown as Array<{ role: string; is_chief_instructor: boolean }>;
  const isAdminOrChiefInstructor =
    roleRows.some((r) => r.role === 'admin') ||
    roleRows.some((r) => r.role === 'instructor' && r.is_chief_instructor);

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
    <main style={{ padding: '1rem', maxWidth: 720 }}>
      <h1>New reservation</h1>
      <ReservationForm
        initialStart={sp.start ?? null}
        initialEnd={sp.end ?? null}
        currentUserId={user.id}
        aircraftOptions={ac.map((a) => ({ id: a.id, label: a.tail }))}
        instructorOptions={instRows.map((i) => ({ id: i.id, label: i.label }))}
        roomOptions={rms.map((r) => ({ id: r.id, label: r.name }))}
        initialStudentId={sp.studentId ?? null}
        initialLessonId={sp.lessonId ?? null}
        initialEnrollmentId={sp.enrollmentId ?? null}
        isAdminOrChiefInstructor={isAdminOrChiefInstructor}
      />
    </main>
  );
}
