/**
 * Phase 2 RLS: derived-totals views.
 *
 * CRITICAL (Pitfall 2): Postgres views default to owner-invoked, which
 * silently bypasses RLS on the base table. Both aircraft_current_totals
 * and aircraft_engine_current_totals must be created WITH
 * (security_invoker = true). Pitfall 9: we must seed BOTH schools with
 * data so the cross-tenant assertion isn't vacuous.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
} from './harness';

interface Fixture {
  aircraftA: string;
  aircraftB: string;
  engineA: string;
  engineB: string;
}

let seed: SeedResult;
let fixture: Fixture;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  const [a] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N1000A') returning id
  `);
  const [b] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolB}', '${seed.baseB}', 'N2000B') returning id
  `);
  const aircraftA = a!.id;
  const aircraftB = b!.id;

  const [ea] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_engine (aircraft_id, position, serial_number)
    values ('${aircraftA}', 'single', 'EA') returning id
  `);
  const [eb] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_engine (aircraft_id, position, serial_number)
    values ('${aircraftB}', 'single', 'EB') returning id
  `);
  const engineA = ea!.id;
  const engineB = eb!.id;

  // Baselines
  await sql.unsafe(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_in, tach_in, airframe_delta, recorded_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', 'baseline', now() - interval '90 days', 1000.0, 900.0, 0, '${seed.userA}'),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', 'baseline', now() - interval '90 days', 2000.0, 1800.0, 0, '${seed.userB}')
  `);
  // Flight rows
  const [fa] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_out, hobbs_in, tach_out, tach_in, airframe_delta, recorded_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', 'flight', now() - interval '2 days', 1000.0, 1001.5, 900.0, 901.4, 1.5, '${seed.userA}')
    returning id
  `);
  const [fb] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_out, hobbs_in, tach_out, tach_in, airframe_delta, recorded_by)
    values
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', 'flight', now() - interval '2 days', 2000.0, 2003.0, 1800.0, 1802.8, 3.0, '${seed.userB}')
    returning id
  `);

  await sql.unsafe(`
    insert into public.flight_log_entry_engine (flight_log_entry_id, engine_id, delta_hours) values
      ('${fa!.id}', '${engineA}', 1.5),
      ('${fb!.id}', '${engineB}', 3.0)
  `);

  await sql.unsafe(`set session_replication_role = origin`);

  fixture = { aircraftA, aircraftB, engineA, engineB };
});

afterAll(async () => {
  await closeAdmin();
});

describe('aircraft_current_totals view (security_invoker)', () => {
  it('user A sees exactly one row for their own aircraft', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<
          Array<{
            aircraft_id: string;
            school_id: string;
            current_hobbs: string;
          }>
        >(`select aircraft_id, school_id, current_hobbs from public.aircraft_current_totals`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.aircraft_id).toBe(fixture.aircraftA);
    expect(rows[0]!.school_id).toBe(seed.schoolA);
    // baseline 1000.0 + (1001.5 - 1000.0) = 1001.5
    expect(Number(rows[0]!.current_hobbs)).toBeCloseTo(1001.5, 1);
  });

  it('user A sees ZERO rows for school B aircraft ids', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ aircraft_id: string }>>(
          `select aircraft_id from public.aircraft_current_totals where aircraft_id = '${fixture.aircraftB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user B sees exactly one row for their own aircraft', async () => {
    const rows = await asUserOf(
      { userId: seed.userB, schoolId: seed.schoolB, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ aircraft_id: string; school_id: string }>>(
          `select aircraft_id, school_id from public.aircraft_current_totals`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.school_id).toBe(seed.schoolB);
  });
});

describe('aircraft_engine_current_totals view (security_invoker)', () => {
  it('user A sees exactly one engine totals row', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<
          Array<{
            engine_id: string;
            school_id: string;
            current_engine_hours: string;
          }>
        >(`select engine_id, school_id, current_engine_hours from public.aircraft_engine_current_totals`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.engine_id).toBe(fixture.engineA);
    expect(rows[0]!.school_id).toBe(seed.schoolA);
    expect(Number(rows[0]!.current_engine_hours)).toBeCloseTo(1.5, 1);
  });

  it('user A sees ZERO engine rows for school B', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ engine_id: string }>>(
          `select engine_id from public.aircraft_engine_current_totals where engine_id = '${fixture.engineB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
});
