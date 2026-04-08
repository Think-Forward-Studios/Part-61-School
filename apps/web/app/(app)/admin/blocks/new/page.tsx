import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, aircraft, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NewBlockForm } from './NewBlockForm';

export const dynamic = 'force-dynamic';

export default async function NewBlockPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me) redirect('/login');

  const [ac, inst, rms] = await Promise.all([
    db
      .select({ id: aircraft.id, tail: aircraft.tailNumber })
      .from(aircraft)
      .where(
        and(eq(aircraft.schoolId, me.schoolId), isNull(aircraft.deletedAt)),
      ),
    db.execute(sql`
      select u.id, coalesce(p.first_name || ' ' || p.last_name, u.email) as label
        from public.users u
        left join public.person p on p.user_id = u.id
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
      <h1>New schedule block</h1>
      <p style={{ color: '#666' }}>
        Define a recurring pattern (day-of-week + time range) and the server
        will materialize one instance per occurrence within the date window.
      </p>
      <NewBlockForm
        aircraftOptions={ac.map((a) => ({ id: a.id, label: a.tail }))}
        instructorOptions={instRows.map((i) => ({ id: i.id, label: i.label }))}
        roomOptions={rms.map((r) => ({ id: r.id, label: r.name }))}
      />
    </main>
  );
}
