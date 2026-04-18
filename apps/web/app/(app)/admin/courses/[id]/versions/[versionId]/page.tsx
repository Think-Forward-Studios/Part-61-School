import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  db,
  users,
  course,
  courseVersion,
  stage,
  coursePhase,
  unit,
  lesson,
  lineItem,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { gradingScaleLabels, type GradingScale } from '@part61/domain';
import { VersionTreeEditor } from './VersionTreeEditor';
import { PublishVersionButton } from './PublishVersionButton';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; versionId: string }>;

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

export default async function VersionEditorPage({ params }: { params: Params }) {
  const { id, versionId } = await params;
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

  const [stages, phases, units, lessons, lineItems] = await Promise.all([
    db
      .select()
      .from(stage)
      .where(and(eq(stage.courseVersionId, versionId), isNull(stage.deletedAt)))
      .orderBy(asc(stage.position)),
    db
      .select()
      .from(coursePhase)
      .where(and(eq(coursePhase.courseVersionId, versionId), isNull(coursePhase.deletedAt)))
      .orderBy(asc(coursePhase.position)),
    db
      .select()
      .from(unit)
      .where(and(eq(unit.courseVersionId, versionId), isNull(unit.deletedAt)))
      .orderBy(asc(unit.position)),
    db
      .select()
      .from(lesson)
      .where(and(eq(lesson.courseVersionId, versionId), isNull(lesson.deletedAt)))
      .orderBy(asc(lesson.position)),
    db
      .select()
      .from(lineItem)
      .where(and(eq(lineItem.courseVersionId, versionId), isNull(lineItem.deletedAt)))
      .orderBy(asc(lineItem.position)),
  ]);

  const isPublished = v.publishedAt !== null;
  const canEdit = !isPublished && c.schoolId === me.schoolId;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href={`/admin/courses/${id}`} style={BACK_LINK}>
        ← {c.code}
      </Link>
      <PageHeader
        eyebrow="Training"
        title={`${c.code} · ${v.versionLabel}`}
        subtitle={`Grading scale: ${gradingScaleLabels[v.gradingScale as GradingScale]} · Min levels: ${v.minLevels}`}
      />

      {isPublished ? (
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
          <strong style={{ color: '#fbbf24' }}>Published — read-only.</strong>{' '}
          <span style={{ color: '#cbd5e1' }}>
            This version was sealed on {new Date(v.publishedAt!).toLocaleString()}. Create a new
            version to make changes.
          </span>
        </div>
      ) : canEdit ? (
        <div style={{ marginTop: '0.5rem' }}>
          <PublishVersionButton versionId={versionId} />
        </div>
      ) : null}

      <VersionTreeEditor
        courseId={id}
        versionId={versionId}
        canEdit={canEdit}
        initialStages={stages.map((s) => ({
          id: s.id,
          position: s.position,
          code: s.code,
          title: s.title,
        }))}
        initialPhases={phases.map((p) => ({
          id: p.id,
          stageId: p.stageId,
          position: p.position,
          code: p.code,
          title: p.title,
        }))}
        initialUnits={units.map((u) => ({
          id: u.id,
          stageId: u.stageId,
          coursePhaseId: u.coursePhaseId,
          position: u.position,
          code: u.code,
          title: u.title,
        }))}
        initialLessons={lessons.map((l) => ({
          id: l.id,
          stageId: l.stageId,
          coursePhaseId: l.coursePhaseId,
          unitId: l.unitId,
          position: l.position,
          code: l.code,
          title: l.title,
          kind: l.kind,
        }))}
        initialLineItems={lineItems.map((li) => ({
          id: li.id,
          lessonId: li.lessonId,
          position: li.position,
          code: li.code,
          title: li.title,
          classification: li.classification,
        }))}
      />
    </main>
  );
}
