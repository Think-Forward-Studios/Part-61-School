/**
 * /students/[id] — Instructor-accessible student detail.
 *
 * Replaces the broken `/admin/people/[id]` link from the instructor
 * dashboard's "Assigned Students" tile, which 404'd because the entire
 * `/admin/*` tree is admin-only (see apps/web/app/(app)/admin/layout.tsx).
 *
 * Authorization (server-side, read-only — no admin mutations are
 * exposed by this page, so the gate just controls visibility):
 *   1. Caller must be signed in and in the same school as the student.
 *   2. AND one of:
 *        - active_role is 'admin'   (admins see everyone), OR
 *        - active_role is 'instructor' AND the caller is the
 *          primary_instructor_id on at least one active enrollment
 *          for this student.
 *      Otherwise notFound() — same convention as /admin/layout.tsx so
 *      we don't leak existence of arbitrary user ids.
 *
 * Scope: this is a focused read-only summary. Editing profile,
 * holds, currencies, etc. stays at /admin/people/[id] (admin only).
 * If instructors later need self-serve editing, that's a separate
 * change that probably involves new tRPC procedures with a stricter
 * "you must be primary on this student" check.
 */
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, users, personProfile } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

const SECTION: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem 1.1rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
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

const KV_LABEL: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.7rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 500,
};

const KV_VALUE: React.CSSProperties = {
  color: '#f7f9fc',
  fontSize: '0.9rem',
  margin: 0,
};

export default async function StudentDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const meRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const me = meRows[0];
  if (!me) redirect('/login');

  // Target must exist and be in the same school. We treat "not in your
  // school" identically to "doesn't exist" → 404.
  const targetRows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.schoolId, me.schoolId)))
    .limit(1);
  const target = targetRows[0];
  if (!target) notFound();

  // Authorization. Reads active role from the same cookie the rest of
  // the app uses; falls through to notFound() on any role mismatch.
  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  const isAdmin = activeRole === 'admin';
  let isAssignedInstructor = false;
  if (!isAdmin && activeRole === 'instructor') {
    const assignmentCheck = (await db.execute(sql`
      select 1
      from public.student_course_enrollment
      where user_id              = ${id}::uuid
        and primary_instructor_id = ${me.id}::uuid
        and school_id            = ${me.schoolId}::uuid
        and deleted_at   is null
        and completed_at is null
        and withdrawn_at is null
      limit 1
    `)) as unknown as Array<unknown>;
    isAssignedInstructor = assignmentCheck.length > 0;
  }
  if (!isAdmin && !isAssignedInstructor) notFound();

  // ----------------------------------------------------------------
  // Data fetch — direct DB reads (server component pattern). No tRPC
  // admin procedures, so this stays callable by instructors.
  // ----------------------------------------------------------------
  const profile = (
    await db.select().from(personProfile).where(eq(personProfile.userId, id)).limit(1)
  )[0];

  const activeHoldRows = (await db.execute(sql`
    select kind, reason, created_at
    from public.person_hold
    where user_id = ${id}::uuid
      and cleared_at is null
    order by created_at desc
    limit 1
  `)) as unknown as Array<{ kind: string; reason: string; created_at: string }>;
  const activeHold = activeHoldRows[0];

  const enrollments = (await db.execute(sql`
    select
      sce.id,
      sce.enrolled_at,
      sce.completed_at,
      sce.withdrawn_at,
      c.code              as course_code,
      c.title             as course_title,
      cv.version_label    as version_label,
      coalesce(
        nullif(trim(concat_ws(' ', ipp.first_name, ipp.last_name)), ''),
        iu.full_name,
        iu.email
      )                   as instructor_name,
      iu.id               as instructor_id
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course         c  on c.id  = cv.course_id
    left join public.users          iu on iu.id = sce.primary_instructor_id
    left join public.person_profile ipp on ipp.user_id = sce.primary_instructor_id
    where sce.user_id = ${id}::uuid
      and sce.school_id = ${me.schoolId}::uuid
      and sce.deleted_at is null
    order by
      (case when sce.completed_at is null and sce.withdrawn_at is null then 0 else 1 end),
      sce.enrolled_at desc
    limit 10
  `)) as unknown as Array<{
    id: string;
    enrolled_at: string;
    completed_at: string | null;
    withdrawn_at: string | null;
    course_code: string | null;
    course_title: string | null;
    version_label: string | null;
    instructor_name: string | null;
    instructor_id: string | null;
  }>;

  const recentSheets = (await db.execute(sql`
    select gs.id, gs.status, gs.sealed_at, gs.conducted_at,
           l.code as lesson_code, l.title as lesson_title
    from public.lesson_grade_sheet gs
    join public.lesson l on l.id = gs.lesson_id
    where gs.school_id = ${me.schoolId}::uuid
      and gs.student_enrollment_id in (
        select id from public.student_course_enrollment where user_id = ${id}::uuid
      )
    order by gs.conducted_at desc
    limit 8
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
    where se.school_id = ${me.schoolId}::uuid
      and se.student_user_id = ${id}::uuid
      and se.deleted_at is null
      and se.revoked_at is null
    order by se.issued_at desc
    limit 8
  `)) as unknown as Array<{
    id: string;
    issued_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    template_code: string | null;
    template_title: string | null;
  }>;

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || target.email;

  const activeEnrollments = enrollments.filter((e) => !e.completed_at && !e.withdrawn_at);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link
          href="/dashboard"
          style={{
            color: '#7a869a',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Dashboard
        </Link>
      </div>
      <PageHeader
        eyebrow="Student"
        title={displayName}
        subtitle={
          <span
            style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: '0.78rem' }}
          >
            {target.email}
          </span>
        }
      />

      {activeHold ? (
        <div
          style={{
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            borderRadius: 8,
            padding: '1rem 1.1rem',
            margin: '1rem 0',
          }}
        >
          <div
            style={{
              color: '#f87171',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '0.35rem',
            }}
          >
            ⚠ Active {activeHold.kind === 'grounding' ? 'grounding' : 'hold'}
          </div>
          <div style={{ color: '#f7f9fc', fontSize: '0.88rem' }}>Reason: {activeHold.reason}</div>
          <div style={{ fontSize: '0.78rem', color: '#7a869a', marginTop: '0.25rem' }}>
            Placed {new Date(activeHold.created_at).toLocaleString()}
          </div>
        </div>
      ) : null}

      {/* --- Contact info ------------------------------------------- */}
      <section style={SECTION}>
        <h2 style={{ ...H3, marginBottom: '0.75rem' }}>Contact</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            rowGap: '0.55rem',
            columnGap: '1rem',
            margin: 0,
          }}
        >
          <dt style={KV_LABEL}>Email</dt>
          <dd style={KV_VALUE}>{target.email}</dd>
          {profile?.phone ? (
            <>
              <dt style={KV_LABEL}>Phone</dt>
              <dd style={KV_VALUE}>{profile.phone}</dd>
            </>
          ) : null}
          {profile?.emailAlt ? (
            <>
              <dt style={KV_LABEL}>Alt email</dt>
              <dd style={KV_VALUE}>{profile.emailAlt}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {/* --- Enrollments -------------------------------------------- */}
      <section style={SECTION}>
        <h2 style={{ ...H3, marginBottom: '0.75rem' }}>Enrollments</h2>
        {enrollments.length === 0 ? (
          <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>
            Not enrolled in any course.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            {enrollments.map((e) => {
              const isActive = !e.completed_at && !e.withdrawn_at;
              const label = e.course_title ?? e.course_code ?? 'Untitled course';
              return (
                <li
                  key={e.id}
                  style={{
                    borderLeft: isActive ? '2px solid #34d399' : '2px solid #334155',
                    paddingLeft: '0.7rem',
                  }}
                >
                  <div style={{ fontSize: '0.92rem', color: '#f7f9fc' }}>
                    {label}
                    {e.version_label ? (
                      <span style={{ color: '#7a869a', fontSize: '0.78rem' }}>
                        {' '}
                        · {e.version_label}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#7a869a', marginTop: '0.15rem' }}>
                    Enrolled {new Date(e.enrolled_at).toLocaleDateString()}
                    {e.instructor_name ? ` · CFI ${e.instructor_name}` : ''}
                    {e.completed_at
                      ? ` · completed ${new Date(e.completed_at).toLocaleDateString()}`
                      : e.withdrawn_at
                        ? ` · withdrawn ${new Date(e.withdrawn_at).toLocaleDateString()}`
                        : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Recent grade sheets ------------------------------------ */}
      <section style={SECTION}>
        <h2 style={{ ...H3, marginBottom: '0.75rem' }}>Recent grade sheets</h2>
        {recentSheets.length === 0 ? (
          <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>None on file.</p>
        ) : (
          <ul
            style={{
              fontSize: '0.85rem',
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              color: '#cbd5e1',
            }}
          >
            {recentSheets.map((s) => (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span>
                  {s.lesson_code} — {s.lesson_title}
                </span>
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
                </span>
                <span style={{ color: '#5b6784', fontSize: '0.78rem' }}>
                  {new Date(s.conducted_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Active endorsements ------------------------------------ */}
      <section style={SECTION}>
        <h2 style={{ ...H3, marginBottom: '0.75rem' }}>Active endorsements</h2>
        {endorsements.length === 0 ? (
          <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>None.</p>
        ) : (
          <ul
            style={{
              fontSize: '0.85rem',
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              color: '#cbd5e1',
            }}
          >
            {endorsements.map((en) => (
              <li key={en.id}>
                {en.template_title ?? en.template_code ?? 'Endorsement'}{' '}
                <span style={{ color: '#7a869a', fontSize: '0.78rem' }}>
                  · issued {new Date(en.issued_at).toLocaleDateString()}
                  {en.expires_at
                    ? ` · expires ${new Date(en.expires_at).toLocaleDateString()}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Schedule quick-link ------------------------------------ */}
      {activeEnrollments.length > 0 ? (
        <section style={{ ...SECTION, textAlign: 'center' }}>
          <Link
            href={`/schedule/request?studentId=${id}`}
            style={{
              display: 'inline-flex',
              padding: '0.55rem 1rem',
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            + Request reservation for {displayName}
          </Link>
        </section>
      ) : null}
    </main>
  );
}
