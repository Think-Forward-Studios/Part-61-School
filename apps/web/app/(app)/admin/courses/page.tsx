import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db, users, course } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me?.schoolId) redirect('/login');

  const allCourses = await db
    .select()
    .from(course)
    .where(
      and(
        isNull(course.deletedAt),
        or(isNull(course.schoolId), eq(course.schoolId, me.schoolId)),
      ),
    )
    .orderBy(asc(course.code));

  const systemTemplates = allCourses.filter((c) => c.schoolId === null);
  const schoolCourses = allCourses.filter((c) => c.schoolId !== null);

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Courses</h1>
      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        System templates are read-only; fork one to create an editable school draft.
        School-owned courses can be edited while drafts and sealed once published.
      </p>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>System templates</h2>
        {systemTemplates.length === 0 ? (
          <p style={{ color: '#888' }}>No system templates installed.</p>
        ) : (
          <CourseTable rows={systemTemplates} owned={false} />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>School courses</h2>
        {schoolCourses.length === 0 ? (
          <p style={{ color: '#888' }}>
            No school courses yet. Fork a template above or create a new course.
          </p>
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
    ratingSought: string;
    description: string | null;
  }>;
  owned: boolean;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
          <th style={{ padding: '0.5rem' }}>Code</th>
          <th style={{ padding: '0.5rem' }}>Title</th>
          <th style={{ padding: '0.5rem' }}>Rating sought</th>
          <th style={{ padding: '0.5rem' }}>{owned ? 'Edit' : 'Fork'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{r.code}</td>
            <td style={{ padding: '0.5rem' }}>{r.title}</td>
            <td style={{ padding: '0.5rem' }}>{r.ratingSought.replace(/_/g, ' ')}</td>
            <td style={{ padding: '0.5rem' }}>
              <Link href={`/admin/courses/${r.id}`}>{owned ? 'Open' : 'View / Fork'}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
