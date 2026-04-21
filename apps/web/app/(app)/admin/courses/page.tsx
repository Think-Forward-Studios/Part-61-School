import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db, users, course } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

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

/**
 * /admin/courses — course catalog (SYL-02/03).
 *
 * Two sections:
 *  - System templates (school_id is null) — forkable
 *  - School-owned courses — editable
 */
export default async function AdminCoursesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  let allCourses: Array<typeof course.$inferSelect> = [];
  try {
    allCourses = await db
      .select()
      .from(course)
      .where(
        and(
          isNull(course.deletedAt),
          or(isNull(course.schoolId), eq(course.schoolId, me.schoolId)),
        ),
      )
      .orderBy(asc(course.code));
  } catch (err) {
    // Surface the real Postgres / pooler error in Vercel logs instead of
    // letting it bubble as a generic digest.
    console.error('[admin/courses] query failed:', err);
    throw err;
  }

  const systemTemplates = allCourses.filter((c) => c.schoolId === null);
  const schoolCourses = allCourses.filter((c) => c.schoolId !== null);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="Courses"
        subtitle="System templates are read-only; fork one to create an editable school draft. School-owned courses can be edited while drafts and sealed once published."
      />

      <section style={{ marginTop: '0.5rem' }}>
        <h2 style={SECTION_HEADING}>System templates</h2>
        {systemTemplates.length === 0 ? (
          <div style={EMPTY}>No system templates installed.</div>
        ) : (
          <CourseTable rows={systemTemplates} owned={false} />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={SECTION_HEADING}>School courses</h2>
        {schoolCourses.length === 0 ? (
          <div style={EMPTY}>
            No school courses yet. Fork a template above or create a new course.
          </div>
        ) : (
          <CourseTable rows={schoolCourses} owned={true} />
        )}
      </section>
    </main>
  );
}

function CourseTable({
  rows,
  owned,
}: {
  rows: Array<{
    id: string;
    code: string;
    title: string;
    ratingSought: string | null;
    description: string | null;
  }>;
  owned: boolean;
}) {
  return (
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
            <th style={TH}>Code</th>
            <th style={TH}>Title</th>
            <th style={TH}>Rating sought</th>
            <th style={TH}>{owned ? 'Edit' : 'Fork'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
              <td
                style={{
                  ...TD,
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  color: '#f7f9fc',
                  fontSize: '0.8rem',
                }}
              >
                {r.code}
              </td>
              <td style={{ ...TD, color: '#f7f9fc' }}>{r.title}</td>
              <td style={TD}>
                {r.ratingSought ? (
                  r.ratingSought.replace(/_/g, ' ')
                ) : (
                  <span style={{ color: '#5b6784' }}>—</span>
                )}
              </td>
              <td style={TD}>
                <Link href={`/admin/courses/${r.id}`} style={ACTION_LINK}>
                  {owned ? 'Open' : 'View / Fork'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
