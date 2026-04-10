/**
 * Phase 6-02 — schedule.approve eligibility gate tests.
 *
 * Tests:
 *   - approve with lesson_id IS NULL passes through (Phase 3 regression)
 *   - approve with lesson_id + enrollment + prereqs missing throws PRECONDITION_FAILED
 *   - approve with active override bypasses blockers
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let aircraftId: string;
let instructorId: string;
let studentId: string;
let enrollmentId: string;
let lessonWithPrereqId: string;
let prereqLessonId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  const instId = 'a6511111-1111-4111-8111-111111110001';
  const stuId = 'a6511111-1111-4111-8111-111111110002';
  const ciId = 'a6511111-1111-4111-8111-111111110003';

  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}', '${seed.schoolA}', 'inst-p6se@alpha.test', 'Inst SE'),
      ('${stuId}',  '${seed.schoolA}', 'stu-p6se@alpha.test',  'Student SE'),
      ('${ciId}',   '${seed.schoolA}', 'chief-p6se@alpha.test', 'Chief SE')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default, is_chief_instructor) values
      ('${instId}', 'instructor', 'none', true, false),
      ('${stuId}',  'student',    'none', true, false),
      ('${ciId}',   'instructor', 'none', true, true)
  `);
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, faa_airman_cert_number)
    values
      ('${instId}', '${seed.schoolA}', 'Inst',    'SE', 'CFI-SE01'),
      ('${stuId}',  '${seed.schoolA}', 'Student', 'SE', null),
      ('${ciId}',   '${seed.schoolA}', 'Chief',   'SE', 'CFI-SE02')
  `);
  instructorId = instId;
  studentId = stuId;

  // Aircraft
  const acRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-P6SE')
    returning id
  `);
  aircraftId = acRows[0]!.id;

  // Build course: prereq lesson L1, lesson L2 that requires L1
  const courseRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${seed.schoolA}', 'P6-SE', 'Schedule Eligibility Course', 'private_pilot')
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

  // L1: prerequisite lesson (no prereqs of its own)
  const l1Rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson (course_version_id, school_id, stage_id, code, title, kind, position)
    values ('${cvId}', '${seed.schoolA}', '${stageId}', 'L1', 'Prereq Lesson', 'flight', 0)
    returning id
  `);
  prereqLessonId = l1Rows[0]!.id;

  // L2: requires L1
  const l2Rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson (course_version_id, school_id, stage_id, code, title, kind, position, prerequisite_lesson_ids)
    values ('${cvId}', '${seed.schoolA}', '${stageId}', 'L2', 'Advanced Lesson', 'flight', 1,
      ARRAY['${prereqLessonId}']::uuid[])
    returning id
  `);
  lessonWithPrereqId = l2Rows[0]!.id;

  // Add a line item to L1 (required, so it needs passing grade to satisfy prereq)
  await sql.unsafe(`
    insert into public.line_item (course_version_id, school_id, lesson_id, code, title, classification, position)
    values ('${cvId}', '${seed.schoolA}', '${prereqLessonId}', 'LI1', 'Basic skill', 'required', 0)
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

describe('Phase 6-02 schedule.approve eligibility gate', () => {
  it('approve with lesson_id NULL succeeds (Phase 3 regression)', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    // Create reservation WITHOUT lesson_id
    const created = await caller.schedule.request({
      activityType: 'flight',
      aircraftId,
      instructorId,
      studentId,
      startsAt: new Date('2027-06-10T14:00:00Z'),
      endsAt: new Date('2027-06-10T15:30:00Z'),
    });
    const approved = await caller.schedule.approve({
      reservationId: created!.reservationIds[0]!,
    });
    expect(approved!.status).toBe('approved');
  });

  it('approve with prereq missing throws PRECONDITION_FAILED', async () => {
    const sql = dbAsAdmin();
    // Create reservation WITH lesson_id pointing to L2 (prereq L1 not completed)
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-06-11 14:00+00,2027-06-11 15:30+00)'::tstzrange, 'requested',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${lessonWithPrereqId}', '${enrollmentId}')
      returning id
    `);

    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    await expect(caller.schedule.approve({ reservationId: resRows[0]!.id })).rejects.toThrow(
      /blocker|eligibility|precondition/i,
    );
  });

  it('approve with active override bypasses blockers', async () => {
    const sql = dbAsAdmin();

    // Grant an override for L2 on this enrollment
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.lesson_override
        (school_id, base_id, student_enrollment_id, lesson_id, kind,
         justification, granted_by_user_id, signer_snapshot, expires_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${enrollmentId}', '${lessonWithPrereqId}',
         'prerequisite_skip', 'Override for testing the bypass path in eligibility',
         'a6511111-1111-4111-8111-111111110003',
         '{"full_name":"Chief SE","cert_type":"chief_instructor","cert_number":"CFI-SE02","granted_at":"2027-01-01"}'::jsonb,
         now() + interval '30 days')
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    // Create a new requested reservation for L2
    const resRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         aircraft_id, instructor_id, student_id, lesson_id, student_enrollment_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', 'flight',
         '[2027-06-12 14:00+00,2027-06-12 15:30+00)'::tstzrange, 'requested',
         '${aircraftId}', '${instructorId}', '${studentId}',
         '${lessonWithPrereqId}', '${enrollmentId}')
      returning id
    `);

    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    // Should succeed because the override bypasses the prereq check
    const approved = await caller.schedule.approve({
      reservationId: resRows[0]!.id,
    });
    expect(approved!.status).toBe('approved');
  });
});
