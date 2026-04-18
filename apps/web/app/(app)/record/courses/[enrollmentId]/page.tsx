/**
 * /record/courses/[enrollmentId] — student per-enrollment detail (STU-02).
 *
 * Read-only. Refuses if the enrollment does not belong to the caller.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db, users } from '@part61/db';
import { eq, sql } from 'drizzle-orm';
import { loadTrainingRecord } from '@/lib/trainingRecord';
import { StudentNextActivityChip } from '../../_components/StudentNextActivityChip';
import { StudentProgressForecastPanel } from '../../_components/StudentProgressForecastPanel';
import { StudentMinimumsPanel } from '../../_components/StudentMinimumsPanel';
import { StudentRolloverQueuePanel } from '../../_components/StudentRolloverQueuePanel';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ enrollmentId: string }>;

type RolloverRow = {
  line_item_grade_id: string;
  source_lesson_title: string;
  source_sealed_at: string | null;
  target_lesson_title: string;
  line_item_objective: string | null;
  line_item_classification: string;
};

const SECTION_HEADING: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a869a',
  marginBottom: '0.5rem',
  fontWeight: 500,
};

const CARD: React.CSSProperties = {
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
  padding: '1rem 1.1rem',
};

const EMPTY: React.CSSProperties = {
  padding: '2rem 1rem',
  textAlign: 'center',
  color: '#7a869a',
  fontSize: '0.88rem',
  background: '#0d1220',
  border: '1px dashed #1f2940',
  borderRadius: 12,
};

export default async function StudentEnrollmentPage({ params }: { params: Params }) {
  const { enrollmentId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me || !me.schoolId) redirect('/login');

  const data = await loadTrainingRecord(enrollmentId, me.schoolId, user.id);
  if (!data) notFound();

  const { course, gradeSheets, stageChecks, endorsements, testGrades } = data;

  // Phase 6: rollover line items for this enrollment
  const rolloverRows = (await db.execute(sql`
    select
      lig.id               as line_item_grade_id,
      src_lesson.title     as source_lesson_title,
      src_sheet.sealed_at  as source_sealed_at,
      tgt_lesson.title     as target_lesson_title,
      li.objectives        as line_item_objective,
      li.classification    as line_item_classification
    from public.line_item_grade lig
    join public.lesson_grade_sheet tgt_sheet on tgt_sheet.id = lig.grade_sheet_id
    join public.lesson           tgt_lesson on tgt_lesson.id = tgt_sheet.lesson_id
    join public.lesson_grade_sheet src_sheet on src_sheet.id = lig.rollover_from_grade_sheet_id
    join public.lesson           src_lesson on src_lesson.id = src_sheet.lesson_id
    join public.line_item        li         on li.id = lig.line_item_id
    where tgt_sheet.student_enrollment_id = ${enrollmentId}::uuid
      and lig.rollover_from_grade_sheet_id is not null
      and tgt_sheet.sealed_at is null
    order by src_sheet.sealed_at desc
  `)) as unknown as RolloverRow[];

  // Check if enrollment is active (not completed or withdrawn)
  const isActive = !course.completedAt;

  const courseCodeTitle = `${course.courseCode ?? 'course'} — ${course.courseTitle ?? '\u2014'}`;
  const subtitle = `Version ${course.versionLabel ?? '\u2014'} · enrolled ${new Date(
    course.enrolledAt,
  ).toLocaleDateString()}${
    course.completedAt ? ` · completed ${new Date(course.completedAt).toLocaleDateString()}` : ''
  }`;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <p style={{ marginBottom: '0.5rem' }}>
        <Link href="/record" style={{ color: '#38bdf8', fontSize: '0.85rem' }}>
          ← Back to My Training Record
        </Link>
      </p>
      <PageHeader
        eyebrow="Training"
        title={courseCodeTitle}
        subtitle={subtitle}
        actions={
          <a
            href={`/record/courses/${enrollmentId}/export.pdf`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block',
              padding: '0.55rem 0.95rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            Download 141.101 PDF
          </a>
        }
      />

      {/* Phase 6: Progress surfaces scoped to this enrollment */}
      {isActive ? (
        <>
          <StudentNextActivityChip enrollmentId={enrollmentId} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
            }}
          >
            <StudentProgressForecastPanel />
            <StudentMinimumsPanel enrollmentId={enrollmentId} />
          </div>

          <StudentRolloverQueuePanel rows={rolloverRows} />
        </>
      ) : null}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Grade sheets (sealed)</h2>
        {gradeSheets.length === 0 ? (
          <div style={EMPTY}>No sealed grade sheets yet.</div>
        ) : (
          <div style={CARD}>
            <ul
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.7,
                margin: 0,
                paddingLeft: '1.1rem',
                color: '#cbd5e1',
              }}
            >
              {gradeSheets.map((g) => (
                <li key={g.id}>
                  🔒 {new Date(g.conductedAt).toLocaleDateString()} · {g.lessonCode} —{' '}
                  {g.lessonTitle} (gnd {g.groundMinutes}m / flt {g.flightMinutes}m)
                  {g.signer ? (
                    <span style={{ color: '#7a869a' }}> · {g.signer.fullName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Stage checks</h2>
        {stageChecks.length === 0 ? (
          <div style={EMPTY}>No stage checks yet.</div>
        ) : (
          <div style={CARD}>
            <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: '1.1rem', color: '#cbd5e1' }}>
              {stageChecks.map((s) => (
                <li key={s.id}>
                  🔒 {s.stageCode} — {s.stageTitle} ·{' '}
                  <strong style={{ color: '#f7f9fc' }}>{s.status}</strong>
                  {s.conductedAt ? ` · ${new Date(s.conductedAt).toLocaleDateString()}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Endorsements</h2>
        {endorsements.length === 0 ? (
          <div style={EMPTY}>No endorsements on file.</div>
        ) : (
          <div style={CARD}>
            <ul
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.55,
                margin: 0,
                paddingLeft: '1.1rem',
                color: '#cbd5e1',
              }}
            >
              {endorsements.map((e) => (
                <li key={e.id} style={{ marginBottom: '0.5rem' }}>
                  🔒 <strong style={{ color: '#f7f9fc' }}>{e.templateCode ?? 'custom'}</strong> —{' '}
                  {e.templateTitle ?? ''}{' '}
                  <span style={{ color: '#7a869a' }}>
                    {new Date(e.issuedAt).toLocaleDateString()}
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#a3acc2', marginTop: 2 }}>
                    {e.renderedText}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Test grades</h2>
        {testGrades.length === 0 ? (
          <div style={EMPTY}>No test grades on file.</div>
        ) : (
          <div style={CARD}>
            <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: '1.1rem', color: '#cbd5e1' }}>
              {testGrades.map((t) => (
                <li key={t.id}>
                  🔒 {new Date(t.recordedAt).toLocaleDateString()} · {t.testKind} ({t.componentKind}
                  ){t.score != null ? ` · ${t.score}/${t.maxScore ?? '—'}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
