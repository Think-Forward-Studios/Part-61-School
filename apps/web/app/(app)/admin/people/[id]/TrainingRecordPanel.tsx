import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db';

/**
 * TrainingRecordPanel — server-component read-only summary of a student's
 * current enrollment, recent grade sheets, stage checks, and active
 * endorsements. Deep-links to /admin/enrollments/[id] for full detail.
 */
export async function TrainingRecordPanel({
  studentUserId,
  schoolId,
}: {
  studentUserId: string;
  schoolId: string;
}) {
  const enrollments = (await db.execute(sql`
    select sce.id, sce.enrolled_at, sce.completed_at, sce.withdrawn_at,
      c.code as course_code, c.title as course_title, cv.version_label
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.user_id = ${studentUserId}::uuid
      and sce.school_id = ${schoolId}::uuid
      and sce.deleted_at is null
    order by sce.enrolled_at desc
  `)) as unknown as Array<{
    id: string;
    enrolled_at: string;
    completed_at: string | null;
    withdrawn_at: string | null;
    course_code: string | null;
    course_title: string | null;
    version_label: string | null;
  }>;

  const sheets = (await db.execute(sql`
    select gs.id, gs.status, gs.sealed_at, gs.conducted_at,
      l.code as lesson_code, l.title as lesson_title
    from public.lesson_grade_sheet gs
    join public.lesson l on l.id = gs.lesson_id
    where gs.school_id = ${schoolId}::uuid
      and gs.student_enrollment_id in (
        select id from public.student_course_enrollment where user_id = ${studentUserId}::uuid
      )
    order by gs.conducted_at desc
    limit 5
  `)) as unknown as Array<{
    id: string;
    status: string;
    sealed_at: string | null;
    conducted_at: string;
    lesson_code: string;
    lesson_title: string;
  }>;

  const endorsements = (await db.execute(sql`
    select se.id, se.issued_at, se.expires_at, se.revoked_at,
      et.code as template_code, et.title as template_title
    from public.student_endorsement se
    left join public.endorsement_template et on et.id = se.template_id
    where se.school_id = ${schoolId}::uuid
      and se.student_user_id = ${studentUserId}::uuid
      and se.deleted_at is null
    order by se.issued_at desc
    limit 10
  `)) as unknown as Array<{
    id: string;
    issued_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    template_code: string | null;
    template_title: string | null;
  }>;

  const active = enrollments.find((e) => !e.completed_at && !e.withdrawn_at);

  return (
    <section
      style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}
    >
      <h2>Training Record</h2>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <a
          href={`/admin/students/${studentUserId}/iacra.pdf`}
          target="_blank"
          rel="noreferrer"
          style={{ marginRight: '0.75rem' }}
        >
          Download IACRA PDF
        </a>
        <a
          href={`/admin/students/${studentUserId}/iacra.csv`}
          style={{ marginRight: '0.75rem' }}
        >
          Download IACRA CSV
        </a>
        {active ? (
          <a
            href={`/admin/students/${studentUserId}/courses/${active.id}/record.pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Download 141.101 Training Record PDF
          </a>
        ) : null}
      </div>
      {enrollments.length === 0 ? (
        <p style={{ color: '#888' }}>Not enrolled in any course.</p>
      ) : (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <strong>Current enrollment:</strong>{' '}
            {active ? (
              <>
                <Link href={`/admin/enrollments/${active.id}`}>
                  {active.course_code} — {active.course_title} · {active.version_label}
                </Link>
              </>
            ) : (
              <span style={{ color: '#888' }}>none (last was inactive)</span>
            )}
          </div>
          {enrollments.length > 1 ? (
            <p style={{ fontSize: '0.8rem', color: '#666' }}>
              {enrollments.length} enrollment(s) total on file.
            </p>
          ) : null}
        </>
      )}

      <div style={{ marginTop: '0.75rem' }}>
        <strong>Recent grade sheets:</strong>
        {sheets.length === 0 ? (
          <span style={{ color: '#888' }}> none</span>
        ) : (
          <ul style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {sheets.map((s) => (
              <li key={s.id}>
                {s.lesson_code} — {s.lesson_title}{' '}
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.05rem 0.3rem',
                    background: s.sealed_at ? '#dcfce7' : '#fef3c7',
                    borderRadius: 3,
                  }}
                >
                  {s.sealed_at ? 'sealed' : s.status}
                </span>{' '}
                <span style={{ color: '#888' }}>
                  {new Date(s.conducted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <strong>Endorsements:</strong>
        {endorsements.length === 0 ? (
          <span style={{ color: '#888' }}> none</span>
        ) : (
          <ul style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {endorsements.map((e) => {
              const expired = e.expires_at && new Date(e.expires_at).getTime() < Date.now();
              const revoked = e.revoked_at !== null;
              const activeStatus = !expired && !revoked;
              return (
                <li key={e.id}>
                  {e.template_code ?? 'custom'} — {e.template_title ?? ''}{' '}
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.05rem 0.3rem',
                      borderRadius: 3,
                      background: activeStatus ? '#dcfce7' : '#fee2e2',
                      color: activeStatus ? '#166534' : '#7f1d1d',
                    }}
                  >
                    {revoked ? 'revoked' : expired ? 'expired' : 'current'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
