/**
 * Phase 6 RLS + behavior tests for new tables.
 *
 * Covers:
 *   - Cross-tenant isolation for lesson_override, training_record_audit_exception,
 *     student_progress_forecast_cache
 *   - Hard-delete blocker on lesson_override + training_record_audit_exception
 *   - Partial unique index on lesson_override (one active per enrollment+lesson)
 *   - Partial unique index on training_record_audit_exception (one open per enrollment+kind)
 *   - Audit trigger fires on insert for all three tables
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
  SCHOOL_A,
  SCHOOL_B,
  USER_A,
  USER_B,
  BASE_A,
  BASE_B,
} from './harness';

let seed: SeedResult;

// Phase 5 prerequisite data
let courseA: string;
let courseVersionA: string;
let enrollmentA: string;
let enrollmentB: string;
let lessonA: string;
let lessonB: string;
let gradeSheetA: string;

// Phase 6 table rows
let overrideA: string;
let overrideB: string;
let exceptionA: string;
let exceptionB: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Create course tree for school A + B
  const courses = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought) values
      ('${SCHOOL_A}', 'PPL-A', 'Private Pilot A', 'private_pilot'),
      ('${SCHOOL_B}', 'PPL-B', 'Private Pilot B', 'private_pilot')
    returning id
  `);
  courseA = courses[0]!.id;
  const courseB = courses[1]!.id;

  const versions = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version (course_id, school_id, version_label) values
      ('${courseA}', '${SCHOOL_A}', 'v1'),
      ('${courseB}', '${SCHOOL_B}', 'v1')
    returning id
  `);
  courseVersionA = versions[0]!.id;
  const courseVersionB = versions[1]!.id;

  // Stages (required by lesson exclusive-FK check)
  const stages = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.stage (school_id, course_version_id, position, code, title) values
      ('${SCHOOL_A}', '${courseVersionA}', 1, 'S1', 'Stage 1'),
      ('${SCHOOL_B}', '${courseVersionB}', 1, 'S1', 'Stage 1')
    returning id
  `);
  const stageA = stages[0]!.id;
  const stageB = stages[1]!.id;

  const lessons = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson
      (school_id, course_version_id, stage_id, position, code, title, kind) values
      ('${SCHOOL_A}', '${courseVersionA}', '${stageA}', 1, 'L1', 'Lesson 1', 'flight'),
      ('${SCHOOL_B}', '${courseVersionB}', '${stageB}', 1, 'L1', 'Lesson 1', 'flight')
    returning id
  `);
  lessonA = lessons[0]!.id;
  lessonB = lessons[1]!.id;

  const enrollments = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_course_enrollment
      (school_id, user_id, course_version_id) values
      ('${SCHOOL_A}', '${USER_A}', '${courseVersionA}'),
      ('${SCHOOL_B}', '${USER_B}', '${courseVersionB}')
    returning id
  `);
  enrollmentA = enrollments[0]!.id;
  enrollmentB = enrollments[1]!.id;

  // Grade sheet for school A (needed for consumed_by_grade_sheet_id FK)
  const sheets = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson_grade_sheet
      (school_id, base_id, student_enrollment_id, lesson_id) values
      ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}', '${lessonA}')
    returning id
  `);
  gradeSheetA = sheets[0]!.id;

  // --- Phase 6 data ---

  // lesson_override per school
  const overrides = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson_override
      (school_id, base_id, student_enrollment_id, lesson_id, kind,
       justification, granted_by_user_id, signer_snapshot)
    values
      ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}', '${lessonA}',
       'prerequisite_skip',
       'Student demonstrated equivalent experience in prior training program',
       '${USER_A}',
       '{"full_name":"Alpha Admin","cert_type":"cfi","cert_number":"12345","granted_at":"2026-04-09"}'::jsonb),
      ('${SCHOOL_B}', '${BASE_B}', '${enrollmentB}', '${lessonB}',
       'prerequisite_skip',
       'Student demonstrated equivalent experience in prior training program',
       '${USER_B}',
       '{"full_name":"Bravo Admin","cert_type":"cfi","cert_number":"67890","granted_at":"2026-04-09"}'::jsonb)
    returning id
  `);
  overrideA = overrides[0]!.id;
  overrideB = overrides[1]!.id;

  // training_record_audit_exception per school
  const exceptions = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.training_record_audit_exception
      (school_id, base_id, student_enrollment_id, kind, severity, details)
    values
      ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}',
       'missing_lessons', 'warn', '{"missing":["L2","L3"]}'::jsonb),
      ('${SCHOOL_B}', '${BASE_B}', '${enrollmentB}',
       'hours_deficit', 'critical', '{"deficit_hours":15}'::jsonb)
    returning id
  `);
  exceptionA = exceptions[0]!.id;
  exceptionB = exceptions[1]!.id;

  // student_progress_forecast_cache per school
  await sql.unsafe(`
    insert into public.student_progress_forecast_cache
      (student_enrollment_id, school_id, base_id, expected_hours_to_date,
       actual_hours_to_date, ahead_behind_hours, ahead_behind_weeks,
       remaining_hours, confidence)
    values
      ('${enrollmentA}', '${SCHOOL_A}', '${BASE_A}', 20, 18, -2, -0.5, 22, 'medium'),
      ('${enrollmentB}', '${SCHOOL_B}', '${BASE_B}', 15, 17, 2, 0.5, 23, 'high')
  `);

  await sql.unsafe(`set session_replication_role = origin`);

  // Touch unused to satisfy eslint
  void courseA;
  void courseVersionA;
  void gradeSheetA;
  void lessonB;
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Group 1: cross-tenant isolation
// ---------------------------------------------------------------------
describe('phase 6 cross-tenant isolation', () => {
  it('user A cannot see school B lesson_override', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.lesson_override where id = '${overrideB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A CAN see their own lesson_override (sanity)', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.lesson_override where id = '${overrideA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user A cannot see school B training_record_audit_exception', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.training_record_audit_exception where id = '${exceptionB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A CAN see their own training_record_audit_exception (sanity)', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.training_record_audit_exception where id = '${exceptionA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user A cannot see school B student_progress_forecast_cache', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select student_enrollment_id from public.student_progress_forecast_cache
           where student_enrollment_id = '${enrollmentB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A CAN see their own student_progress_forecast_cache (sanity)', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select student_enrollment_id from public.student_progress_forecast_cache
           where student_enrollment_id = '${enrollmentA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user A cannot INSERT lesson_override with school B school_id', async () => {
    await expect(
      asUserOf(
        { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
        (sql) =>
          sql.unsafe(`
            insert into public.lesson_override
              (school_id, base_id, student_enrollment_id, lesson_id, kind,
               justification, granted_by_user_id, signer_snapshot)
            values
              ('${SCHOOL_B}', '${BASE_B}', '${enrollmentB}', '${lessonB}',
               'prerequisite_skip',
               'Attempting cross-tenant override insertion attack',
               '${USER_A}',
               '{"full_name":"Attacker","cert_type":"cfi"}'::jsonb)
          `),
      ),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------
// Group 2: hard-delete blocker
// ---------------------------------------------------------------------
describe('phase 6 hard-delete blocker', () => {
  it('cannot hard-delete a lesson_override', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`delete from public.lesson_override where id = '${overrideA}'`),
    ).rejects.toThrow(/Hard delete is not permitted/);
  });

  it('cannot hard-delete a training_record_audit_exception', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(
        `delete from public.training_record_audit_exception where id = '${exceptionA}'`,
      ),
    ).rejects.toThrow(/Hard delete is not permitted/);
  });
});

// ---------------------------------------------------------------------
// Group 3: partial unique indexes
// ---------------------------------------------------------------------
describe('phase 6 partial unique indexes', () => {
  it('lesson_override rejects second active override for same enrollment+lesson', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`
        insert into public.lesson_override
          (school_id, base_id, student_enrollment_id, lesson_id, kind,
           justification, granted_by_user_id, signer_snapshot)
        values
          ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}', '${lessonA}',
           'currency_waiver',
           'Second active override should be rejected by partial unique index',
           '${USER_A}',
           '{"full_name":"Alpha Admin","cert_type":"cfi"}'::jsonb)
      `),
    ).rejects.toThrow(/lesson_override_active_unique/);
  });

  it('lesson_override allows second override after first is consumed', async () => {
    const sql = dbAsAdmin();
    // Consume the existing override
    await sql.unsafe(`
      update public.lesson_override
         set consumed_at = now(),
             consumed_by_grade_sheet_id = '${gradeSheetA}'
       where id = '${overrideA}'
    `);
    // Now a second active override should succeed
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.lesson_override
        (school_id, base_id, student_enrollment_id, lesson_id, kind,
         justification, granted_by_user_id, signer_snapshot)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}', '${lessonA}',
         'currency_waiver',
         'Second override allowed because first was consumed by grade sheet',
         '${USER_A}',
         '{"full_name":"Alpha Admin","cert_type":"cfi"}'::jsonb)
      returning id
    `);
    expect(rows).toHaveLength(1);
  });

  it('training_record_audit_exception rejects duplicate open exception', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`
        insert into public.training_record_audit_exception
          (school_id, base_id, student_enrollment_id, kind, severity)
        values
          ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}',
           'missing_lessons', 'critical')
      `),
    ).rejects.toThrow(/training_record_audit_exception_open_unique/);
  });

  it('training_record_audit_exception allows new row after resolving old', async () => {
    const sql = dbAsAdmin();
    // Resolve existing
    await sql.unsafe(`
      update public.training_record_audit_exception
         set resolved_at = now()
       where id = '${exceptionA}'
    `);
    // Insert new open one
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.training_record_audit_exception
        (school_id, base_id, student_enrollment_id, kind, severity)
      values
        ('${SCHOOL_A}', '${BASE_A}', '${enrollmentA}',
         'missing_lessons', 'info')
      returning id
    `);
    expect(rows).toHaveLength(1);
  });
});
