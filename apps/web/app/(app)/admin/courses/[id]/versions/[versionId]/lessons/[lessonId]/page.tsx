import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, users, course, courseVersion, lesson, lineItem } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { lessonKindLabels, type LessonKind } from '@part61/domain';
import { LessonEditor } from './LessonEditor';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; versionId: string; lessonId: string }>;

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

const SUBHEADING: React.CSSProperties = {
  margin: '0 0 0.35rem',
  fontFamily: '"Barlow Condensed", system-ui, sans-serif',
  fontSize: '0.95rem',
  letterSpacing: '0.08em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

const PANEL: React.CSSProperties = {
  marginTop: '1rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 10,
  padding: '1rem',
};

export default async function LessonEditorPage({ params }: { params: Params }) {
  const { id, versionId, lessonId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const c = (await db.select().from(course).where(eq(course.id, id)).limit(1))[0];
  if (!c) notFound();
  const v = (
    await db.select().from(courseVersion).where(eq(courseVersion.id, versionId)).limit(1)
  )[0];
  if (!v) notFound();
  const l = (await db.select().from(lesson).where(eq(lesson.id, lessonId)).limit(1))[0];
  if (!l) notFound();

  const items = await db
    .select()
    .from(lineItem)
    .where(and(eq(lineItem.lessonId, lessonId), isNull(lineItem.deletedAt)))
    .orderBy(asc(lineItem.position));

  const canEdit = v.publishedAt === null && c.schoolId === me.schoolId;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href={`/admin/courses/${id}/versions/${versionId}`} style={BACK_LINK}>
        ← {c.code} {v.versionLabel}
      </Link>
      <PageHeader
        eyebrow="Training"
        title={`Lesson ${l.code}: ${l.title}`}
        subtitle={`Kind: ${lessonKindLabels[l.kind as LessonKind]}${
          l.minHours ? ` · min ${Number(l.minHours).toFixed(1)}h` : ''
        }`}
      />

      {!canEdit ? (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.85rem 1rem',
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            borderRadius: 8,
            color: '#fbbf24',
            fontSize: '0.85rem',
          }}
        >
          <strong style={{ color: '#fbbf24' }}>Read-only.</strong>{' '}
          <span style={{ color: '#cbd5e1' }}>
            This lesson belongs to a published or template version.
          </span>
        </div>
      ) : null}

      {l.objectives ? (
        <section style={PANEL}>
          <h3 style={SUBHEADING}>Objectives</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              margin: 0,
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            {l.objectives}
          </pre>
        </section>
      ) : null}
      {l.completionStandards ? (
        <section style={PANEL}>
          <h3 style={SUBHEADING}>Completion standards</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              margin: 0,
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            {l.completionStandards}
          </pre>
        </section>
      ) : null}

      <LessonEditor
        versionId={versionId}
        lessonId={lessonId}
        canEdit={canEdit}
        initialLineItems={items.map((i) => ({
          id: i.id,
          position: i.position,
          code: i.code,
          title: i.title,
          description: i.description,
          classification: i.classification,
        }))}
      />
    </main>
  );
}
