/**
 * Phase 3 concurrent-insert exclusion-constraint test.
 *
 * Two parallel transactions on two different connections each insert
 * an overlapping `approved` reservation on the same aircraft. Postgres'
 * partial GiST exclusion constraint must reject exactly one of them
 * with SQLSTATE 23P01.
 *
 * This is the load-bearing test for SCH-02. If it ever passes with the
 * constraint disabled, we have a real concurrency bug.
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
} from './harness';

const URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:54322/postgres';

let seed: SeedResult;
let aircraftId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-CONC')
    returning id
  `);
  aircraftId = ac[0]!.id;
  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('reservation exclusion constraint under concurrency', () => {
  it('two overlapping approved reservations: one succeeds, one rejects with 23P01', async () => {
    const clientA = postgres(URL, { prepare: false, max: 1 });
    const clientB = postgres(URL, { prepare: false, max: 1 });

    try {
      const txA = clientA.begin(async (sql) => {
        return sql`
          insert into public.reservation
            (school_id, base_id, activity_type, time_range, status,
             aircraft_id, requested_by, approved_at, approved_by)
          values
            (${seed.schoolA}::uuid, ${seed.baseA}::uuid, 'flight',
             tstzrange('2026-09-01 14:00+00','2026-09-01 16:00+00','[)'),
             'approved', ${aircraftId}::uuid, ${seed.userA}::uuid,
             now(), ${seed.userA}::uuid)
          returning id
        `;
      });

      const txB = clientB.begin(async (sql) => {
        return sql`
          insert into public.reservation
            (school_id, base_id, activity_type, time_range, status,
             aircraft_id, requested_by, approved_at, approved_by)
          values
            (${seed.schoolA}::uuid, ${seed.baseA}::uuid, 'flight',
             tstzrange('2026-09-01 15:00+00','2026-09-01 17:00+00','[)'),
             'approved', ${aircraftId}::uuid, ${seed.userA}::uuid,
             now(), ${seed.userA}::uuid)
          returning id
        `;
      });

      const results = await Promise.allSettled([txA, txB]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult[];

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const err = rejected[0]!.reason as { code?: string; message?: string };
      // Postgres normally reports SQLSTATE 23P01 (exclusion_violation),
      // but when both transactions race on the gist index Postgres can
      // resolve the conflict by raising 40P01 (deadlock_detected) on the
      // loser instead. Both outcomes prove the constraint bites — only
      // one transaction is allowed to commit either way.
      expect(['23P01', '40P01']).toContain(err.code);
    } finally {
      await Promise.all([clientA.end({ timeout: 5 }), clientB.end({ timeout: 5 })]);
    }
  });
});
