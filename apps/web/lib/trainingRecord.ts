/**
 * Shared data loader for the 141.101 training record PDF and the
 * IACRA hours summary. Used by both admin and student self-serve
 * route handlers. Every query is explicitly scoped to the caller's
 * school_id + target user_id.
 *
 * Callers are responsible for the auth gate BEFORE invoking these
 * functions. These helpers trust their inputs.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@part61/db';

export type TrainingRecordIdentification = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  dateOfBirth: string | null;
  address: string;
  faaCertNumber: string | null;
};

export type TrainingRecordCourse = {
  enrollmentId: string;
  courseId: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  ratingSought: string | null;
  versionLabel: string | null;
  gradingScale: string | null;
  enrolledAt: string;
  completedAt: string | null;
  withdrawnAt: string | null;
};

export type TrainingRecordGradeSheet = {
  id: string;
  conductedAt: string;
  lessonCode: string;
  lessonTitle: string;
  kind: string;
  groundMinutes: number;
  flightMinutes: number;
  overallRemarks: string | null;
  signer: SignerDisplay | null;
};

export type TrainingRecordStageCheck = {
  id: string;
  conductedAt: string | null;
  stageCode: string;
  stageTitle: string;
  status: string;
  remarks: string | null;
  signer: SignerDisplay | null;
};

export type TrainingRecordEndorsement = {
  id: string;
  issuedAt: string;
  templateCode: string | null;
  templateTitle: string | null;
  renderedText: string;
  expiresAt: string | null;
  revokedAt: string | null;
  signer: SignerDisplay | null;
};

export type TrainingRecordTestGrade = {
  id: string;
  recordedAt: string;
  testKind: string;
  componentKind: string;
  score: string | null;
  maxScore: string | null;
  remarks: string | null;
};

export type SignerDisplay = {
  fullName: string;
  certificateType: string;
  certificateNumber: string;
};

export type TrainingRecordData = {
  identification: TrainingRecordIdentification;
  schoolName: string;
  course: TrainingRecordCourse;
  gradeSheets: TrainingRecordGradeSheet[];
  stageChecks: TrainingRecordStageCheck[];
  endorsements: TrainingRecordEndorsement[];
  testGrades: TrainingRecordTestGrade[];
  chiefInstructor: SignerDisplay | null;
  generatedAt: string;
};

type SignerRow = {
  full_name?: string;
  fullName?: string;
  first_name?: string;
  last_name?: string;
  certificate_type?: string;
  certificateType?: string;
  certificate_number?: string;
  certificateNumber?: string;
};

export function extractSigner(raw: unknown): SignerDisplay | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as SignerRow;
  const fullName =
    s.full_name ??
    s.fullName ??
    [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
  const certificateType = s.certificate_type ?? s.certificateType ?? '';
  const certificateNumber = s.certificate_number ?? s.certificateNumber ?? '';
  if (!fullName || !certificateNumber) return null;
  return { fullName, certificateType: certificateType || 'instructor', certificateNumber };
}

function buildAddress(row: {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}): string {
  const line1Parts = [row.address_line1, row.address_line2].filter(Boolean).join(', ');
  const cityState = [row.city, row.state].filter(Boolean).join(', ');
  return [line1Parts, cityState, row.postal_code].filter(Boolean).join(' · ');
}

export async function loadIdentification(
  userId: string,
  schoolId: string,
): Promise<TrainingRecordIdentification | null> {
  const rows = (await db.execute(sql`
    select
      u.id as user_id,
      u.email,
      u.full_name,
      pp.first_name,
      pp.last_name,
      pp.date_of_birth,
      pp.address_line1,
      pp.address_line2,
      pp.city,
      pp.state,
      pp.postal_code,
      pp.faa_airman_cert_number
    from public.users u
    left join public.person_profile pp on pp.user_id = u.id
    where u.id = ${userId}::uuid
      and u.school_id = ${schoolId}::uuid
    limit 1
  `)) as unknown as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    date_of_birth: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    faa_airman_cert_number: string | null;
  }>;
  const r = rows[0];
  if (!r) return null;
  const fullName =
    [r.first_name, r.last_name].filter(Boolean).join(' ').trim() ||
    r.full_name ||
    r.email ||
    'Student';
  return {
    userId: r.user_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    fullName,
    dateOfBirth: r.date_of_birth,
    address: buildAddress(r),
    faaCertNumber: r.faa_airman_cert_number,
  };
}

export async function loadSchoolName(schoolId: string): Promise<string> {
  const rows = (await db.execute(sql`
    select name from public.schools where id = ${schoolId}::uuid limit 1
  `)) as unknown as Array<{ name: string }>;
  return rows[0]?.name ?? 'Part 61 School';
}

export async function loadCourse(
  enrollmentId: string,
  schoolId: string,
  userId: string,
): Promise<TrainingRecordCourse | null> {
  const rows = (await db.execute(sql`
    select
      sce.id as enrollment_id,
      sce.enrolled_at,
      sce.completed_at,
      sce.withdrawn_at,
      c.id as course_id,
      c.code as course_code,
      c.title as course_title,
      c.rating_sought,
      cv.version_label,
      cv.grading_scale
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.id = ${enrollmentId}::uuid
      and sce.school_id = ${schoolId}::uuid
      and sce.user_id = ${userId}::uuid
      and sce.deleted_at is null
    limit 1
  `)) as unknown as Array<{
    enrollment_id: string;
    enrolled_at: string;
    completed_at: string | null;
    withdrawn_at: string | null;
    course_id: string | null;
    course_code: string | null;
    course_title: string | null;
    rating_sought: string | null;
    version_label: string | null;
    grading_scale: string | null;
  }>;
  const r = rows[0];
  if (!r) return null;
  return {
    enrollmentId: r.enrollment_id,
    courseId: r.course_id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    ratingSought: r.rating_sought,
    versionLabel: r.version_label,
    gradingScale: r.grading_scale,
    enrolledAt: r.enrolled_at,
    completedAt: r.completed_at,
    withdrawnAt: r.withdrawn_at,
  };
}

export async function loadSealedGradeSheets(
  enrollmentId: string,
  schoolId: string,
): Promise<TrainingRecordGradeSheet[]> {
  const rows = (await db.execute(sql`
    select
      gs.id, gs.conducted_at, gs.kind, gs.ground_minutes, gs.flight_minutes,
      gs.overall_remarks, gs.signer_snapshot,
      l.code as lesson_code, l.title as lesson_title
    from public.lesson_grade_sheet gs
    join public.lesson l on l.id = gs.lesson_id
    where gs.school_id = ${schoolId}::uuid
      and gs.student_enrollment_id = ${enrollmentId}::uuid
      and gs.sealed_at is not null
      and gs.deleted_at is null
    order by gs.conducted_at asc
  `)) as unknown as Array<{
    id: string;
    conducted_at: string;
    kind: string;
    ground_minutes: number;
    flight_minutes: number;
    overall_remarks: string | null;
    signer_snapshot: unknown;
    lesson_code: string;
    lesson_title: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    conductedAt: r.conducted_at,
    lessonCode: r.lesson_code,
    lessonTitle: r.lesson_title,
    kind: r.kind,
    groundMinutes: r.ground_minutes,
    flightMinutes: r.flight_minutes,
    overallRemarks: r.overall_remarks,
    signer: extractSigner(r.signer_snapshot),
  }));
}

export async function loadSealedStageChecks(
  enrollmentId: string,
  schoolId: string,
): Promise<TrainingRecordStageCheck[]> {
  const rows = (await db.execute(sql`
    select sc.id, sc.conducted_at, sc.status, sc.remarks, sc.signer_snapshot,
      s.code as stage_code, s.title as stage_title
    from public.stage_check sc
    join public.stage s on s.id = sc.stage_id
    where sc.school_id = ${schoolId}::uuid
      and sc.student_enrollment_id = ${enrollmentId}::uuid
      and sc.sealed_at is not null
      and sc.deleted_at is null
    order by sc.conducted_at asc nulls last
  `)) as unknown as Array<{
    id: string;
    conducted_at: string | null;
    status: string;
    remarks: string | null;
    signer_snapshot: unknown;
    stage_code: string;
    stage_title: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    conductedAt: r.conducted_at,
    stageCode: r.stage_code,
    stageTitle: r.stage_title,
    status: r.status,
    remarks: r.remarks,
    signer: extractSigner(r.signer_snapshot),
  }));
}

export async function loadEndorsements(
  studentUserId: string,
  schoolId: string,
): Promise<TrainingRecordEndorsement[]> {
  const rows = (await db.execute(sql`
    select se.id, se.issued_at, se.rendered_text, se.expires_at, se.revoked_at,
      se.signer_snapshot,
      et.code as template_code, et.title as template_title
    from public.student_endorsement se
    left join public.endorsement_template et on et.id = se.template_id
    where se.school_id = ${schoolId}::uuid
      and se.student_user_id = ${studentUserId}::uuid
      and se.sealed = true
      and se.deleted_at is null
    order by se.issued_at asc
  `)) as unknown as Array<{
    id: string;
    issued_at: string;
    rendered_text: string;
    expires_at: string | null;
    revoked_at: string | null;
    signer_snapshot: unknown;
    template_code: string | null;
    template_title: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    issuedAt: r.issued_at,
    templateCode: r.template_code,
    templateTitle: r.template_title,
    renderedText: r.rendered_text,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    signer: extractSigner(r.signer_snapshot),
  }));
}

export async function loadTestGrades(
  enrollmentId: string,
  schoolId: string,
): Promise<TrainingRecordTestGrade[]> {
  const rows = (await db.execute(sql`
    select id, recorded_at, test_kind, component_kind, score, max_score, remarks
    from public.test_grade
    where school_id = ${schoolId}::uuid
      and student_enrollment_id = ${enrollmentId}::uuid
      and sealed = true
      and deleted_at is null
    order by recorded_at asc
  `)) as unknown as Array<{
    id: string;
    recorded_at: string;
    test_kind: string;
    component_kind: string;
    score: string | null;
    max_score: string | null;
    remarks: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    recordedAt: r.recorded_at,
    testKind: r.test_kind,
    componentKind: r.component_kind,
    score: r.score,
    maxScore: r.max_score,
    remarks: r.remarks,
  }));
}

export async function loadTrainingRecord(
  enrollmentId: string,
  schoolId: string,
  studentUserId: string,
): Promise<TrainingRecordData | null> {
  const [identification, schoolName, course] = await Promise.all([
    loadIdentification(studentUserId, schoolId),
    loadSchoolName(schoolId),
    loadCourse(enrollmentId, schoolId, studentUserId),
  ]);
  if (!identification || !course) return null;
  const [gradeSheets, stageChecks, endorsements, testGrades] = await Promise.all([
    loadSealedGradeSheets(enrollmentId, schoolId),
    loadSealedStageChecks(enrollmentId, schoolId),
    loadEndorsements(studentUserId, schoolId),
    loadTestGrades(enrollmentId, schoolId),
  ]);
  return {
    identification,
    schoolName,
    course,
    gradeSheets,
    stageChecks,
    endorsements,
    testGrades,
    chiefInstructor: null,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
  };
}

// ---------------------------------------------------------------------------
// IACRA hours summary
// ---------------------------------------------------------------------------

export type IacraTotals = {
  totalMinutes: number;
  picMinutes: number;
  sicMinutes: number;
  soloMinutes: number;
  dualReceivedMinutes: number;
  dualGivenMinutes: number;
  crossCountryMinutes: number;
  nightMinutes: number;
  instrumentActualMinutes: number;
  instrumentSimulatedMinutes: number;
  dayLandings: number;
  nightLandings: number;
  instrumentApproaches: number;
  simulatorMinutes: number;
  timeInMakeModel: Array<{ makeModel: string; minutes: number }>;
};

export async function loadIacraTotals(
  userId: string,
  _schoolId: string,
): Promise<IacraTotals> {
  const rows = (await db.execute(sql`
    select *
    from public.user_flight_log_totals
    where user_id = ${userId}::uuid
    limit 1
  `)) as unknown as Array<{
    total_minutes: number | null;
    pic_minutes: number | null;
    sic_minutes: number | null;
    solo_minutes: number | null;
    dual_received_minutes: number | null;
    dual_given_minutes: number | null;
    cross_country_minutes: number | null;
    night_minutes: number | null;
    instrument_actual_minutes: number | null;
    instrument_simulated_minutes: number | null;
    day_landings: number | null;
    night_landings: number | null;
    instrument_approaches: number | null;
  }>;
  const r = rows[0];

  const simRows = (await db.execute(sql`
    select coalesce(sum(day_minutes + night_minutes), 0)::int as sim_minutes
    from public.flight_log_time
    where user_id = ${userId}::uuid
      and is_simulator = true
      and deleted_at is null
  `)) as unknown as Array<{ sim_minutes: number }>;
  const simMinutes = simRows[0]?.sim_minutes ?? 0;

  const mmRows = (await db.execute(sql`
    select coalesce(time_in_make_model, 'Unknown') as make_model,
      sum(day_minutes + night_minutes)::int as minutes
    from public.flight_log_time
    where user_id = ${userId}::uuid
      and deleted_at is null
    group by time_in_make_model
    order by 1
  `)) as unknown as Array<{ make_model: string; minutes: number }>;

  return {
    totalMinutes: Number(r?.total_minutes ?? 0),
    picMinutes: Number(r?.pic_minutes ?? 0),
    sicMinutes: Number(r?.sic_minutes ?? 0),
    soloMinutes: Number(r?.solo_minutes ?? 0),
    dualReceivedMinutes: Number(r?.dual_received_minutes ?? 0),
    dualGivenMinutes: Number(r?.dual_given_minutes ?? 0),
    crossCountryMinutes: Number(r?.cross_country_minutes ?? 0),
    nightMinutes: Number(r?.night_minutes ?? 0),
    instrumentActualMinutes: Number(r?.instrument_actual_minutes ?? 0),
    instrumentSimulatedMinutes: Number(r?.instrument_simulated_minutes ?? 0),
    dayLandings: Number(r?.day_landings ?? 0),
    nightLandings: Number(r?.night_landings ?? 0),
    instrumentApproaches: Number(r?.instrument_approaches ?? 0),
    simulatorMinutes: simMinutes,
    timeInMakeModel: mmRows.map((m) => ({ makeModel: m.make_model, minutes: Number(m.minutes) })),
  };
}

export function minutesToHours(minutes: number): string {
  if (!minutes) return '0.0';
  return (minutes / 60).toFixed(1);
}

export function iacraCsv(identification: TrainingRecordIdentification, totals: IacraTotals): string {
  const lines: string[] = [];
  lines.push('field,hours,minutes');
  const row = (label: string, minutes: number) =>
    lines.push(`"${label}",${minutesToHours(minutes)},${minutes}`);
  lines.unshift(`"student_name","${identification.fullName.replace(/"/g, '""')}",`);
  lines.push('');
  row('Total time', totals.totalMinutes);
  row('PIC time', totals.picMinutes);
  row('SIC time', totals.sicMinutes);
  row('Solo time', totals.soloMinutes);
  row('Dual received', totals.dualReceivedMinutes);
  row('Dual given', totals.dualGivenMinutes);
  row('Cross-country', totals.crossCountryMinutes);
  row('Night', totals.nightMinutes);
  row('Instrument actual', totals.instrumentActualMinutes);
  row('Instrument simulated', totals.instrumentSimulatedMinutes);
  row('Flight simulator', totals.simulatorMinutes);
  lines.push(`"Day landings",,${totals.dayLandings}`);
  lines.push(`"Night landings",,${totals.nightLandings}`);
  lines.push(`"Instrument approaches",,${totals.instrumentApproaches}`);
  lines.push('');
  lines.push('"Time in make/model (hours)",,');
  for (const mm of totals.timeInMakeModel) {
    lines.push(`"${mm.makeModel.replace(/"/g, '""')}",${minutesToHours(mm.minutes)},${mm.minutes}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Auth helper: returns the caller's shadow row + role list + schoolId,
 * or null if not signed in. Does NOT gate on role — callers inspect
 * the returned role list.
 */
export async function resolveCallerContext(): Promise<
  | {
      userId: string;
      schoolId: string;
      roles: string[];
      activeRole: string | null;
    }
  | null
> {
  // Imported lazily to keep this file usable from route handlers that
  // need the auth helper AND from places that only need the data loaders.
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const { cookies } = await import('next/headers');
  const { users, userRoles } = await import('@part61/db');
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me || !me.schoolId) return null;
  const roleRows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  const roles = roleRows.map((r) => r.role);
  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value ?? null;
  return { userId: user.id, schoolId: me.schoolId, roles, activeRole };
}

// Suppress tree-shake of unused import (kept for potential future use).
void and;
void asc;
void eq;
void isNull;
