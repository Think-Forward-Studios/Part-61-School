/**
 * Phase 2 tenant context: app.base_id GUC end-to-end.
 *
 * Extends the two-school fixture with a SECOND base on School A and a
 * SECOND aircraft at that base. Then asserts the base-scoped RLS
 * branch on `public.aircraft` reacts correctly to
 * `current_setting('app.base_id', true)`:
 *
 *   1. Instructor of School A, app.base_id = BASE_A  → sees 1 aircraft
 *      (the BASE_A one).
 *   2. Admin of School A, app.base_id = BASE_A       → sees 2 aircraft
 *      (admin branch short-circuits the base filter, Pattern 2 RLS).
 *   3. Instructor of School A, app.base_id UNSET     → sees 2 aircraft
 *      (the nullable-fallback branch from 02-01 lets flows without a
 *      base context still read school-scoped rows; see 02-01 decisions
 *      and Pitfall 4). This documents the established contract.
 *   4. Admin of School B                             → sees 0 School A
 *      aircraft (cross-tenant invariant is unaffected).
 *
 * Also covers the access-token-hook status guard (PER-02) by calling
 * `public.custom_access_token_hook()` directly as the admin role for
 * a pending user and asserting it raises.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
} from './harness';

interface ContextFixture {
  baseA1: string; // primary base on school A (== seed.baseA)
  baseA2: string; // second base on school A
  aircraftA1: string;
  aircraftA2: string;
  instructorA: string; // non-admin instructor user on school A
  pendingA: string; // pending user on school A
}

const BASE_A2 = 'cccccccc-cccc-cccc-cccc-cccccccccc03';
const INSTRUCTOR_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02';
const PENDING_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03';

let seed: SeedResult;
let fixture: ContextFixture;

async function seedContextFixture(
  sql: Sql,
  s: SeedResult,
): Promise<ContextFixture> {
  await sql.unsafe(`set session_replication_role = replica`);

  // Second base on school A
  await sql.unsafe(`
    insert into public.bases (id, school_id, name, timezone) values
      ('${BASE_A2}', '${s.schoolA}', 'Alpha Secondary', 'America/Chicago')
  `);

  // Non-admin instructor on school A
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone, status) values
      ('${INSTRUCTOR_A}', '${s.schoolA}', 'cfi-a@alpha.test', 'Alpha CFI', 'America/Chicago', 'active')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${INSTRUCTOR_A}', 'instructor', 'none', true)
  `);

  // Pending user on school A (for access token hook guard test)
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone, status) values
      ('${PENDING_A}', '${s.schoolA}', 'pending-a@alpha.test', 'Alpha Pending', 'America/Chicago', 'pending')
  `);

  // Aircraft #1 at base A1 (primary)
  const [ac1] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${s.schoolA}', '${s.baseA}', 'N11111', 'Cessna', '172', 2005)
    returning id
  `);
  // Aircraft #2 at base A2 (secondary)
  const [ac2] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${s.schoolA}', '${BASE_A2}', 'N22222', 'Cessna', '172', 2008)
    returning id
  `);

  await sql.unsafe(`set session_replication_role = origin`);

  return {
    baseA1: s.baseA,
    baseA2: BASE_A2,
    aircraftA1: ac1!.id,
    aircraftA2: ac2!.id,
    instructorA: INSTRUCTOR_A,
    pendingA: PENDING_A,
  };
}

beforeAll(async () => {
  seed = await seedTwoSchools();
  fixture = await seedContextFixture(dbAsAdmin(), seed);
});

afterAll(async () => {
  await closeAdmin();
});

describe('phase 2 app.base_id GUC drives base-scoped RLS on aircraft', () => {
  it('instructor with app.base_id = BASE_A1 sees only the BASE_A1 aircraft', async () => {
    const rows = await asUserOf(
      {
        userId: fixture.instructorA,
        schoolId: seed.schoolA,
        activeRole: 'instructor',
      },
      async (sql) => {
        await sql.unsafe(
          `select set_config('app.base_id', $1, false)`,
          [fixture.baseA1],
        );
        return sql.unsafe<Array<{ id: string; base_id: string }>>(
          `select id, base_id from public.aircraft`,
        );
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(fixture.aircraftA1);
    expect(rows[0]!.base_id).toBe(fixture.baseA1);
  });

  it('admin with app.base_id = BASE_A1 sees BOTH school A aircraft (admin short-circuits base filter)', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) => {
        await sql.unsafe(
          `select set_config('app.base_id', $1, false)`,
          [fixture.baseA1],
        );
        return sql.unsafe<Array<{ id: string }>>(
          `select id from public.aircraft order by tail_number`,
        );
      },
    );
    expect(rows).toHaveLength(2);
  });

  it('instructor with app.base_id UNSET sees all school A aircraft (Pitfall 4 nullable fallback)', async () => {
    // NOTE: this asserts the established 02-01 contract — the base-scoped
    // RLS policy has an `or current_setting('app.base_id', true) is null`
    // branch so Phase 1 flows without a base context still read rows.
    // A strict "no base = no rows" contract was considered in the 02-02
    // plan but would regress the nullable-fallback decision locked in
    // 02-01. Documented in 02-02 SUMMARY as a test-assertion deviation.
    const rows = await asUserOf(
      {
        userId: fixture.instructorA,
        schoolId: seed.schoolA,
        activeRole: 'instructor',
      },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.aircraft`,
        ),
    );
    expect(rows).toHaveLength(2);
  });

  it('admin of school B cannot see school A aircraft (cross-tenant invariant)', async () => {
    const rows = await asUserOf(
      { userId: seed.userB, schoolId: seed.schoolB, activeRole: 'admin' },
      async (sql) => {
        await sql.unsafe(
          `select set_config('app.base_id', $1, false)`,
          [fixture.baseA1],
        );
        return sql.unsafe<Array<{ id: string }>>(
          `select id from public.aircraft where school_id = '${seed.schoolA}'`,
        );
      },
    );
    expect(rows).toHaveLength(0);
  });
});

describe('phase 2 custom_access_token_hook rejects non-active users (PER-02)', () => {
  it('raises account_not_active for a pending user', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(
        `select public.custom_access_token_hook(
           jsonb_build_object(
             'user_id', '${fixture.pendingA}',
             'claims', '{}'::jsonb
           )
         )`,
      ),
    ).rejects.toThrow(/account_not_active/);
  });

  it('still returns claims for an active user', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ custom_access_token_hook: unknown }>>(
      `select public.custom_access_token_hook(
         jsonb_build_object(
           'user_id', '${fixture.instructorA}',
           'claims', '{}'::jsonb
         )
       )`,
    );
    const event = rows[0]!.custom_access_token_hook as {
      claims: { school_id?: string; roles?: string[]; active_role?: string };
    };
    expect(event.claims.school_id).toBe(seed.schoolA);
    expect(event.claims.roles).toContain('instructor');
    expect(event.claims.active_role).toBe('instructor');
  });
});
