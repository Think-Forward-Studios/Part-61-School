/**
 * AdminRecordIndex — admin variant of /record.
 *
 * Admins aren't enrolled in a course, so the student view (CostSummary,
 * NextActivity, Minimums, RolloverQueue, etc.) doesn't apply to them.
 * Instead, this renders a school-wide training-records directory:
 *   - Summary metrics (active enrollments, seals this week, stage-checks
 *     due, endorsements expiring)
 *   - Recent sealed grade sheets across the school
 *   - Directory of all students with an active enrollment, sortable by
 *     last activity, with deep-links to the student's full record under
 *     /admin/people/[id]
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { PageHeader } from '@/components/ui';

type StudentRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  course_code: string | null;
  course_title: string | null;
  enrollment_id: string;
  enrolled_at: string;
  sealed_sheet_count: number;
  last_activity_at: string | null;
  open_holds: number;
};

type RecentSheet = {
  id: string;
  sealed_at: string;
  conducted_at: string;
  lesson_code: string;
  lesson_title: string;
  student_user_id: string;
  student_email: string;
  student_first_name: string | null;
  student_last_name: string | null;
};

type Metrics = {
  active_enrollments: number;
  seals_7d: number;
  stage_checks_due: number;
  endorsements_expiring_30d: number;
};

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

const MONO_TD: React.CSSProperties = {
  ...TD,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.76rem',
};

const METRIC_CARD: React.CSSProperties = {
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
  padding: '1rem 1.1rem',
  flex: '1 1 0',
  minWidth: 180,
};

const METRIC_LABEL: React.CSSProperties = {
  fontSize: '0.62rem',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontWeight: 500,
};

const METRIC_BIG: React.CSSProperties = {
  fontSize: '1.8rem',
  fontWeight: 600,
  margin: '0.4rem 0 0.1rem',
  color: '#f7f9fc',
  fontFamily: '"Antonio", system-ui, sans-serif',
  letterSpacing: '-0.01em',
};

const SECTION_HEADING: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a869a',
  margin: '1.75rem 0 0.6rem',
  fontWeight: 500,
};

function displayName(row: {
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
  return name || row.email || '—';
}

export async function AdminRecordIndex({ currentUserId }: { currentUserId: string }) {
  const me = (await db.select().from(users).where(eq(users.id, currentUserId)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');
  const schoolId = me.schoolId;

  const metricsRow = (await db.execute(sql`
    select
      (select count(*)::int
         from public.student_course_enrollment sce
         where sce.school_id = ${schoolId}::uuid
           and sce.deleted_at is null
           and sce.completed_at is null
           and sce.withdrawn_at is null)                        as active_enrollments,
      (select count(*)::int
         from public.lesson_grade_sheet gs
         where gs.school_id = ${schoolId}::uuid
           and gs.sealed_at is not null
           and gs.sealed_at > now() - interval '7 days')        as seals_7d,
      (select count(*)::int
         from public.stage_check sc
         where sc.school_id = ${schoolId}::uuid
           and sc.deleted_at is null
           and sc.status = 'scheduled')                          as stage_checks_due,
      (select count(*)::int
         from public.student_endorsement se
         where se.school_id = ${schoolId}::uuid
           and se.deleted_at is null
           and se.revoked_at is null
           and se.expires_at is not null
           and se.expires_at > now()
           and se.expires_at < now() + interval '30 days')      as endorsements_expiring_30d
  `)) as unknown as Metrics[];
  const metrics = metricsRow[0] ?? {
    active_enrollments: 0,
    seals_7d: 0,
    stage_checks_due: 0,
    endorsements_expiring_30d: 0,
  };

  const students = (await db.execute(sql`
    select
      u.id                                           as user_id,
      u.email,
      pp.first_name,
      pp.last_name,
      c.code                                         as course_code,
      c.title                                        as course_title,
      sce.id                                         as enrollment_id,
      sce.enrolled_at,
      coalesce(
        (select count(*)::int
           from public.lesson_grade_sheet gs
           where gs.student_enrollment_id = sce.id
             and gs.sealed_at is not null),
        0
      )                                              as sealed_sheet_count,
      (select max(gs.sealed_at)
         from public.lesson_grade_sheet gs
         where gs.student_enrollment_id = sce.id
           and gs.sealed_at is not null)            as last_activity_at,
      coalesce(
        (select count(*)::int
           from public.person_hold ph
           where ph.user_id = u.id
             and ph.cleared_at is null),
        0
      )                                              as open_holds
    from public.student_course_enrollment sce
    join public.users u on u.id = sce.user_id
    left join public.person_profile pp on pp.user_id = u.id
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.school_id = ${schoolId}::uuid
      and sce.deleted_at is null
      and sce.completed_at is null
      and sce.withdrawn_at is null
      and u.deleted_at is null
    order by last_activity_at desc nulls last, coalesce(pp.last_name, u.email)
    limit 500
  `)) as unknown as StudentRow[];

  const recent = (await db.execute(sql`
    select
      gs.id,
      gs.sealed_at,
      gs.conducted_at,
      l.code                as lesson_code,
      l.title               as lesson_title,
      u.id                  as student_user_id,
      u.email               as student_email,
      pp.first_name         as student_first_name,
      pp.last_name          as student_last_name
    from public.lesson_grade_sheet gs
    join public.lesson l on l.id = gs.lesson_id
    join public.student_course_enrollment sce on sce.id = gs.student_enrollment_id
    join public.users u on u.id = sce.user_id
    left join public.person_profile pp on pp.user_id = u.id
    where gs.school_id = ${schoolId}::uuid
      and gs.sealed_at is not null
    order by gs.sealed_at desc
    limit 15
  `)) as unknown as RecentSheet[];

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="Training Records"
        subtitle={`${students.length} active ${students.length === 1 ? 'student' : 'students'} across the school. Jump into any student's full record or review recent sealed activity below.`}
      />

      {/* Metric strip */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={METRIC_CARD}>
          <div style={METRIC_LABEL}>Active Enrollments</div>
          <div style={METRIC_BIG}>{metrics.active_enrollments}</div>
          <div style={{ fontSize: '0.78rem', color: '#7a869a' }}>school-wide</div>
        </div>
        <div style={METRIC_CARD}>
          <div style={METRIC_LABEL}>Seals · 7 days</div>
          <div style={{ ...METRIC_BIG, color: '#34d399' }}>{metrics.seals_7d}</div>
          <div style={{ fontSize: '0.78rem', color: '#7a869a' }}>sealed grade sheets</div>
        </div>
        <div style={METRIC_CARD}>
          <div style={METRIC_LABEL}>Stage Checks Due</div>
          <div
            style={{
              ...METRIC_BIG,
              color: metrics.stage_checks_due > 0 ? '#fbbf24' : '#7a869a',
            }}
          >
            {metrics.stage_checks_due}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#7a869a' }}>awaiting result</div>
        </div>
        <div style={METRIC_CARD}>
          <div style={METRIC_LABEL}>Endorsements Expiring</div>
          <div
            style={{
              ...METRIC_BIG,
              color: metrics.endorsements_expiring_30d > 0 ? '#f87171' : '#7a869a',
            }}
          >
            {metrics.endorsements_expiring_30d}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#7a869a' }}>within 30 days</div>
        </div>
      </div>

      {/* Recent sealed activity */}
      <h2 style={SECTION_HEADING}>Recent sealed activity</h2>
      {recent.length === 0 ? (
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No sealed grade sheets yet.
        </div>
      ) : (
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
                <th style={TH}>Student</th>
                <th style={TH}>Lesson</th>
                <th style={TH}>Conducted</th>
                <th style={TH}>Sealed</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={TD}>
                    <Link
                      href={`/admin/people/${r.student_user_id}`}
                      style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {displayName({
                        first_name: r.student_first_name,
                        last_name: r.student_last_name,
                        email: r.student_email,
                      })}
                    </Link>
                  </td>
                  <td style={TD}>
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                        color: '#f7f9fc',
                        marginRight: '0.4rem',
                      }}
                    >
                      🔒 {r.lesson_code}
                    </span>
                    {r.lesson_title}
                  </td>
                  <td style={MONO_TD}>{new Date(r.conducted_at).toLocaleDateString()}</td>
                  <td style={{ ...MONO_TD, color: '#34d399' }}>
                    {new Date(r.sealed_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Student directory */}
      <h2 style={SECTION_HEADING}>Active student directory</h2>
      {students.length === 0 ? (
        <div
          style={{
            padding: '2.5rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No active enrollments in the school right now.
        </div>
      ) : (
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
                <th style={TH}>Student</th>
                <th style={TH}>Course</th>
                <th style={TH}>Enrolled</th>
                <th style={TH}>Last activity</th>
                <th style={TH}>Seals</th>
                <th style={TH}>Status</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const hasHold = s.open_holds > 0;
                return (
                  <tr
                    key={s.enrollment_id}
                    style={{
                      borderBottom: '1px solid #161d30',
                      background: hasHold ? 'rgba(248, 113, 113, 0.04)' : undefined,
                    }}
                  >
                    <td style={TD}>
                      <Link
                        href={`/admin/people/${s.user_id}`}
                        style={{ color: '#f7f9fc', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {displayName(s)}
                      </Link>
                      <div
                        style={{
                          color: '#5b6784',
                          fontSize: '0.72rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        }}
                      >
                        {s.email}
                      </div>
                    </td>
                    <td style={TD}>
                      {s.course_code ? (
                        <>
                          <span
                            style={{
                              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                              fontSize: '0.72rem',
                              color: '#38bdf8',
                              marginRight: '0.4rem',
                            }}
                          >
                            {s.course_code}
                          </span>
                          <span style={{ color: '#cbd5e1' }}>{s.course_title ?? ''}</span>
                        </>
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={MONO_TD}>{new Date(s.enrolled_at).toLocaleDateString()}</td>
                    <td style={MONO_TD}>
                      {s.last_activity_at ? (
                        new Date(s.last_activity_at).toLocaleDateString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>none</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...MONO_TD,
                        color: s.sealed_sheet_count > 0 ? '#34d399' : '#5b6784',
                      }}
                    >
                      {s.sealed_sheet_count}
                    </td>
                    <td style={TD}>
                      {hasHold ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 4,
                            background: 'rgba(248, 113, 113, 0.14)',
                            color: '#f87171',
                            fontSize: '0.65rem',
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}
                        >
                          {s.open_holds} hold{s.open_holds === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 4,
                            background: 'rgba(52, 211, 153, 0.12)',
                            color: '#34d399',
                            fontSize: '0.65rem',
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}
                        >
                          clear
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>
                      <Link
                        href={`/admin/people/${s.user_id}`}
                        style={{
                          display: 'inline-flex',
                          padding: '0.3rem 0.7rem',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: 6,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        Open record
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
