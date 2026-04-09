/**
 * Phase 4 Plan 02 — is_airworthy_at body replacement tests.
 *
 * Signature is frozen; these tests exercise each new short-circuit rule
 * against a fresh per-fixture aircraft so seeds don't cross-contaminate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;

async function mkAircraft(tail: string): Promise<string> {
  const sql = dbAsAdmin();
  const r = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', '${tail}')
    returning id
  `);
  return r[0]!.id;
}

async function isAirworthy(id: string): Promise<boolean> {
  const sql = dbAsAdmin();
  const r = await sql.unsafe<Array<{ result: boolean }>>(
    `select public.is_airworthy_at('${id}', now()) as result`,
  );
  return r[0]!.result;
}

beforeAll(async () => {
  seed = await seedTwoSchools();
});

afterAll(async () => {
  await closeAdmin();
});

describe('is_airworthy_at — new body rules', () => {
  it('1. plain aircraft with no maintenance is airworthy', async () => {
    const id = await mkAircraft('N-PLAIN');
    expect(await isAirworthy(id)).toBe(true);
  });

  it('2. grounded aircraft returns false', async () => {
    const id = await mkAircraft('N-GROUND2');
    const sql = dbAsAdmin();
    await sql.unsafe(
      `update public.aircraft set grounded_at = now() - interval '1 hour' where id = '${id}'`,
    );
    expect(await isAirworthy(id)).toBe(false);
  });

  it('3. open grounding squawk -> false; RTS -> true', async () => {
    const id = await mkAircraft('N-SQK2');
    const sql = dbAsAdmin();
    const sq = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_squawk
        (school_id, base_id, aircraft_id, severity, title, opened_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}', 'grounding', 'bad mag', now() - interval '1 hour')
      returning id
    `);
    expect(await isAirworthy(id)).toBe(false);
    await sql.unsafe(
      `update public.aircraft_squawk set resolved_at = now() where id = '${sq[0]!.id}'`,
    );
    expect(await isAirworthy(id)).toBe(true);
  });

  it('4. overdue maintenance item -> false', async () => {
    const id = await mkAircraft('N-OD');
    const sql = dbAsAdmin();
    await sql.unsafe(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         status, last_completed_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         'overdue', now() - interval '10 days')
    `);
    expect(await isAirworthy(id)).toBe(false);
  });

  it('5. overdue 100-hr item with active overrun -> true', async () => {
    const id = await mkAircraft('N-OVR2');
    const sql = dbAsAdmin();
    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         status, last_completed_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         'overdue', now() - interval '10 days')
      returning id
    `);
    await sql.unsafe(`
      insert into public.maintenance_overrun
        (school_id, base_id, aircraft_id, item_id, justification,
         max_additional_hours, signer_snapshot, expires_at, granted_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}', '${mi[0]!.id}',
         'Ferry to maintenance base via short planned route',
         5, '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb,
         now() + interval '5 days', now() - interval '1 hour')
    `);
    expect(await isAirworthy(id)).toBe(true);
  });

  it('6. overrun with consumed_hours >= max -> false', async () => {
    const id = await mkAircraft('N-OVR3');
    const sql = dbAsAdmin();
    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         status, last_completed_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         'overdue', now() - interval '10 days')
      returning id
    `);
    await sql.unsafe(`
      insert into public.maintenance_overrun
        (school_id, base_id, aircraft_id, item_id, justification,
         max_additional_hours, consumed_hours, signer_snapshot, expires_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}', '${mi[0]!.id}',
         'Ferry but we already burned all ten hours of the overrun',
         5, 5, '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb,
         now() + interval '5 days')
    `);
    expect(await isAirworthy(id)).toBe(false);
  });

  it('7. overrun on non-100-hour item rejected at insert', async () => {
    const id = await mkAircraft('N-OVR4');
    const sql = dbAsAdmin();
    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule, status)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}',
         'annual_inspection', 'Annual',
         '{"clock":"calendar","months":12}'::jsonb, 'overdue')
      returning id
    `);
    await expect(
      sql.unsafe(`
        insert into public.maintenance_overrun
          (school_id, base_id, aircraft_id, item_id, justification,
           max_additional_hours, signer_snapshot, expires_at)
        values
          ('${seed.schoolA}', '${seed.baseA}', '${id}', '${mi[0]!.id}',
           'Nope, should not be allowed because annual is not 100-hour',
           5, '{"user_id":"${seed.userA}"}'::jsonb, now() + interval '5 days')
      `),
    ).rejects.toThrow(/91\.409.*100-hour/);
  });

  it('8. overdue AD compliance -> false', async () => {
    const id = await mkAircraft('N-AD2');
    const sql = dbAsAdmin();
    const ad = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.airworthiness_directive (school_id, ad_number, title)
      values ('${seed.schoolA}', 'AD-IAW-01', 'Test')
      returning id
    `);
    await sql.unsafe(`
      insert into public.aircraft_ad_compliance
        (school_id, base_id, aircraft_id, ad_id, applicable, status, first_due_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}', '${ad[0]!.id}', true,
         'overdue', now() - interval '2 days')
    `);
    expect(await isAirworthy(id)).toBe(false);
  });

  it('9. component with zero life remaining -> false', async () => {
    const id = await mkAircraft('N-CMP2');
    const sql = dbAsAdmin();
    // Baseline airframe at 3000 so a component installed_at=0 with
    // life_limit_hours=2000 is at -1000 remaining.
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_in, tach_in, airframe_delta, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}', 'baseline',
         now() - interval '30 days', 0, 0, 3000, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);
    await sql.unsafe(`
      insert into public.aircraft_component
        (school_id, base_id, aircraft_id, kind, life_limit_hours, installed_at_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${id}', 'magneto', 2000, '{"airframe":0}'::jsonb)
    `);
    expect(await isAirworthy(id)).toBe(false);
  });
});

describe('is_airworthy_at — Phase 3 contract preservation', () => {
  it('aircraft with grounded_at + open grounding squawk still returns false (old stub semantics)', async () => {
    const id = await mkAircraft('N-STUB1');
    const sql = dbAsAdmin();
    await sql.unsafe(
      `update public.aircraft set grounded_at = now() - interval '1 day' where id = '${id}'`,
    );
    expect(await isAirworthy(id)).toBe(false);
  });

  it('plain active aircraft with no maintenance returns true (old stub semantics)', async () => {
    const id = await mkAircraft('N-STUB2');
    expect(await isAirworthy(id)).toBe(true);
  });
});
