import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, users, course, courseVersion } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { gradingScaleLabels, type GradingScale } from '@part61/domain';
import { ForkCourseButton } from './ForkCourseButton';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function CourseDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me?.schoolId) redirect('/login');

  const c = (
    await db
      .select()
      .from(course)
      .where(and(eq(course.id, id), isNull(course.deletedAt)))
      .limit(1)
  )[0];
  if (!c) notFound();

  const versions = await db
    .select()
    .from(courseVersion)
    .where(and(eq(courseVersion.courseId, id), isNull(courseVersion.deletedAt)))
    .orderBy(asc(courseVersion.createdAt));

  const isSystemTemplate = c.schoolId === null;
  const isOwned = c.schoolId === me.schoolId;

  const drafts = versions.filter((v) => v.publishedAt === null);
  const published = versions.filter((v) => v.publishedAt !== null);

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <p style={{ fontSize: '0.85rem' }}>
        <Link href="/admin/courses">← Courses</Link>
      </p>
      <h1>
        {c.code} · {c.title}
      </h1>
      <p style={{ color: '#555' }}>
        Rating sought: {c.ratingSought.replace(/_/g, ' ')}
        {isSystemTemplate ? ' · system template (read-only)' : ' · school-owned'}
      </p>
      {c.description ? (
        <p style={{ marginTop: '0.5rem' }}>{c.description}</p>
      ) : null}

      {isSystemTemplate && versions.length > 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <ForkCourseButton
            sourceVersionId={versions[versions.length - 1]!.id}
            defaultCode={`${c.code}-fork`}
            defaultTitle={c.title}
          />
        </div>
      ) : null}

      <section style={{ marginTop: '2rem' }}>
        <h2>Drafts</h2>
        {drafts.length === 0 ? (
          <p style={{ color: '#888' }}>No draft versions.</p>
        ) : (
          <VersionTable rows={drafts} courseId={id} showEdit={isOwned} />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Published (read-only)</h2>
        {published.length === 0 ? (
          <p style={{ color: '#888' }}>No published versions yet.</p>
        ) : (
          <VersionTable rows={published} courseId={id} showEdit={false} />
        )}
      </section>
    </main>
  );
}

function VersionTable({
  rows,
  courseId,
  showEdit,
}: {
  rows: Array<{
    id: string;
    versionLabel: string;
    gradingScale: string;
    publishedAt: Date | null;
    createdAt: Date;
  }>;
  courseId: string;
  showEdit: boolean;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
          <th style={{ padding: '0.5rem' }}>Version</th>
          <th style={{ padding: '0.5rem' }}>Grading scale</th>
          <th style={{ padding: '0.5rem' }}>Created</th>
          <th style={{ padding: '0.5rem' }}>Published</th>
          <th style={{ padding: '0.5rem' }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '0.5rem' }}>{v.versionLabel}</td>
            <td style={{ padding: '0.5rem' }}>
              {gradingScaleLabels[v.gradingScale as GradingScale] ?? v.gradingScale}
            </td>
            <td style={{ padding: '0.5rem' }}>
              {new Date(v.createdAt).toLocaleDateString()}
            </td>
            <td style={{ padding: '0.5rem' }}>
              {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : '—'}
            </td>
            <td style={{ padding: '0.5rem' }}>
              <Link href={`/admin/courses/${courseId}/versions/${v.id}`}>
                {showEdit && !v.publishedAt ? 'Edit' : 'View'} →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
