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

  const CHIP_LINK: React.CSSProperties = {
    display: 'inline-flex',
    padding: '0.35rem 0.75rem',
    borderRadius: 6,
    fontSize: '0.7rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
    background: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    textDecoration: 'none',
    marginRight: '0.4rem',
  };
  const H3: React.CSSProperties = {
    margin: 0,
    fontSize: '0.72rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    color: '#7a869a',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    fontWeight: 500,
  };

  return (
    <section
      style={{
        marginTop: '1rem',
        padding: '1rem 1.1rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: '0 0 0.75rem',
          fontSize: '0.75rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          color: '#7a869a',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          fontWeight: 500,
        }}
      >
        Training Record
      </h2>
      <div style={{ marginBottom: '0.9rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <a
          href={`/admin/students/${studentUserId}/iacra.pdf`}
          target="_blank"
          rel="noreferrer"
          style={CHIP_LINK}
        >
          IACRA PDF
        </a>
        <a href={`/admin/students/${studentUserId}/iacra.csv`} style={CHIP_LINK}>
          IACRA CSV
        </a>
        {active ? (
          <a
            href={`/admin/students/${studentUserId}/courses/${active.id}/record.pdf`}
            target="_blank"
            rel="noreferrer"
            style={CHIP_LINK}
          >
            141.101 Training Record
          </a>
        ) : null}
      </div>
      {enrollments.length === 0 ? (
        <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>
          Not enrolled in any course.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: '0.75rem', fontSize: '0.88rem', color: '#cbd5e1' }}>
            <span style={H3}>Current enrollment</span>
            <br />
            {active ? (
              <Link
                href={`/admin/enrollments/${active.id}`}
                style={{ color: '#38bdf8', textDecoration: 'none' }}
              >
                {active.course_code} — {active.course_title} · {active.version_label}
              </Link>
            ) : (
              <span style={{ color: '#5b6784' }}>none (last was inactive)</span>
            )}
          </div>
          {enrollments.length > 1 ? (
            <p style={{ fontSize: '0.78rem', color: '#7a869a', margin: 0 }}>
              {enrollments.length} enrollment(s) total on file.
            </p>
          ) : null}
        </>
      )}

      <div style={{ marginTop: '0.9rem' }}>
        <span style={H3}>Recent grade sheets</span>
        {sheets.length === 0 ? (
          <p style={{ color: '#5b6784', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>none</p>
        ) : (
          <ul
            style={{
              fontSize: '0.85rem',
              margin: '0.4rem 0 0',
              paddingLeft: '1.1rem',
              color: '#cbd5e1',
            }}
          >
            {sheets.map((s) => (
              <li key={s.id} style={{ marginBottom: '0.3rem' }}>
                {s.lesson_code} — {s.lesson_title}{' '}
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '0.1rem 0.45rem',
                    borderRadius: 4,
                    background: s.sealed_at
                      ? 'rgba(52, 211, 153, 0.12)'
                      : 'rgba(251, 191, 36, 0.14)',
                    color: s.sealed_at ? '#34d399' : '#fbbf24',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  {s.sealed_at ? 'sealed' : s.status}
                </span>{' '}
                <span style={{ color: '#5b6784', fontSize: '0.78rem' }}>
                  {new Date(s.conducted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: '0.9rem' }}>
        <span style={H3}>Endorsements</span>
        {endorsements.length === 0 ? (
          <p style={{ color: '#5b6784', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>none</p>
        ) : (
          <ul
            style={{
              fontSize: '0.85rem',
              margin: '0.4rem 0 0',
              paddingLeft: '1.1rem',
              color: '#cbd5e1',
            }}
          >
            {endorsements.map((e) => {
              const expired = e.expires_at && new Date(e.expires_at).getTime() < Date.now();
              const revoked = e.revoked_at !== null;
              const activeStatus = !expired && !revoked;
              return (
                <li key={e.id} style={{ marginBottom: '0.3rem' }}>
                  {e.template_code ?? 'custom'} — {e.template_title ?? ''}{' '}
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '0.1rem 0.45rem',
                      borderRadius: 4,
                      background: activeStatus
                        ? 'rgba(52, 211, 153, 0.12)'
                        : 'rgba(248, 113, 113, 0.14)',
                      color: activeStatus ? '#34d399' : '#f87171',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
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
