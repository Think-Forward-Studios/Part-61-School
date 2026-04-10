/**
 * Phase 6-02 — schedule.suggestNextActivity + evaluateLessonEligibility tests.
 *
 * Tests:
 *   - suggestNextActivity returns a suggestion with reasoning
 *   - evaluateLessonEligibility returns typed blockers
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let enrollmentId: string;
let lessonId: string;
let aircraftId: string;
let instructorId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  const instId = 'a6211111-1111-4111-8111-111111110001';
  const stuId = 'a6211111-1111-4111-8111-111111110002';

  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}', '${seed.schoolA}', 'inst-p6na@alpha.test', 'Inst NA'),
      ('${stuId}',  '${seed.schoolA}', 'stu-p6na@alpha.test',  'Student NA')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${instId}', 'instructor', 'none', true),
      ('${stuId}',  'student',    'none', true)
  `);
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, faa_airman_cert_number)
    values
      ('${instId}', '${seed.schoolA}', 'Inst', 'NA', 'CFI-NA01'),
      ('${stuId}',  '${seed.schoolA}', 'Student', 'NA', null)
  `);
  instructorId = instId;

  // Aircraft
  const acRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-P6NA')
    returning id
  `);
  aircraftId = acRows[0]!.id;

  // Build course tree manually
  const courseRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${seed.schoolA}', 'P6-NAC', 'Next Activity Test Course', 'private_pilot')
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

  const lessonRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.lesson (course_version_id, school_id, stage_id, code, title, kind, position)
    values ('${cvId}', '${seed.schoolA}', '${stageRows[0]!.id}', 'L1', 'First Lesson', 'flight', 0)
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

describe('Phase 6-02 schedule.suggestNextActivity + evaluateLessonEligibility', () => {
  it('suggestNextActivity returns a suggestion with reasoning', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.schedule.suggestNextActivity({ enrollmentId });
    expect(result).toBeTruthy();
    expect(typeof result.reasoning).toBe('string');
    if (result.lessonId) {
      expect(result.lessonId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it('evaluateLessonEligibility returns typed result', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.schedule.evaluateLessonEligibility({
      enrollmentId,
      lessonId,
      aircraftId,
      instructorUserId: instructorId,
    });
    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.blockers)).toBe(true);
    for (const b of result.blockers) {
      expect(b.kind).toBeTruthy();
      expect(b.detail).toBeTruthy();
    }
  });
});
