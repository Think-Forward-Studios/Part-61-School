import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, users, course, courseVersion } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { gradingScaleLabels, type GradingScale } from '@part61/domain';
import { ForkCourseButton } from './ForkCourseButton';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

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

export default async function CourseDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href="/admin/courses" style={BACK_LINK}>
        ← Courses
      </Link>
      <PageHeader
        eyebrow="Training"
        title={`${c.code} · ${c.title}`}
        subtitle={`Rating sought: ${c.ratingSought ? c.ratingSought.replace(/_/g, ' ') : '—'}${
          isSystemTemplate ? ' · system template (read-only)' : ' · school-owned'
        }`}
      />

      {c.description ? (
        <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: '0 0 1rem' }}>{c.description}</p>
      ) : null}

      {isSystemTemplate && versions.length > 0 ? (
        <div style={{ marginBottom: '1.5rem' }}>
          <ForkCourseButton
            sourceVersionId={versions[versions.length - 1]!.id}
            defaultCode={`${c.code}-fork`}
            defaultTitle={c.title}
          />
        </div>
      ) : null}

      <section style={{ marginTop: '1rem' }}>
        <h2 style={SECTION_HEADING}>Drafts</h2>
        {drafts.length === 0 ? (
          <div style={EMPTY}>No draft versions.</div>
        ) : (
          <VersionTable rows={drafts} courseId={id} showEdit={isOwned} />
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={SECTION_HEADING}>Published (read-only)</h2>
        {published.length === 0 ? (
          <div style={EMPTY}>No published versions yet.</div>
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
            <th style={TH}>Version</th>
            <th style={TH}>Grading scale</th>
            <th style={TH}>Created</th>
            <th style={TH}>Published</th>
            <th style={TH}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} style={{ borderBottom: '1px solid #161d30' }}>
              <td style={{ ...TD, color: '#f7f9fc', fontWeight: 500 }}>{v.versionLabel}</td>
              <td style={TD}>
                {gradingScaleLabels[v.gradingScale as GradingScale] ?? v.gradingScale}
              </td>
              <td style={TD}>{new Date(v.createdAt).toLocaleDateString()}</td>
              <td style={TD}>
                {v.publishedAt ? (
                  new Date(v.publishedAt).toLocaleDateString()
                ) : (
                  <span style={{ color: '#5b6784' }}>—</span>
                )}
              </td>
              <td style={TD}>
                <Link href={`/admin/courses/${courseId}/versions/${v.id}`} style={ACTION_LINK}>
                  {showEdit && !v.publishedAt ? 'Edit →' : 'View →'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
