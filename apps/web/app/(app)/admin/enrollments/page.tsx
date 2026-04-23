import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, users, studentCourseEnrollment } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { NewEnrollmentDialog } from './NewEnrollmentDialog';

export const dynamic = 'force-dynamic';

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

const ACTION_LINK: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.3rem 0.7rem',
  border: '1px solid rgba(56, 189, 248, 0.35)',
  background: 'rgba(56, 189, 248, 0.10)',
  color: '#38bdf8',
  borderRadius: 6,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  textDecoration: 'none',
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

const EMPTY: React.CSSProperties = {
  padding: '2.5rem 1rem',
  textAlign: 'center',
  color: '#7a869a',
  fontSize: '0.88rem',
  background: '#0d1220',
  border: '1px dashed #1f2940',
  borderRadius: 12,
};

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="Enrollments"
        subtitle={`${enrollments.length} total · ${active.length} active · ${completed.length} completed`}
        actions={<NewEnrollmentDialog />}
      />

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
      <h2 style={SECTION_HEADING}>{title}</h2>
      {rows.length === 0 ? (
        <div style={EMPTY}>None.</div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Student</th>
                <th style={TH}>Course</th>
                <th style={TH}>Version</th>
                <th style={TH}>Enrolled</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={TD}>
                    <Link
                      href={`/admin/people/${r.student_id}`}
                      style={{ color: '#f7f9fc', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {r.student_name ?? 'Unknown'}
                    </Link>
                  </td>
                  <td style={TD}>
                    {r.course_code ? (
                      <>
                        <span
                          style={{
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            color: '#38bdf8',
                          }}
                        >
                          {r.course_code}
                        </span>{' '}
                        — <span style={{ color: '#f7f9fc' }}>{r.course_title ?? ''}</span>
                      </>
                    ) : (
                      <span style={{ color: '#5b6784' }}>—</span>
                    )}
                  </td>
                  <td style={TD}>
                    {r.version_label ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td style={TD}>{new Date(r.enrolled_at).toLocaleDateString()}</td>
                  <td style={TD}>
                    <Link href={`/admin/enrollments/${r.id}`} style={ACTION_LINK}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
