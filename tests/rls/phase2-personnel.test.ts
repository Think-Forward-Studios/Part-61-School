/**
 * Phase 2 RLS: personnel tables.
 *
 * For every new school-scoped personnel table, seed school A and
 * school B and assert that user A (authenticated for school A) sees
 * exactly one row — their own — and zero rows from school B.
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

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // person_profile
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name)
    values
      ('${seed.userA}', '${seed.schoolA}', 'Alpha', 'Admin'),
      ('${seed.userB}', '${seed.schoolB}', 'Bravo', 'Admin')
  `);
  // person_hold
  await sql.unsafe(`
    insert into public.person_hold (school_id, user_id, kind, reason, created_by)
    values
      ('${seed.schoolA}', '${seed.userA}', 'hold', 'paperwork', '${seed.userA}'),
      ('${seed.schoolB}', '${seed.userB}', 'hold', 'paperwork', '${seed.userB}')
  `);
  // instructor_currency
  await sql.unsafe(`
    insert into public.instructor_currency (school_id, user_id, kind, effective_at, expires_at)
    values
      ('${seed.schoolA}', '${seed.userA}', 'cfi', now() - interval '60 days', now() + interval '300 days'),
      ('${seed.schoolB}', '${seed.userB}', 'cfi', now() - interval '60 days', now() + interval '300 days')
  `);
  // instructor_qualification (base-scoped)
  await sql.unsafe(`
    insert into public.instructor_qualification (school_id, base_id, user_id, kind, descriptor, granted_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${seed.userA}', 'aircraft_type', 'C172', '${seed.userA}'),
      ('${seed.schoolB}', '${seed.baseB}', '${seed.userB}', 'aircraft_type', 'C172', '${seed.userB}')
  `);
  // no_show
  await sql.unsafe(`
    insert into public.no_show (school_id, user_id, scheduled_at, recorded_by)
    values
      ('${seed.schoolA}', '${seed.userA}', now() - interval '1 day', '${seed.userA}'),
      ('${seed.schoolB}', '${seed.userB}', now() - interval '1 day', '${seed.userB}')
  `);
  // student_course_enrollment
  await sql.unsafe(`
    insert into public.student_course_enrollment (school_id, user_id, course_descriptor)
    values
      ('${seed.schoolA}', '${seed.userA}', 'PPL'),
      ('${seed.schoolB}', '${seed.userB}', 'PPL')
  `);
  // instructor_experience
  await sql.unsafe(`
    insert into public.instructor_experience (school_id, user_id, total_time, as_of_date)
    values
      ('${seed.schoolA}', '${seed.userA}', 1500.0, current_date),
      ('${seed.schoolB}', '${seed.userB}', 1500.0, current_date)
  `);

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('phase 2 personnel cross-tenant isolation', () => {
  const tables = [
    'person_profile',
    'person_hold',
    'instructor_currency',
    'instructor_qualification',
    'no_show',
    'student_course_enrollment',
    'instructor_experience',
  ] as const;

  for (const table of tables) {
    it(`user A sees exactly their own row in ${table}`, async () => {
      const rows = await asUserOf(
        { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
        (sql) =>
          sql.unsafe<Array<{ school_id: string }>>(
            `select school_id from public.${table}`,
          ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.school_id).toBe(seed.schoolA);
    });

    it(`user B sees exactly their own row in ${table}`, async () => {
      const rows = await asUserOf(
        { userId: seed.userB, schoolId: seed.schoolB, activeRole: 'admin' },
        (sql) =>
          sql.unsafe<Array<{ school_id: string }>>(
            `select school_id from public.${table}`,
          ),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.school_id).toBe(seed.schoolB);
    });
  }
});
