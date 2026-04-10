/**
 * Phase 6-02 — admin.audit API integration tests.
 *
 * Tests:
 *   - runNow triggers the audit function and returns open count
 *   - list with severity filter
 *   - markResolved clears an exception
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let enrollmentId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  const stuId = 'a6411111-1111-4111-8111-111111110001';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${stuId}', '${seed.schoolA}', 'stu-p6au@alpha.test', 'Student AU')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${stuId}', 'student', 'none', true)
  `);

  // Build course tree manually
  const courseRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course (school_id, code, title, rating_sought)
    values ('${seed.schoolA}', 'P6-AUD', 'Audit Test Course', 'private_pilot')
    returning id
  `);
  const cvRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.course_version (course_id, school_id, version_label, grading_scale, min_levels, published_at)
    values ('${courseRows[0]!.id}', '${seed.schoolA}', 'v1.0', 'absolute_ipm', 3, now())
    returning id
  `);

  const enrRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.student_course_enrollment (school_id, user_id, course_version_id)
    values ('${seed.schoolA}', '${stuId}', '${cvRows[0]!.id}')
    returning id
  `);
  enrollmentId = enrRows[0]!.id;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('Phase 6-02 admin.audit', () => {
  it('runNow calls run_training_record_audit() and returns openCount', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.audit.runNow();
    expect(typeof result.openCount).toBe('number');
    expect(result.openCount).toBeGreaterThanOrEqual(0);
  });

  it('list returns array (possibly empty) with severity filter', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const all = await caller.admin.audit.list();
    expect(Array.isArray(all)).toBe(true);

    const criticals = await caller.admin.audit.list({ severity: 'critical' });
    expect(Array.isArray(criticals)).toBe(true);
    for (const row of criticals) {
      expect((row as Record<string, unknown>).severity).toBe('critical');
    }
  });

  it('markResolved sets resolved_at on an exception', async () => {
    const sql = dbAsAdmin();
    // Insert a synthetic audit exception
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.training_record_audit_exception
        (school_id, student_enrollment_id, kind, severity, details, first_detected_at, last_detected_at)
      values
        ('${seed.schoolA}'::uuid,
         '${enrollmentId}'::uuid,
         'hours_deficit'::public.audit_exception_kind,
         'warn'::public.audit_exception_severity,
         '{"hours_needed": 5}'::jsonb,
         now(),
         now())
      returning id
    `);
    const exceptionId = rows[0]!.id;

    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const result = await caller.admin.audit.markResolved({ exceptionId });
    expect(result.resolved).toBe(true);

    // Verify it no longer shows in unresolved list
    const list = await caller.admin.audit.list();
    const found = list.find(
      (r) => (r as Record<string, unknown>).id === exceptionId,
    );
    expect(found).toBeUndefined();
  });
});
