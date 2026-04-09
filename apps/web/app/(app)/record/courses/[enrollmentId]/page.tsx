/**
 * /record/courses/[enrollmentId] — student per-enrollment detail (STU-02).
 *
 * Read-only. Refuses if the enrollment does not belong to the caller.
 */
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db, users } from '@part61/db';
import { eq } from 'drizzle-orm';
import { loadTrainingRecord } from '@/lib/trainingRecord';

export const dynamic = 'force-dynamic';

type Params = Promise<{ enrollmentId: string }>;

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

  return (
    <main style={{ padding: '1rem', maxWidth: 960 }}>
      <p>
        <Link href="/record">← Back to My Training Record</Link>
      </p>
      <h1>
        {course.courseCode ?? 'course'} — {course.courseTitle ?? '—'}
      </h1>
      <p style={{ color: '#555' }}>
        Version {course.versionLabel ?? '—'} · enrolled{' '}
        {new Date(course.enrolledAt).toLocaleDateString()}
        {course.completedAt
          ? ` · completed ${new Date(course.completedAt).toLocaleDateString()}`
          : ''}
      </p>

      <p>
        <a
          href={`/record/courses/${enrollmentId}/export.pdf`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            padding: '0.5rem 0.75rem',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          Download 141.101 Training Record PDF
        </a>
      </p>

      <section style={{ marginTop: '1rem' }}>
        <h2>Grade sheets (sealed)</h2>
        {gradeSheets.length === 0 ? (
          <p style={{ color: '#888' }}>No sealed grade sheets yet.</p>
        ) : (
          <ul style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
            {gradeSheets.map((g) => (
              <li key={g.id}>
                🔒 {new Date(g.conductedAt).toLocaleDateString()} · {g.lessonCode} —{' '}
                {g.lessonTitle} (gnd {g.groundMinutes}m / flt {g.flightMinutes}m)
                {g.signer ? (
                  <span style={{ color: '#888' }}> · {g.signer.fullName}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Stage checks</h2>
        {stageChecks.length === 0 ? (
          <p style={{ color: '#888' }}>No stage checks yet.</p>
        ) : (
          <ul style={{ fontSize: '0.9rem' }}>
            {stageChecks.map((s) => (
              <li key={s.id}>
                🔒 {s.stageCode} — {s.stageTitle} · <strong>{s.status}</strong>
                {s.conductedAt
                  ? ` · ${new Date(s.conductedAt).toLocaleDateString()}`
                  : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Endorsements</h2>
        {endorsements.length === 0 ? (
          <p style={{ color: '#888' }}>No endorsements on file.</p>
        ) : (
          <ul style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
            {endorsements.map((e) => (
              <li key={e.id} style={{ marginBottom: '0.5rem' }}>
                🔒 <strong>{e.templateCode ?? 'custom'}</strong> — {e.templateTitle ?? ''}{' '}
                <span style={{ color: '#888' }}>
                  {new Date(e.issuedAt).toLocaleDateString()}
                </span>
                <div style={{ fontSize: '0.85rem', color: '#444', marginTop: 2 }}>
                  {e.renderedText}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Test grades</h2>
        {testGrades.length === 0 ? (
          <p style={{ color: '#888' }}>No test grades on file.</p>
        ) : (
          <ul style={{ fontSize: '0.9rem' }}>
            {testGrades.map((t) => (
              <li key={t.id}>
                🔒 {new Date(t.recordedAt).toLocaleDateString()} · {t.testKind} (
                {t.componentKind})
                {t.score != null ? ` · ${t.score}/${t.maxScore ?? '—'}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
