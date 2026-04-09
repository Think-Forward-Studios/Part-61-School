/**
 * Phase 5 RLS + behavior tests for the syllabus / grading / records pillar.
 *
 * Covers:
 *   - Cross-tenant isolation for every new Phase 5 table
 *   - clone_course_version deep-copies a tree
 *   - stage_check different-instructor trigger
 *   - lesson_grade_sheet seal trigger
 *   - Published course_version transitive seal (line_item update blocked)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
} from './harness';

let seed: SeedResult;

// Tree IDs per school
let courseA: string;
let courseB: string;
let versionA: string;
let versionB: string;
let stageA: string;
let stageB: string;
let lessonA: string;
let lessonB: string;
let lineItemA: string;
let lineItemB: string;

// Per-school enrollment
let enrollmentA: string;
let enrollmentB: string;

// Phase 5 rows
let gradeSheetA: string;
let gradeSheetB: string;
let sealedGradeSheetA: string;
let stageCheckA: string;
let stageCheckB: string;
let studentEndorsementA: string;
let studentEndorsementB: string;
let flightLogTimeA: string;
let flightLogTimeB: string;

// A separate instructor user in school A used for stage_check different-
// instructor positive case.
const INSTRUCTOR_A2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Extra instructor user in school A
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name)
      values ('${INSTRUCTOR_A2}', '${seed.schoolA}', 'inst2-a@alpha.test', 'Alpha Inst 2')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default)
      values ('${INSTRUCTOR_A2}', 'instructor', 'none', true)
  `);

  // ---------- Courses + versions ----------
  const c = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values
      ('${seed.schoolA}', 'PPL-A', 'Private Pilot A', 'private_pilot'),
      ('${seed.schoolB}', 'PPL-B', 'Private Pilot B', 'private_pilot')
    returning id
  `);
  courseA = c[0]!.id;
  courseB = c[1]!.id;

  const cv = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version
      (course_id, school_id, version_label, grading_scale, min_levels)
    values
      ('${courseA}', '${seed.schoolA}', 'v1', 'absolute_ipm', 3),
      ('${courseB}', '${seed.schoolB}', 'v1', 'absolute_ipm', 3)
    returning id
  `);
  versionA = cv[0]!.id;
  versionB = cv[1]!.id;

  const st = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.stage
      (school_id, course_version_id, position, code, title)
    values
      ('${seed.schoolA}', '${versionA}', 1, 'S1', 'Pre-Solo'),
      ('${seed.schoolB}', '${versionB}', 1, 'S1', 'Pre-Solo')
    returning id
  `);
  stageA = st[0]!.id;
  stageB = st[1]!.id;

  const ls = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson
      (school_id, course_version_id, stage_id, position, code, title, kind)
    values
      ('${seed.schoolA}', '${versionA}', '${stageA}', 1, 'L1', 'Intro Flight', 'flight'),
      ('${seed.schoolB}', '${versionB}', '${stageB}', 1, 'L1', 'Intro Flight', 'flight')
    returning id
  `);
  lessonA = ls[0]!.id;
  lessonB = ls[1]!.id;

  const li = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.line_item
      (school_id, course_version_id, lesson_id, position, code, title, classification)
    values
      ('${seed.schoolA}', '${versionA}', '${lessonA}', 1, 'LI1', 'Preflight', 'required'),
      ('${seed.schoolB}', '${versionB}', '${lessonB}', 1, 'LI1', 'Preflight', 'required')
    returning id
  `);
  lineItemA = li[0]!.id;
  lineItemB = li[1]!.id;

  // ---------- Enrollments ----------
  const en = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_course_enrollment
      (school_id, user_id, course_version_id, primary_instructor_id, course_descriptor)
    values
      ('${seed.schoolA}', '${seed.userA}', '${versionA}', '${seed.userA}', null),
      ('${seed.schoolB}', '${seed.userB}', '${versionB}', '${seed.userB}', null)
    returning id
  `);
  enrollmentA = en[0]!.id;
  enrollmentB = en[1]!.id;

  // ---------- Grade sheets (one draft, one sealed) ----------
  const gs = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson_grade_sheet
      (school_id, base_id, student_enrollment_id, lesson_id, conducted_by_user_id)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${enrollmentA}', '${lessonA}', '${seed.userA}'),
      ('${seed.schoolB}', '${seed.baseB}', '${enrollmentB}', '${lessonB}', '${seed.userB}')
    returning id
  `);
  gradeSheetA = gs[0]!.id;
  gradeSheetB = gs[1]!.id;

  // Sealed grade sheet: insert already-sealed via replica mode so the
  // BEFORE UPDATE trigger does not fire (it only fires on UPDATE).
  const sgs = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson_grade_sheet
      (school_id, base_id, student_enrollment_id, lesson_id, conducted_by_user_id,
       status, signer_snapshot, sealed_at)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${enrollmentA}', '${lessonA}', '${seed.userA}',
       'sealed',
       '{"user_id":"${seed.userA}","certificate_type":"cfi"}'::jsonb,
       now())
    returning id
  `);
  sealedGradeSheetA = sgs[0]!.id;

  // ---------- Stage checks (checker != primary_instructor for school A) ----------
  const sc = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.stage_check
      (school_id, base_id, student_enrollment_id, stage_id, checker_user_id)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${enrollmentA}', '${stageA}', '${INSTRUCTOR_A2}'),
      ('${seed.schoolB}', '${seed.baseB}', '${enrollmentB}', '${stageB}', '${seed.userB}')
    returning id
  `);
  stageCheckA = sc[0]!.id;
  stageCheckB = sc[1]!.id;
  // schoolB stage check has checker = primary instructor = userB. That
  // SHOULD have been rejected by the trigger... but replica mode
  // disables triggers, so it goes through. We only test the trigger
  // positively inside the dedicated test.

  // ---------- Student endorsements ----------
  const en2 = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_endorsement
      (school_id, base_id, student_user_id, rendered_text, issued_by_user_id)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${seed.userA}', 'Solo endorsement', '${INSTRUCTOR_A2}'),
      ('${seed.schoolB}', '${seed.baseB}', '${seed.userB}', 'Solo endorsement', '${seed.userB}')
    returning id
  `);
  studentEndorsementA = en2[0]!.id;
  studentEndorsementB = en2[1]!.id;

  // ---------- flight_log_time ----------
  const flt = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_time
      (school_id, base_id, user_id, kind, day_minutes, day_landings)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${seed.userA}', 'dual_received', 60, 2),
      ('${seed.schoolB}', '${seed.baseB}', '${seed.userB}', 'dual_received', 60, 2)
    returning id
  `);
  flightLogTimeA = flt[0]!.id;
  flightLogTimeB = flt[1]!.id;

  await sql.unsafe(`set session_replication_role = origin`);

  // Touch-unused avoids eslint no-unused-vars complaints on the "B"
  // references that are only used indirectly.
  void courseB;
  void versionB;
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Cross-tenant isolation
// ---------------------------------------------------------------------
describe('phase 5 cross-tenant isolation', () => {
  const checkInvisible = async (table: string, id: string) => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.${table} where id = '${id}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  };

  it('course B invisible to user A', async () => {
    await checkInvisible('course', courseB);
  });
  it('course_version B invisible to user A', async () => {
    await checkInvisible('course_version', versionB);
  });
  it('stage B invisible to user A', async () => {
    await checkInvisible('stage', stageB);
  });
  it('lesson B invisible to user A', async () => {
    await checkInvisible('lesson', lessonB);
  });
  it('line_item B invisible to user A', async () => {
    await checkInvisible('line_item', lineItemB);
  });
  it('lesson_grade_sheet B invisible to user A', async () => {
    await checkInvisible('lesson_grade_sheet', gradeSheetB);
  });
  it('stage_check B invisible to user A', async () => {
    await checkInvisible('stage_check', stageCheckB);
  });
  it('student_endorsement B invisible to user A', async () => {
    await checkInvisible('student_endorsement', studentEndorsementB);
  });
  it('flight_log_time B invisible to user A', async () => {
    await checkInvisible('flight_log_time', flightLogTimeB);
  });

  it('user A CAN see their own course', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.course where id = '${courseA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
    void gradeSheetA;
    void flightLogTimeA;
    void studentEndorsementA;
    void stageCheckA;
    void lineItemA;
  });
});

// ---------------------------------------------------------------------
// clone_course_version
// ---------------------------------------------------------------------
describe('clone_course_version deep-copies a tree', () => {
  it('clones version A into a new course_version under same school', async () => {
    const sql = dbAsAdmin();
    const r = await sql.unsafe<Array<{ new_id: string }>>(
      `select public.clone_course_version('${versionA}', '${seed.schoolA}') as new_id`,
    );
    const newId = r[0]!.new_id;
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(versionA);

    // Check that a new stage, lesson, and line_item were inserted under
    // the new course_version_id.
    const stages = await sql.unsafe<Array<{ id: string }>>(
      `select id from public.stage where course_version_id = '${newId}'`,
    );
    expect(stages.length).toBeGreaterThanOrEqual(1);

    const lessons = await sql.unsafe<Array<{ id: string }>>(
      `select id from public.lesson where course_version_id = '${newId}'`,
    );
    expect(lessons.length).toBeGreaterThanOrEqual(1);

    const lineItems = await sql.unsafe<Array<{ id: string }>>(
      `select id from public.line_item where course_version_id = '${newId}'`,
    );
    expect(lineItems.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------
// stage_check different-instructor trigger
// ---------------------------------------------------------------------
describe('stage_check different-instructor trigger', () => {
  it('rejects checker_user_id == primary_instructor_id', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`
        insert into public.stage_check
          (school_id, base_id, student_enrollment_id, stage_id, checker_user_id)
        values
          ('${seed.schoolA}', '${seed.baseA}', '${enrollmentA}', '${stageA}', '${seed.userA}')
      `),
    ).rejects.toThrow(/checker must differ from enrollment primary_instructor_id/);
  });

  it('accepts checker_user_id != primary_instructor_id', async () => {
    const sql = dbAsAdmin();
    const r = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.stage_check
        (school_id, base_id, student_enrollment_id, stage_id, checker_user_id)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${enrollmentA}', '${stageA}', '${INSTRUCTOR_A2}')
      returning id
    `);
    expect(r).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// lesson_grade_sheet seal trigger
// ---------------------------------------------------------------------
describe('lesson_grade_sheet seal trigger', () => {
  it('rejects UPDATE on a sealed grade sheet', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(
        `update public.lesson_grade_sheet set overall_remarks = 'tampered' where id = '${sealedGradeSheetA}'`,
      ),
    ).rejects.toThrow(/sealed and cannot be modified/);
  });
});

// ---------------------------------------------------------------------
// Transitive seal: published course_version
// ---------------------------------------------------------------------
describe('transitive seal on published course_version', () => {
  it('blocks UPDATE on line_item belonging to a published course_version', async () => {
    const sql = dbAsAdmin();
    // Publish version A
    await sql.unsafe(
      `update public.course_version set published_at = now() where id = '${versionA}'`,
    );
    // Now editing the line_item should fail via tree seal guard
    await expect(
      sql.unsafe(
        `update public.line_item set title = 'tampered' where id = '${lineItemA}'`,
      ),
    ).rejects.toThrow(/published course_version/);
  });
});
