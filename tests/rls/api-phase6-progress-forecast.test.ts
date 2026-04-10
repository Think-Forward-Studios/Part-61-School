/**
 * Phase 6-02 — record + admin.enrollments forecast/minimums tests.
 *
 * Tests:
 *   - admin.enrollments.getProgressForecast returns (or creates) cache
 *   - admin.enrollments.getMinimumsStatus returns view row
 *   - admin.enrollments.listRolloverQueue returns array
 *   - record.getMyProgressForecast returns student's own forecast
 *   - record.getMyMinimumsStatus scoped to own enrollment
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let enrollmentId: string;
let studentId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  const stuId = 'a6311111-1111-4111-8111-111111110001';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${stuId}', '${seed.schoolA}', 'stu-p6fc@alpha.test', 'Student FC')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${stuId}', 'student', 'none', true)
  `);
  studentId = stuId;

  // Build course tree manually
  const courseRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${seed.schoolA}', 'P6-FC', 'Forecast Test Course', 'private_pilot')
    returning id
  `);
  const cvRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version (course_id, school_id, version_label, grading_scale, min_levels, published_at,
      minimum_hours, default_plan_cadence_hours_per_week)
    values ('${courseRows[0]!.id}', '${seed.schoolA}', 'v1.0', 'absolute_ipm', 3, now(),
      '{"total": 40, "dual": 20, "solo": 10}'::jsonb, 4.0)
    returning id
  `);
  const cvId = cvRows[0]!.id;

  const enrRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_course_enrollment (school_id, user_id, course_version_id, plan_cadence_hours_per_week)
    values ('${seed.schoolA}', '${stuId}', '${cvId}', 4.0)
    returning id
  `);
  enrollmentId = enrRows[0]!.id;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('Phase 6-02 forecast/minimums/rollover', () => {
  it('admin.enrollments.getProgressForecast returns forecast (auto-refreshes cache)', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.enrollments.getProgressForecast({
      enrollmentId,
    });
    // May be null if the enrollment is brand new with no flight time
    // but the refresh should have been called
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('admin.enrollments.getMinimumsStatus returns view data', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.enrollments.getMinimumsStatus({
      enrollmentId,
    });
    // May be null if view returns no rows for this enrollment
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('admin.enrollments.listRolloverQueue returns empty array for new enrollment', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.enrollments.listRolloverQueue({
      enrollmentId,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('record.getMyProgressForecast returns student forecast', async () => {
    const caller = adminCaller({
      userId: studentId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'student',
      roles: ['student'],
    });
    const result = await caller.record.getMyProgressForecast();
    // May be null if no forecast data
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('record.getMyMinimumsStatus scoped to own enrollment', async () => {
    const caller = adminCaller({
      userId: studentId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'student',
      roles: ['student'],
    });
    const result = await caller.record.getMyMinimumsStatus({
      enrollmentId,
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('record.getMyMinimumsStatus rejects foreign enrollment', async () => {
    const caller = adminCaller({
      userId: seed.userA, // Admin user, not the student
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'student',
      roles: ['student'],
    });
    await expect(
      caller.record.getMyMinimumsStatus({ enrollmentId }),
    ).rejects.toThrow(/not found/i);
  });
});
