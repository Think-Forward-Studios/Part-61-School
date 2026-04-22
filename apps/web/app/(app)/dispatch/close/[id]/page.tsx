import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, users, reservation, flightLogEntry, studentCourseEnrollment } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CloseOutForm } from './CloseOutForm';
import { LessonPickerSection } from './LessonPickerSection';
import { FlightTimeCategorization } from './FlightTimeCategorization';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * /dispatch/close/[id] — flight close-out (SCH-08, SCH-09, INS-04, FTR-08).
 *
 * Phase 5 extension: when the reservation has a student attached, also
 * render the lesson picker + grade sheet editor + flight time
 * categorization form below the existing close-out form.
 *
 * Behavior preserved: reservations without a student (ferry flights,
 * maintenance, etc.) continue to render ONLY the existing close-out
 * form — Phase 3 regression.
 */
export default async function CloseOutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const r = (
    await db
      .select()
      .from(reservation)
      .where(and(eq(reservation.id, id), eq(reservation.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!r) notFound();

  // Pull human-readable context for the page header (aircraft tail,
  // student name, time range) instead of rendering a UUID slice.
  const contextRows = (await db.execute(sql`
    select
      a.tail_number                 as aircraft_tail,
      coalesce(pp.first_name || ' ' || pp.last_name, su.email) as student_label,
      lower(res.time_range)::text   as starts_at,
      upper(res.time_range)::text   as ends_at
    from public.reservation res
    left join public.aircraft       a   on a.id   = res.aircraft_id
    left join public.users          su  on su.id  = res.student_id
    left join public.person_profile pp  on pp.user_id = res.student_id
    where res.id = ${r.id}::uuid
    limit 1
  `)) as unknown as Array<{
    aircraft_tail: string | null;
    student_label: string | null;
    starts_at: string | null;
    ends_at: string | null;
  }>;
  const ctx = contextRows[0];

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value ?? 'student';
  const canSignOff = activeRole === 'instructor' || activeRole === 'admin';

  // Phase 5 additions: find the student's active enrollment (if any) for
  // the lesson picker + grade sheet flow. Also look up the paired
  // flight_log_entry so FlightTimeCategorization can enforce the ±6 min
  // hobbs gate.
  let activeEnrollment: {
    id: string;
    courseVersionId: string | null;
  } | null = null;
  if (r.studentId) {
    const enr = (
      await db
        .select()
        .from(studentCourseEnrollment)
        .where(
          and(
            eq(studentCourseEnrollment.userId, r.studentId),
            eq(studentCourseEnrollment.schoolId, me.schoolId),
            isNull(studentCourseEnrollment.deletedAt),
          ),
        )
        .orderBy(desc(studentCourseEnrollment.enrolledAt))
        .limit(1)
    )[0];
    if (enr && !enr.completedAt && !enr.withdrawnAt) {
      activeEnrollment = {
        id: enr.id,
        courseVersionId: enr.courseVersionId,
      };
    }
  }

  let flightEntry: { id: string; airframeDelta: string | null } | null = null;
  if (r.aircraftId) {
    const entryRows = (await db.execute(sql`
      select id, airframe_delta
        from public.flight_log_entry
        where aircraft_id = ${r.aircraftId}::uuid
          and kind = 'flight'
        order by flown_at desc
        limit 1
    `)) as unknown as Array<{ id: string; airframe_delta: string | null }>;
    void flightLogEntry; // keep import referenced
    const fe = entryRows[0];
    if (fe) flightEntry = { id: fe.id, airframeDelta: fe.airframe_delta };
  }

  // Load any existing draft grade sheets attached to this reservation
  const existingSheets = (await db.execute(sql`
    select gs.id, gs.lesson_id, gs.status, gs.sealed_at, l.code as lesson_code, l.title as lesson_title
      from public.lesson_grade_sheet gs
      join public.lesson l on l.id = gs.lesson_id
      where gs.reservation_id = ${r.id}::uuid
      order by gs.conducted_at asc
  `)) as unknown as Array<{
    id: string;
    lesson_id: string;
    status: string;
    sealed_at: string | null;
    lesson_code: string;
    lesson_title: string;
  }>;

  const isFlightActivity = r.activityType === 'flight';
  const hobbsDeltaMinutes =
    flightEntry?.airframeDelta != null ? Math.round(Number(flightEntry.airframeDelta) * 60) : null;

  const subtitle = buildSubtitle(ctx, r.status);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader eyebrow="Operations" title="Close Flight" subtitle={subtitle} />
      <CloseOutForm reservationId={r.id} activityType={r.activityType} canSignOff={canSignOff} />

      {r.studentId && activeEnrollment?.courseVersionId ? (
        <LessonPickerSection
          reservationId={r.id}
          studentEnrollmentId={activeEnrollment.id}
          courseVersionId={activeEnrollment.courseVersionId}
          existingSheets={existingSheets.map((s) => ({
            id: s.id,
            lessonId: s.lesson_id,
            lessonCode: s.lesson_code,
            lessonTitle: s.lesson_title,
            status: s.status,
            sealed: s.sealed_at !== null,
          }))}
        />
      ) : r.studentId ? (
        <section
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            borderRadius: 8,
            color: '#cbd5e1',
            fontSize: '0.85rem',
          }}
        >
          <strong style={{ color: '#fbbf24' }}>No active enrollment.</strong> This student is not
          currently enrolled in a published course version, so no lesson can be graded against this
          reservation.
        </section>
      ) : null}

      {isFlightActivity && r.studentId && r.instructorId ? (
        <FlightTimeCategorization
          reservationId={r.id}
          flightLogEntryId={flightEntry?.id ?? null}
          studentId={r.studentId}
          instructorId={r.instructorId}
          hobbsDeltaMinutes={hobbsDeltaMinutes}
        />
      ) : null}
    </main>
  );
}

function buildSubtitle(
  ctx:
    | {
        aircraft_tail: string | null;
        student_label: string | null;
        starts_at: string | null;
        ends_at: string | null;
      }
    | undefined,
  status: string,
): string {
  const parts: string[] = [];
  if (ctx?.aircraft_tail) parts.push(ctx.aircraft_tail);
  if (ctx?.student_label) parts.push(ctx.student_label);
  if (ctx?.starts_at && ctx?.ends_at) {
    const start = new Date(ctx.starts_at);
    const end = new Date(ctx.ends_at);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const dayOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const timeOpts: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      };
      parts.push(
        `${start.toLocaleDateString(undefined, dayOpts)} · ${start.toLocaleTimeString(
          undefined,
          timeOpts,
        )} → ${end.toLocaleTimeString(undefined, timeOpts)}`,
      );
    }
  }
  parts.push(`status ${status}`);
  return parts.join(' · ');
}
