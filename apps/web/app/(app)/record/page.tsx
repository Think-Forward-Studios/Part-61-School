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
  const now = Date.now();

  return (
    <main style={{ padding: '1rem', maxWidth: 960 }}>
      <h1>My Training Record</h1>

      <section style={{ marginTop: '1rem' }}>
        <h2>Enrollments</h2>
        {enrollments.length === 0 ? (
          <p style={{ color: '#888' }}>You are not enrolled in any course yet.</p>
        ) : (
          <ul style={{ lineHeight: 1.6 }}>
            {enrollments.map((e) => {
              const status = e.completed_at
                ? `completed ${new Date(e.completed_at).toLocaleDateString()}`
                : e.withdrawn_at
                  ? 'withdrawn'
                  : 'active';
              return (
                <li key={e.id}>
                  <Link href={`/record/courses/${e.id}`}>
                    {e.course_code ?? 'course'} — {e.course_title ?? '—'}{' '}
                    ({e.version_label ?? '—'})
                  </Link>{' '}
                  <span style={{ color: '#888', fontSize: '0.85rem' }}>· {status}</span>
                  {!e.withdrawn_at ? (
                    <>
                      {' '}
                      <a
                        href={`/record/courses/${e.id}/export.pdf`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '0.8rem' }}
                      >
                        [Download 141.101 PDF]
                      </a>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Flight log totals</h2>
        <p>
          Total time: <strong>{totalHours} h</strong> ·{' '}
          <Link href="/flight-log">View full flight log →</Link>
        </p>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Recent sealed grade sheets</h2>
        {recent.length === 0 ? (
          <p style={{ color: '#888' }}>No sealed grade sheets yet.</p>
        ) : (
          <ul style={{ fontSize: '0.9rem' }}>
            {recent.map((r) => (
              <li key={r.id}>
                🔒 {r.lesson_code} — {r.lesson_title}{' '}
                <span style={{ color: '#888' }}>
                  {new Date(r.conducted_at).toLocaleDateString()}
                </span>
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
          <ul style={{ fontSize: '0.9rem' }}>
            {endorsements.map((e) => {
              const expired = e.expires_at && new Date(e.expires_at).getTime() < now;
              const revoked = e.revoked_at !== null;
              return (
                <li key={e.id}>
                  {e.template_code ?? 'custom'} — {e.template_title ?? ''}{' '}
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.05rem 0.3rem',
                      borderRadius: 3,
                      background: revoked || expired ? '#fee2e2' : '#dcfce7',
                      color: revoked || expired ? '#7f1d1d' : '#166534',
                    }}
                  >
                    {revoked ? 'revoked' : expired ? 'expired' : 'current'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>Currencies</h2>
        {currencies.length === 0 ? (
          <p style={{ color: '#888' }}>No currencies on file.</p>
        ) : (
          <ul style={{ fontSize: '0.9rem' }}>
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
              const color =
                state === 'expired'
                  ? '#fee2e2'
                  : state === 'expiring'
                    ? '#fef3c7'
                    : '#dcfce7';
              return (
                <li key={c.id}>
                  {c.kind}{' '}
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.05rem 0.3rem',
                      background: color,
                      borderRadius: 3,
                    }}
                  >
                    {state}
                  </span>{' '}
                  {c.expires_at ? (
                    <span style={{ color: '#888' }}>
                      exp {new Date(c.expires_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {active ? null : (
        <p style={{ marginTop: '1rem', color: '#888', fontSize: '0.85rem' }}>
          No active enrollment.
        </p>
      )}
    </main>
  );
}
