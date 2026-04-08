/**
 * Phase 2 RLS: aircraft + append-only flight log.
 *
 * Seeds an aircraft, engine, equipment tag, baseline + one flight row
 * for each school. Verifies cross-tenant isolation AND the append-only
 * contract on flight_log_entry:
 *   - UPDATE of another school's row → 0 rows affected (RLS hides it)
 *   - DELETE of own row → hard-delete trigger raises
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

interface Phase2AircraftFixture {
  aircraftA: string;
  aircraftB: string;
  engineA: string;
  engineB: string;
  baselineA: string;
  baselineB: string;
  flightA: string;
  flightB: string;
}

let seed: SeedResult;
let fixture: Phase2AircraftFixture;

async function seedPhase2Aircraft(
  sql: Sql,
  s: SeedResult,
): Promise<Phase2AircraftFixture> {
  await sql.unsafe(`set session_replication_role = replica`);

  const [aircraftARow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${s.schoolA}', '${s.baseA}', 'N12345', 'Cessna', '172', 2005)
    returning id
  `);
  const [aircraftBRow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${s.schoolB}', '${s.baseB}', 'N54321', 'Cessna', '172', 2005)
    returning id
  `);
  const aircraftA = aircraftARow!.id;
  const aircraftB = aircraftBRow!.id;

  const [engineARow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_engine (aircraft_id, position, serial_number)
    values ('${aircraftA}', 'single', 'ENG-A')
    returning id
  `);
  const [engineBRow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_engine (aircraft_id, position, serial_number)
    values ('${aircraftB}', 'single', 'ENG-B')
    returning id
  `);
  const engineA = engineARow!.id;
  const engineB = engineBRow!.id;

  await sql.unsafe(`
    insert into public.aircraft_equipment (aircraft_id, tag) values
      ('${aircraftA}', 'ifr_equipped'),
      ('${aircraftB}', 'ifr_equipped')
  `);

  // baseline rows
  const [baselineARow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_in, tach_in, airframe_delta, recorded_by)
    values
      ('${s.schoolA}', '${s.baseA}', '${aircraftA}', 'baseline', now() - interval '30 days', 1000.0, 900.0, 0, '${s.userA}')
    returning id
  `);
  const [baselineBRow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_in, tach_in, airframe_delta, recorded_by)
    values
      ('${s.schoolB}', '${s.baseB}', '${aircraftB}', 'baseline', now() - interval '30 days', 500.0, 400.0, 0, '${s.userB}')
    returning id
  `);

  // flight rows
  const [flightARow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_out, hobbs_in, tach_out, tach_in, airframe_delta, recorded_by)
    values
      ('${s.schoolA}', '${s.baseA}', '${aircraftA}', 'flight', now() - interval '1 day', 1000.0, 1001.5, 900.0, 901.4, 1.5, '${s.userA}')
    returning id
  `);
  const [flightBRow] = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at, hobbs_out, hobbs_in, tach_out, tach_in, airframe_delta, recorded_by)
    values
      ('${s.schoolB}', '${s.baseB}', '${aircraftB}', 'flight', now() - interval '1 day', 500.0, 502.0, 400.0, 401.8, 2.0, '${s.userB}')
    returning id
  `);

  await sql.unsafe(`
    insert into public.flight_log_entry_engine (flight_log_entry_id, engine_id, delta_hours) values
      ('${flightARow!.id}', '${engineA}', 1.5),
      ('${flightBRow!.id}', '${engineB}', 2.0)
  `);

  await sql.unsafe(`set session_replication_role = origin`);

  return {
    aircraftA,
    aircraftB,
    engineA,
    engineB,
    baselineA: baselineARow!.id,
    baselineB: baselineBRow!.id,
    flightA: flightARow!.id,
    flightB: flightBRow!.id,
  };
}

beforeAll(async () => {
  seed = await seedTwoSchools();
  fixture = await seedPhase2Aircraft(dbAsAdmin(), seed);
});

afterAll(async () => {
  await closeAdmin();
});

describe('phase 2 aircraft cross-tenant isolation', () => {
  it('user A sees only their own aircraft', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string; school_id: string }>>(
          `select id, school_id from public.aircraft`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.school_id).toBe(seed.schoolA);
    expect(rows[0]!.id).toBe(fixture.aircraftA);
  });

  it('user A sees only their own aircraft_engine rows', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.aircraft_engine`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(fixture.engineA);
  });

  it('user A sees only their own aircraft_equipment rows', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ aircraft_id: string }>>(
          `select aircraft_id from public.aircraft_equipment`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.aircraft_id).toBe(fixture.aircraftA);
  });

  it('user A sees only their own flight_log_entry rows (both baseline and flight)', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ school_id: string }>>(
          `select school_id from public.flight_log_entry`,
        ),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.school_id).toBe(seed.schoolA);
    }
  });
});

describe('phase 2 flight_log_entry append-only contract', () => {
  it('UPDATE of a cross-tenant row affects 0 rows (RLS hides)', async () => {
    const result = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `update public.flight_log_entry set notes = 'tampered' where id = '${fixture.flightB}' returning id`,
        ),
    );
    expect(result).toHaveLength(0);
  });

  it('DELETE of own row is blocked by hard-delete trigger', async () => {
    const sql = dbAsAdmin();
    // Admin direct delete attempt — trigger runs for everyone.
    await expect(
      sql.unsafe(
        `delete from public.flight_log_entry where id = '${fixture.flightA}'`,
      ),
    ).rejects.toThrow(/hard delete/i);
  });
});
