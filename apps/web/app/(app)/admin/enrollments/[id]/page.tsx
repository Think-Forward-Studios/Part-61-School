import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, studentCourseEnrollment, courseVersion, course } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EnrollmentActions } from './EnrollmentActions';
import { MinimumsStatusPanel } from '../../people/[id]/_panels/MinimumsStatusPanel';
import { ProgressForecastPanel } from '../../people/[id]/_panels/ProgressForecastPanel';
import { RolloverQueuePanel } from '../../people/[id]/_panels/RolloverQueuePanel';
import { NextActivityChip } from '../../people/[id]/_panels/NextActivityChip';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

const BACK_LINK: React.CSSProperties = {
  display: 'inline-block',
  color: '#7a869a',
  textDecoration: 'none',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
};

const SECTION_HEADING: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontFamily: '"Antonio", system-ui, sans-serif',
  fontSize: '1.05rem',
  letterSpacing: '0.02em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

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
      await db.select().from(courseVersion).where(eq(courseVersion.id, e.courseVersionId)).limit(1)
    )[0];
    if (vr) {
      cv = { id: vr.id, versionLabel: vr.versionLabel, courseId: vr.courseId };
      const cr = (await db.select().from(course).where(eq(course.id, vr.courseId)).limit(1))[0];
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

  const subtitleParts: string[] = [];
  if (c) subtitleParts.push(`${c.code} — ${c.title}`);
  if (cv) subtitleParts.push(`version ${cv.versionLabel}`);
  subtitleParts.push(`enrolled ${new Date(e.enrolledAt).toLocaleDateString()}`);
  if (e.completedAt)
    subtitleParts.push(`completed ${new Date(e.completedAt).toLocaleDateString()}`);
  if (e.withdrawnAt)
    subtitleParts.push(`withdrawn ${new Date(e.withdrawnAt).toLocaleDateString()}`);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href="/admin/enrollments" style={BACK_LINK}>
        ← Enrollments
      </Link>
      <PageHeader eyebrow="Training" title={studentName} subtitle={subtitleParts.join(' · ')} />

      {isActive ? <EnrollmentActions enrollmentId={id} /> : null}

      {isActive ? (
        <section
          style={{
            marginTop: '2rem',
            borderTop: '1px solid #1f2940',
            paddingTop: '1.25rem',
          }}
        >
          <h2 style={SECTION_HEADING}>Course progress</h2>
          <MinimumsStatusPanel enrollmentId={id} />
          <ProgressForecastPanel enrollmentId={id} />
          <RolloverQueuePanel enrollmentId={id} />
          <NextActivityChip enrollmentId={id} studentId={e.userId} />
        </section>
      ) : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Recent grade sheets</h2>
        {sheets.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.88rem',
              background: '#0d1220',
              border: '1px dashed #1f2940',
              borderRadius: 12,
            }}
          >
            No grade sheets yet.
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {sheets.map((s) => (
              <li
                key={s.id}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderBottom: '1px solid #161d30',
                  color: '#cbd5e1',
                  fontSize: '0.85rem',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <strong
                  style={{
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    color: '#38bdf8',
                  }}
                >
                  {s.lesson_code}
                </strong>{' '}
                <span style={{ color: '#f7f9fc' }}>{s.lesson_title}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: 999,
                    background: s.sealed_at
                      ? 'rgba(52, 211, 153, 0.12)'
                      : 'rgba(251, 191, 36, 0.12)',
                    color: s.sealed_at ? '#34d399' : '#fbbf24',
                    border: `1px solid ${
                      s.sealed_at ? 'rgba(52, 211, 153, 0.35)' : 'rgba(251, 191, 36, 0.35)'
                    }`,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {s.sealed_at ? 'sealed' : s.status}
                </span>
                <span style={{ color: '#7a869a', fontSize: '0.78rem', marginLeft: 'auto' }}>
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
