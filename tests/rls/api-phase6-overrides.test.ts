/**
 * Phase 6-02 — admin.overrides API integration tests.
 *
 * Tests:
 *   - chiefInstructorOnlyProcedure auth gates (admin-only rejected,
 *     regular instructor rejected, chief instructor accepted)
 *   - grant/revoke roundtrip
 *   - grant justification validation
 *   - list scope filtering
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let chiefInstructorId: string;
let regularInstructorId: string;
let studentId: string;
let enrollmentId: string;
let lessonId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Chief instructor
  const ciId = 'a6111111-1111-4111-8111-111111110001';
  // Regular instructor
  const riId = 'a6111111-1111-4111-8111-111111110002';
  // Student
  const stuId = 'a6111111-1111-4111-8111-111111110003';

  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${ciId}',  '${seed.schoolA}', 'chief-p6@alpha.test',  'Chief Instructor'),
      ('${riId}',  '${seed.schoolA}', 'inst-p6@alpha.test',   'Regular Instructor'),
      ('${stuId}', '${seed.schoolA}', 'stu-p6@alpha.test',    'Student P6')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default, is_chief_instructor) values
      ('${ciId}',  'instructor', 'none', true, true),
      ('${riId}',  'instructor', 'none', true, false),
      ('${stuId}', 'student',    'none', true, false)
  `);
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, faa_airman_cert_number)
    values
      ('${ciId}',  '${seed.schoolA}', 'Chief', 'Instructor', 'CFI-CI01'),
      ('${riId}',  '${seed.schoolA}', 'Regular', 'Instructor', 'CFI-RI01'),
      ('${stuId}', '${seed.schoolA}', 'Student', 'P6', null)
  `);

  chiefInstructorId = ciId;
  regularInstructorId = riId;
  studentId = stuId;

  // Build a course tree manually (don't rely on seed function)
  const courseRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${seed.schoolA}', 'P6-OVR', 'Override Test Course', 'private_pilot')
    returning id
  `);
  const courseId = courseRows[0]!.id;

  const cvRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version (course_id, school_id, version_label, grading_scale, min_levels, published_at)
    values ('${courseId}', '${seed.schoolA}', 'v1.0', 'absolute_ipm', 3, now())
    returning id
  `);
  const cvId = cvRows[0]!.id;

  const stageRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.stage (course_version_id, school_id, code, title, position)
    values ('${cvId}', '${seed.schoolA}', 'S1', 'Stage 1', 0)
    returning id
  `);
  const stageId = stageRows[0]!.id;

  const lessonRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson (course_version_id, school_id, stage_id, code, title, kind, position)
    values ('${cvId}', '${seed.schoolA}', '${stageId}', 'L1', 'First Lesson', 'flight', 0)
    returning id
  `);
  lessonId = lessonRows[0]!.id;

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

describe('Phase 6-02 admin.overrides', () => {
  it('chiefInstructorOnlyProcedure rejects admin-only user', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'admin',
      roles: ['admin'],
    });
    await expect(
      caller.admin.overrides.grant({
        enrollmentId,
        lessonId,
        kind: 'prerequisite_skip',
        justification: 'Testing admin rejection for override grant procedure',
      }),
    ).rejects.toThrow(/chief instructor/i);
  });

  it('chiefInstructorOnlyProcedure rejects regular instructor', async () => {
    const caller = adminCaller({
      userId: regularInstructorId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'instructor',
      roles: ['instructor'],
    });
    await expect(
      caller.admin.overrides.grant({
        enrollmentId,
        lessonId,
        kind: 'prerequisite_skip',
        justification: 'Testing regular instructor rejection for override',
      }),
    ).rejects.toThrow(/chief instructor/i);
  });

  it('chiefInstructorOnlyProcedure accepts chief instructor', async () => {
    const caller = adminCaller({
      userId: chiefInstructorId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'instructor',
      roles: ['instructor'],
    });
    const result = await caller.admin.overrides.grant({
      enrollmentId,
      lessonId,
      kind: 'prerequisite_skip',
      justification: 'Chief instructor granting override for testing purposes',
    });
    expect(result).toBeTruthy();
    expect((result as Record<string, unknown>).signer_snapshot).toBeTruthy();
  });

  it('grant rejects justification < 20 chars', async () => {
    const caller = adminCaller({
      userId: chiefInstructorId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      activeRole: 'instructor',
      roles: ['instructor'],
    });
    await expect(
      caller.admin.overrides.grant({
        enrollmentId,
        lessonId,
        kind: 'currency_waiver',
        justification: 'too short',
      }),
    ).rejects.toThrow(/20/);
  });

  it('revoke sets revoked_at and reason', async () => {
    const sql = dbAsAdmin();
    // Find the active override we granted above
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      select id from public.lesson_override
      where student_enrollment_id = '${enrollmentId}'
        and consumed_at is null and revoked_at is null
      limit 1
    `);
    expect(rows.length).toBeGreaterThan(0);
    const overrideId = rows[0]!.id;

    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.overrides.revoke({
      overrideId,
      reason: 'Override no longer needed',
    });
    expect(result).toBeTruthy();
    expect((result as Record<string, unknown>).revoked_at).toBeTruthy();
    expect((result as Record<string, unknown>).revocation_reason).toBe('Override no longer needed');
  });

  it('list returns overrides with scope filter', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const all = await caller.admin.overrides.list({ scope: 'all' });
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);

    const active = await caller.admin.overrides.list({ scope: 'active' });
    expect(Array.isArray(active)).toBe(true);
    // We revoked the only one, so active should be empty
    expect(active.length).toBe(0);
  });
});
