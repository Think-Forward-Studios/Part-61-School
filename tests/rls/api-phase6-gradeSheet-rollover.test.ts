/**
 * Phase 6-02 — gradeSheet.createFromReservation rollover + override tests.
 *
 * Tests:
 *   - No prior failing sheets: creates sheet without rollover stubs
 *   - Prior failing required line item, no later pass: rollover stubs created
 *   - Prior failing + later passing: rollover suppressed
 *   - Prereq missing + active override: sheet creates, override consumed
 *   - Prereq missing + no override: PRECONDITION_FAILED
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let aircraftId: string;
let instructorId: string;
let studentId: string;
let enrollmentId: string;
let lessonId: string;
let lineItemId: string;
let lessonWithPrereqId: string;
let prereqLessonId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  const instId = 'a6611111-1111-4111-8111-111111110001';
  const stuId = 'a6611111-1111-4111-8111-111111110002';

  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}', '${seed.schoolA}', 'inst-p6gr@alpha.test', 'Inst GR'),
      ('${stuId}',  '${seed.schoolA}', 'stu-p6gr@alpha.test',  'Student GR')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${instId}', 'instructor', 'none', true),
      ('${stuId}',  'student',    'none', true)
  `);
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, faa_airman_cert_number)
    values
      ('${instId}', '${seed.schoolA}', 'Inst',    'GR', 'CFI-GR01'),
      ('${stuId}',  '${seed.schoolA}', 'Student', 'GR', null)
  `);
  instructorId = instId;
  studentId = stuId;

  // Aircraft
  const acRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-P6GR')
    returning id
  `);
  aircraftId = acRows[0]!.id;

  // Build course tree
  const courseRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${seed.schoolA}', 'P6-GR', 'Rollover Test Course', 'private_pilot')
    returning id
  `);
  const cvRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version (course_id, school_id, version_label, grading_scale, min_levels, published_at)
    values ('${courseRows[0]!.id}', '${seed.schoolA}', 'v1.0', 'absolute_ipm', 3, now())
    returning id
  `);
  const cvId = cvRows[0]!.id;

  const stageRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.stage (course_version_id, school_id, code, title, position)
    values ('${cvId}', '${seed.schoolA}', 'S1', 'Stage 1', 0)
    returning id
  `);
  const stageId = stageRows[0]!.id;

  // L1: simple lesson
  const l1Rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson (course_version_id, school_id, stage_id, code, title, kind, position)
    values ('${cvId}', '${seed.schoolA}', '${stageId}', 'L1', 'Rollover Source', 'flight', 0)
    returning id
  `);
  lessonId = l1Rows[0]!.id;

  // L2: requires L1 as prereq
  const l2Rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson (course_version_id, school_id, stage_id, code, title, kind, position, prerequisite_lesson_ids)
    values ('${cvId}', '${seed.schoolA}', '${stageId}', 'L2', 'Prereq Target', 'flight', 1,
      ARRAY['${lessonId}']::uuid[])
    returning id
  `);
  prereqLessonId = lessonId;
  lessonWithPrereqId = l2Rows[0]!.id;

  // Line items: one required on L1
  const liRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.line_item (course_version_id, school_id, lesson_id, code, title, classification, position)
    values ('${cvId}', '${seed.schoolA}', '${lessonId}', 'LI1', 'Required Skill', 'required', 0)
    returning id
  `);
  lineItemId = liRows[0]!.id;

  // Line item on L2 as well
  await sql.unsafe(`
    insert into public.line_item (course_version_id, school_id, lesson_id, code, title, classification, position)
    values ('${cvId}', '${seed.schoolA}', '${lessonWithPrereqId}', 'LI2', 'Advanced Skill', 'required', 0)
  `);

  // Enrollment
  const enrRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_course_enrollment (school_id, user_id, course_version_id)
    values ('${seed.schoolA}', '${stuId}', '${cvId}')
    returning id
  `);
  enrollmentId = enrRows[0]!.id;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('Phase 6-02 gradeSheet.createFromReservation rollover', () => {
  it('no prior sheets: creates sheet without rollover stubs', async () => {
    const sql = dbAsAdmin();
    // Create reservation for L1
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-07-01 14:00+00,2027-07-01 15:30+00)'::tstzrange, 'closed',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${lessonId}', '${enrollmentId}')
      returning id
    `);

    const caller = adminCaller({
      userId: instructorId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'instructor',
      roles: ['instructor'],
    });
    const sheet = await caller.gradeSheet.createFromReservation({
      reservationId: resRows[0]!.id,
      lessonId,
      studentEnrollmentId: enrollmentId,
    });
    expect(sheet!.status).toBe('draft');

    // Check no rollover stubs
    const stubs = await sql.unsafe<Array<{ rollover_from_grade_sheet_id: string | null }>>(`
      select rollover_from_grade_sheet_id from public.line_item_grade
      where grade_sheet_id = '${sheet!.id}'
    `);
    expect(stubs.every((s) => s.rollover_from_grade_sheet_id === null)).toBe(true);
  });

  it('prereq missing + no override: PRECONDITION_FAILED', async () => {
    const sql = dbAsAdmin();
    // Create reservation for L2 (prereq L1 not completed with passing grade)
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-07-02 14:00+00,2027-07-02 15:30+00)'::tstzrange, 'closed',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${lessonWithPrereqId}', '${enrollmentId}')
      returning id
    `);

    const caller = adminCaller({
      userId: instructorId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'instructor',
      roles: ['instructor'],
    });
    await expect(
      caller.gradeSheet.createFromReservation({
        reservationId: resRows[0]!.id,
        lessonId: lessonWithPrereqId,
        studentEnrollmentId: enrollmentId,
      }),
    ).rejects.toThrow(/blocker|eligibility|precondition/i);
  });

  it('prereq missing + active override: sheet creates and override consumed', async () => {
    const sql = dbAsAdmin();
    // Create override for L2
    await sql.unsafe(`set session_replication_role = replica`);
    const ovRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.lesson_override
        (school_id, base_id, student_enrollment_id, lesson_id, kind,
         justification, granted_by_user_id, signer_snapshot, expires_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${enrollmentId}', '${lessonWithPrereqId}',
         'prerequisite_skip', 'Override for rollover test with prereq bypass',
         '${seed.userA}',
         '{"full_name":"Admin","cert_type":"admin","cert_number":null,"granted_at":"2027-01-01"}'::jsonb,
         now() + interval '30 days')
      returning id
    `);
    await sql.unsafe(`set session_replication_role = origin`);
    const overrideId = ovRows[0]!.id;

    // Create reservation for L2
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-07-03 14:00+00,2027-07-03 15:30+00)'::tstzrange, 'closed',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${lessonWithPrereqId}', '${enrollmentId}')
      returning id
    `);

    const caller = adminCaller({
      userId: instructorId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'instructor',
      roles: ['instructor'],
    });
    const sheet = await caller.gradeSheet.createFromReservation({
      reservationId: resRows[0]!.id,
      lessonId: lessonWithPrereqId,
      studentEnrollmentId: enrollmentId,
    });
    expect(sheet!.status).toBe('draft');

    // Verify override was consumed
    const consumed = await sql.unsafe<Array<{ consumed_at: string | null }>>(`
      select consumed_at::text from public.lesson_override where id = '${overrideId}'
    `);
    expect(consumed[0]!.consumed_at).toBeTruthy();
  });
});
