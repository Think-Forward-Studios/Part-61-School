import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  users,
  studentCourseEnrollment,
  courseVersion,
  course,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EnrollmentActions } from './EnrollmentActions';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function EnrollmentDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const e = (
    await db
      .select()
      .from(studentCourseEnrollment)
      .where(
        and(
          eq(studentCourseEnrollment.id, id),
          eq(studentCourseEnrollment.schoolId, me.schoolId),
          isNull(studentCourseEnrollment.deletedAt),
        ),
      )
      .limit(1)
  )[0];
  if (!e) notFound();

  let cv: { id: string; versionLabel: string; courseId: string } | null = null;
  let c: { code: string; title: string } | null = null;
  if (e.courseVersionId) {
    const vr = (
      await db
        .select()
        .from(courseVersion)
        .where(eq(courseVersion.id, e.courseVersionId))
        .limit(1)
    )[0];
    if (vr) {
      cv = { id: vr.id, versionLabel: vr.versionLabel, courseId: vr.courseId };
      const cr = (
        await db.select().from(course).where(eq(course.id, vr.courseId)).limit(1)
      )[0];
      if (cr) c = { code: cr.code, title: cr.title };
    }
  }

  const student = (await db.select().from(users).where(eq(users.id, e.userId)).limit(1))[0];
  const studentName = student?.fullName ?? student?.email ?? 'Unknown';

  // Recent grade sheets
  const sheets = (await db.execute(sql`
    select gs.id, gs.status, gs.sealed_at, gs.conducted_at, l.code as lesson_code, l.title as lesson_title
    from public.lesson_grade_sheet gs
    join public.lesson l on l.id = gs.lesson_id
    where gs.student_enrollment_id = ${id}::uuid
    order by gs.conducted_at desc
    limit 10
  `)) as unknown as Array<{
    id: string;
    status: string;
    sealed_at: string | null;
    conducted_at: string;
    lesson_code: string;
    lesson_title: string;
  }>;

  const isActive = !e.completedAt && !e.withdrawnAt;

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <p style={{ fontSize: '0.85rem' }}>
        <Link href="/admin/enrollments">← Enrollments</Link>
      </p>
      <h1>{studentName}</h1>
      <p style={{ color: '#555' }}>
        {c ? `${c.code} — ${c.title}` : '—'}
        {cv ? ` · version ${cv.versionLabel}` : ''}
      </p>
      <p style={{ fontSize: '0.85rem' }}>
        Enrolled {new Date(e.enrolledAt).toLocaleDateString()}
        {e.completedAt ? ` · completed ${new Date(e.completedAt).toLocaleDateString()}` : ''}
        {e.withdrawnAt ? ` · withdrawn ${new Date(e.withdrawnAt).toLocaleDateString()}` : ''}
      </p>

      {isActive ? <EnrollmentActions enrollmentId={id} /> : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Recent grade sheets</h2>
        {sheets.length === 0 ? (
          <p style={{ color: '#888' }}>No grade sheets yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {sheets.map((s) => (
              <li key={s.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                <strong>{s.lesson_code}</strong> — {s.lesson_title}{' '}
                <span
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: 3,
                    background: s.sealed_at ? '#dcfce7' : '#fef3c7',
                  }}
                >
                  {s.sealed_at ? 'sealed' : s.status}
                </span>{' '}
                <span style={{ color: '#888', fontSize: '0.8rem' }}>
                  {new Date(s.conducted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
