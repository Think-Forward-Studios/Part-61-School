/**
 * /record — student self-serve training record dashboard (STU-02).
 *
 * Read-only. Scoped strictly to the authenticated user. Sealed rows
 * show a lock icon; drafts never render here.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadIacraTotals, minutesToHours } from '@/lib/trainingRecord';
import { StudentNextActivityChip } from './_components/StudentNextActivityChip';
import { StudentProgressForecastPanel } from './_components/StudentProgressForecastPanel';
import { StudentMinimumsPanel } from './_components/StudentMinimumsPanel';
import { StudentRolloverQueuePanel } from './_components/StudentRolloverQueuePanel';
import { CostSummary } from './_components/CostSummary';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Enrollment = {
  id: string;
  enrolled_at: string;
  completed_at: string | null;
  withdrawn_at: string | null;
  course_code: string | null;
  course_title: string | null;
  version_label: string | null;
};

type RecentSheet = {
  id: string;
  sealed_at: string | null;
  conducted_at: string;
  lesson_code: string;
  lesson_title: string;
};

type Endorsement = {
  id: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  template_code: string | null;
  template_title: string | null;
};

type Currency = {
  id: string;
  kind: string;
  effective_at: string;
  expires_at: string | null;
};

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

export default async function RecordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const enrollments = (await db.execute(sql`
    select sce.id, sce.enrolled_at, sce.completed_at, sce.withdrawn_at,
      c.code as course_code, c.title as course_title, cv.version_label
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.user_id = ${user.id}::uuid
      and sce.deleted_at is null
    order by sce.enrolled_at desc
  `)) as unknown as Enrollment[];

  const recent = (await db.execute(sql`
    select gs.id, gs.sealed_at, gs.conducted_at,
      l.code as lesson_code, l.title as lesson_title
    from public.lesson_grade_sheet gs
    join public.lesson l on l.id = gs.lesson_id
    where gs.student_enrollment_id in (
      select id from public.student_course_enrollment where user_id = ${user.id}::uuid
    )
      and gs.sealed_at is not null
    order by gs.conducted_at desc
    limit 5
  `)) as unknown as RecentSheet[];

  const endorsements = (await db.execute(sql`
    select se.id, se.issued_at, se.expires_at, se.revoked_at,
      et.code as template_code, et.title as template_title
    from public.student_endorsement se
    left join public.endorsement_template et on et.id = se.template_id
    where se.student_user_id = ${user.id}::uuid
      and se.sealed = true
      and se.deleted_at is null
    order by se.issued_at desc
    limit 10
  `)) as unknown as Endorsement[];

  const currencies = (await db.execute(sql`
    select id, kind, effective_at, expires_at
    from public.personnel_currency
    where user_id = ${user.id}::uuid
      and subject_kind = 'student'
      and deleted_at is null
    order by expires_at asc nulls last
  `)) as unknown as Currency[];

  // Totals (first enrollment's school; RLS scopes via user_id anyway).
  const totals = await loadIacraTotals(user.id, '');
  const totalHours = minutesToHours(totals.totalMinutes);

  const active = enrollments.find((e) => !e.completed_at && !e.withdrawn_at);
  const activeEnrollments = enrollments.filter((e) => !e.completed_at && !e.withdrawn_at);
  const now = Date.now();

  // Phase 6: rollover line items for the most-recent active enrollment
  let rolloverRows: RolloverRow[] = [];
  if (active) {
    rolloverRows = (await db.execute(sql`
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
      where tgt_sheet.student_enrollment_id = ${active.id}::uuid
        and lig.rollover_from_grade_sheet_id is not null
        and tgt_sheet.sealed_at is null
      order by src_sheet.sealed_at desc
    `)) as unknown as RolloverRow[];
  }

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="My Record"
        subtitle="Enrollments, flight totals, sealed grade sheets, endorsements, and currencies."
      />

      {/* Phase 8: Cost summary */}
      <CostSummary studentId={user.id} enrollmentId={active?.id} />

      {/* Phase 6: Progress surfaces for active enrollment */}
      {active ? (
        <>
          {activeEnrollments.length > 1 ? (
            <p
              style={{
                marginTop: '0.75rem',
                padding: '0.6rem 0.85rem',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 8,
                fontSize: '0.85rem',
                color: '#38bdf8',
              }}
            >
              You have {activeEnrollments.length} active enrollments. Showing:{' '}
              <strong>{active.course_title ?? 'course'}</strong>.{' '}
              <Link href="/admin/enrollments" style={{ color: '#38bdf8' }}>
                View all enrollments
              </Link>
            </p>
          ) : null}

          <StudentNextActivityChip enrollmentId={active.id} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1rem',
              marginTop: '1rem',
            }}
          >
            <StudentProgressForecastPanel />
            <StudentMinimumsPanel enrollmentId={active.id} />
          </div>

          <StudentRolloverQueuePanel rows={rolloverRows} />
        </>
      ) : (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '1rem 1.1rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
            fontSize: '0.88rem',
            color: '#7a869a',
          }}
        >
          You are not currently enrolled in a course. Contact your chief instructor to enroll.
        </div>
      )}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Enrollments</h2>
        {enrollments.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.88rem',
              background: '#0d1220',
              border: '1px dashed #1f2940',
              borderRadius: 12,
            }}
          >
            You are not enrolled in any course yet.
          </div>
        ) : (
          <div style={CARD}>
            <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: '1.1rem', color: '#cbd5e1' }}>
              {enrollments.map((e) => {
                const status = e.completed_at
                  ? `completed ${new Date(e.completed_at).toLocaleDateString()}`
                  : e.withdrawn_at
                    ? 'withdrawn'
                    : 'active';
                return (
                  <li key={e.id}>
                    <Link href={`/record/courses/${e.id}`} style={{ color: '#38bdf8' }}>
                      {e.course_code ?? 'course'} — {e.course_title ?? '—'} (
                      {e.version_label ?? '—'})
                    </Link>{' '}
                    <span style={{ color: '#7a869a', fontSize: '0.85rem' }}>· {status}</span>
                    {!e.withdrawn_at ? (
                      <>
                        {' '}
                        <a
                          href={`/record/courses/${e.id}/export.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.8rem', color: '#34d399' }}
                        >
                          [Download 141.101 PDF]
                        </a>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Flight log totals</h2>
        <div style={CARD}>
          <p style={{ margin: 0, color: '#cbd5e1' }}>
            Total time: <strong style={{ color: '#f7f9fc' }}>{totalHours} h</strong> ·{' '}
            <Link href="/flight-log" style={{ color: '#38bdf8' }}>
              View full flight log →
            </Link>
          </p>
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Recent sealed grade sheets</h2>
        {recent.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
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
          <div style={CARD}>
            <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: '1.1rem', color: '#cbd5e1' }}>
              {recent.map((r) => (
                <li key={r.id}>
                  🔒 {r.lesson_code} — {r.lesson_title}{' '}
                  <span style={{ color: '#7a869a' }}>
                    {new Date(r.conducted_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Endorsements</h2>
        {endorsements.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.88rem',
              background: '#0d1220',
              border: '1px dashed #1f2940',
              borderRadius: 12,
            }}
          >
            No endorsements on file.
          </div>
        ) : (
          <div style={CARD}>
            <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: '1.1rem', color: '#cbd5e1' }}>
              {endorsements.map((e) => {
                const expired = e.expires_at && new Date(e.expires_at).getTime() < now;
                const revoked = e.revoked_at !== null;
                const tone =
                  revoked || expired
                    ? { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' }
                    : { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' };
                return (
                  <li key={e.id}>
                    {e.template_code ?? 'custom'} — {e.template_title ?? ''}{' '}
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        background: tone.bg,
                        color: tone.fg,
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
          </div>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={SECTION_HEADING}>Currencies</h2>
        {currencies.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.88rem',
              background: '#0d1220',
              border: '1px dashed #1f2940',
              borderRadius: 12,
            }}
          >
            No currencies on file.
          </div>
        ) : (
          <div style={CARD}>
            <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: '1.1rem', color: '#cbd5e1' }}>
              {currencies.map((c) => {
                const exp = c.expires_at ? new Date(c.expires_at).getTime() : null;
                const state =
                  exp == null
                    ? 'no-expiry'
                    : exp < now
                      ? 'expired'
                      : exp < now + 30 * 864e5
                        ? 'expiring'
                        : 'current';
                const tone =
                  state === 'expired'
                    ? { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' }
                    : state === 'expiring'
                      ? { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' }
                      : { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' };
                return (
                  <li key={c.id}>
                    {c.kind}{' '}
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.5rem',
                        background: tone.bg,
                        color: tone.fg,
                        borderRadius: 4,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {state}
                    </span>{' '}
                    {c.expires_at ? (
                      <span style={{ color: '#7a869a' }}>
                        exp {new Date(c.expires_at).toLocaleDateString()}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Empty-state for no active enrollment is rendered above with Phase 6 panels */}
    </main>
  );
}
