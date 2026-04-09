import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, users, course, courseVersion, lesson, lineItem } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { lessonKindLabels, type LessonKind } from '@part61/domain';
import { LessonEditor } from './LessonEditor';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; versionId: string; lessonId: string }>;

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
    <main style={{ padding: '1rem', maxWidth: 900 }}>
      <p style={{ fontSize: '0.85rem' }}>
        <Link href={`/admin/courses/${id}/versions/${versionId}`}>← {c.code} {v.versionLabel}</Link>
      </p>
      <h1>
        Lesson {l.code}: {l.title}
      </h1>
      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        Kind: {lessonKindLabels[l.kind as LessonKind]}
        {l.minHours ? ` · min ${Number(l.minHours).toFixed(1)}h` : ''}
      </p>

      {!canEdit ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#fef3c7',
            border: '2px solid #b45309',
            borderRadius: 4,
            color: '#7c2d12',
          }}
        >
          <strong>Read-only.</strong> This lesson belongs to a published or template version.
        </div>
      ) : null}

      {l.objectives ? (
        <section style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.25rem' }}>Objectives</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
            {l.objectives}
          </pre>
        </section>
      ) : null}
      {l.completionStandards ? (
        <section style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.25rem' }}>Completion standards</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
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
