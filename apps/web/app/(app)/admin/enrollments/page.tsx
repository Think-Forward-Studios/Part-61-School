import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, users, studentCourseEnrollment } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EnrollmentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const enrollments = await db
    .select()
    .from(studentCourseEnrollment)
    .where(
      and(
        eq(studentCourseEnrollment.schoolId, me.schoolId),
        isNull(studentCourseEnrollment.deletedAt),
      ),
    )
    .orderBy(desc(studentCourseEnrollment.enrolledAt));

  // Join student name + course title via raw SQL
  const joined = (await db.execute(sql`
    select
      sce.id,
      sce.user_id as student_id,
      sce.enrolled_at,
      sce.completed_at,
      sce.withdrawn_at,
      sce.course_version_id,
      coalesce(
        nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''),
        u.full_name,
        u.email
      ) as student_name,
      c.code as course_code,
      c.title as course_title,
      cv.version_label
    from public.student_course_enrollment sce
    join public.users u on u.id = sce.user_id
    left join public.person_profile pp on pp.user_id = sce.user_id
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.school_id = ${me.schoolId}::uuid
      and sce.deleted_at is null
    order by sce.enrolled_at desc
  `)) as unknown as Array<{
    id: string;
    student_id: string;
    student_name: string | null;
    course_code: string | null;
    course_title: string | null;
    version_label: string | null;
    enrolled_at: string;
    completed_at: string | null;
    withdrawn_at: string | null;
  }>;

  const active = joined.filter((e) => !e.completed_at && !e.withdrawn_at);
  const completed = joined.filter((e) => e.completed_at);
  const withdrawn = joined.filter((e) => e.withdrawn_at);

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Enrollments</h1>
      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        {enrollments.length} total · {active.length} active · {completed.length} completed
      </p>

      <Section title="Active" rows={active} />
      <Section title="Completed" rows={completed} />
      <Section title="Withdrawn" rows={withdrawn} />
    </main>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    student_id: string;
    student_name: string | null;
    course_code: string | null;
    course_title: string | null;
    version_label: string | null;
    enrolled_at: string;
  }>;
}) {
  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>None.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Student</th>
              <th style={{ padding: '0.5rem' }}>Course</th>
              <th style={{ padding: '0.5rem' }}>Version</th>
              <th style={{ padding: '0.5rem' }}>Enrolled</th>
              <th style={{ padding: '0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>
                  <Link href={`/admin/people/${r.student_id}`}>
                    {r.student_name ?? 'Unknown'}
                  </Link>
                </td>
                <td style={{ padding: '0.5rem' }}>
                  {r.course_code ? `${r.course_code} — ${r.course_title ?? ''}` : '—'}
                </td>
                <td style={{ padding: '0.5rem' }}>{r.version_label ?? '—'}</td>
                <td style={{ padding: '0.5rem' }}>
                  {new Date(r.enrolled_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <Link href={`/admin/enrollments/${r.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
