import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApprovalList } from './ApprovalList';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type ApprovalRow = {
  id: string;
  activity_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  aircraft_tail: string | null;
  aircraft_id: string | null;
  instructor_first: string | null;
  instructor_last: string | null;
  instructor_email: string | null;
  instructor_id: string | null;
  student_first: string | null;
  student_last: string | null;
  student_email: string | null;
  student_id: string | null;
  room_name: string | null;
  room_id: string | null;
  notes: string | null;
};

export default async function ApprovalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'instructor' && activeRole !== 'admin') {
    notFound();
  }

  // Join out to aircraft / users (instructor + student) / rooms so the
  // list renders human-readable labels instead of raw UUIDs.
  // lower(time_range) / upper(time_range) unpack the tstzrange.
  const rows = (await db.execute(sql`
    select
      r.id,
      r.activity_type::text              as activity_type,
      r.status::text                     as status,
      lower(r.time_range)::text          as starts_at,
      upper(r.time_range)::text          as ends_at,
      a.tail_number                      as aircraft_tail,
      r.aircraft_id::text                as aircraft_id,
      ipp.first_name                     as instructor_first,
      ipp.last_name                      as instructor_last,
      iu.email                           as instructor_email,
      r.instructor_id::text              as instructor_id,
      spp.first_name                     as student_first,
      spp.last_name                      as student_last,
      su.email                           as student_email,
      r.student_id::text                 as student_id,
      rm.name                            as room_name,
      r.room_id::text                    as room_id,
      r.notes
    from public.reservation r
    left join public.aircraft       a   on a.id   = r.aircraft_id
    left join public.users          iu  on iu.id  = r.instructor_id
    left join public.person_profile ipp on ipp.user_id = r.instructor_id
    left join public.users          su  on su.id  = r.student_id
    left join public.person_profile spp on spp.user_id = r.student_id
    left join public.room           rm  on rm.id  = r.room_id
    where r.school_id  = ${me.schoolId}::uuid
      and r.status     = 'requested'
      and r.deleted_at is null
    order by lower(r.time_range) asc
    limit 500
  `)) as unknown as ApprovalRow[];

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Schedule"
        title="Pending Approvals"
        subtitle={`${rows.length} ${rows.length === 1 ? 'request' : 'requests'} waiting for instructor or admin review.`}
      />
      <ApprovalList
        rows={rows.map((r) => ({
          id: r.id,
          activityType: r.activity_type,
          status: r.status,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          aircraftTail: r.aircraft_tail,
          aircraftId: r.aircraft_id,
          instructorName: formatPerson(r.instructor_first, r.instructor_last, r.instructor_email),
          instructorId: r.instructor_id,
          studentName: formatPerson(r.student_first, r.student_last, r.student_email),
          studentId: r.student_id,
          roomName: r.room_name,
          notes: r.notes,
        }))}
      />
    </main>
  );
}

function formatPerson(
  first: string | null,
  last: string | null,
  email: string | null,
): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (email) return email;
  return null;
}
