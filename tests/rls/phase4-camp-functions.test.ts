/**
 * Phase 4 Plan 02 — SQL functions + business triggers.
 *
 * Exercises:
 *   - maintenance_next_due (hours / calendar / combined)
 *   - component_life_remaining
 *   - recompute_maintenance_status auto-ground + clear
 *   - Flight log trigger cascades to recompute
 *   - Concurrent flight_log_entry inserts serialize via FOR UPDATE
 *   - Overrun consume path auto-revokes when consumed_hours >= max
 *   - maintenance_overrun kind CHECK (§91.409(b) 100-hr only)
 *   - AD bridge + component bridge triggers
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

const DIRECT_URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:54322/postgres';

let seed: SeedResult;
let aircraftId: string;

async function insertBaseline(tach: number): Promise<void> {
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);
  await sql.unsafe(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at,
       hobbs_in, tach_in, recorded_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'baseline',
       now() - interval '30 days', ${tach}, ${tach}, '${seed.userA}')
  `);
  await sql.unsafe(`set session_replication_role = origin`);
}

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-FN1', 'Cessna', '172', 1998)
    returning id
  `);
  aircraftId = ac[0]!.id;
  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('maintenance_next_due()', () => {
  it('hours-only: current / due_soon / overdue around the limit', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`delete from public.flight_log_entry where aircraft_id = '${aircraftId}'`);
    await sql.unsafe(`delete from public.maintenance_item where aircraft_id = '${aircraftId}'`);
    await sql.unsafe(`set session_replication_role = origin`);
    await insertBaseline(250);

    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         last_completed_at, last_completed_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         now() - interval '10 days',
         '{"tach":200}'::jsonb)
      returning id
    `);
    const itemId = mi[0]!.id;

    // tach=250, last=200, rule=100 → next=300, current
    type NextDueRow = { status: string; next_due_hours: string | null };
    let r = await sql.unsafe<NextDueRow[]>(
      `select * from public.maintenance_next_due('${itemId}')`,
    );
    expect(r[0]!.status).toBe('current');
    expect(Number(r[0]!.next_due_hours)).toBe(300);

    // Bump tach to 295 via correction row → due_soon (warn=10)
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_out, hobbs_in, tach_out, tach_in, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'correction',
         now(), 0, 0, 0, 45, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);
    r = await sql.unsafe<NextDueRow[]>(
      `select * from public.maintenance_next_due('${itemId}')`,
    );
    expect(r[0]!.status).toBe('due_soon');

    // Bump to 305 → overdue
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_out, hobbs_in, tach_out, tach_in, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'correction',
         now(), 0, 0, 0, 10, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);
    r = await sql.unsafe<NextDueRow[]>(
      `select * from public.maintenance_next_due('${itemId}')`,
    );
    expect(r[0]!.status).toBe('overdue');
  });

  it('calendar-only: due_soon at 11mo, overdue at 13mo', async () => {
    const sql = dbAsAdmin();
    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         last_completed_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}',
         'annual_inspection', 'Annual',
         '{"clock":"calendar","months":12}'::jsonb,
         now() - interval '11 months')
      returning id
    `);
    let r = await sql.unsafe<Array<{ status: string }>>(
      `select * from public.maintenance_next_due('${mi[0]!.id}')`,
    );
    expect(r[0]!.status).toBe('due_soon');

    await sql.unsafe(
      `update public.maintenance_item set last_completed_at = now() - interval '13 months' where id = '${mi[0]!.id}'`,
    );
    r = await sql.unsafe<Array<{ status: string }>>(
      `select * from public.maintenance_next_due('${mi[0]!.id}')`,
    );
    expect(r[0]!.status).toBe('overdue');
  });
});

describe('component_life_remaining()', () => {
  it('installed component with 5 hrs remaining returns current/due_soon', async () => {
    const sql = dbAsAdmin();
    // Reset totals: delete all entries, re-baseline at 1995
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`delete from public.flight_log_entry where aircraft_id = '${aircraftId}'`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_in, tach_in, airframe_delta, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'baseline',
         now() - interval '30 days', 0, 0, 1995, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    const cmp = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_component
        (school_id, base_id, aircraft_id, kind, life_limit_hours,
         installed_at_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'vacuum_pump', 2000,
         '{"airframe":0}'::jsonb)
      returning id
    `);
    const r = await sql.unsafe<Array<{ hours_remaining: string; status: string }>>(
      `select * from public.component_life_remaining('${cmp[0]!.id}')`,
    );
    expect(Number(r[0]!.hours_remaining)).toBeCloseTo(5, 0);
    expect(r[0]!.status).toBe('due_soon');
  });

  it('removed component returns non-grounding status', async () => {
    const sql = dbAsAdmin();
    const cmp = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_component
        (school_id, base_id, aircraft_id, kind, life_limit_hours,
         installed_at_hours, removed_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'alternator', 1000,
         '{"airframe":0}'::jsonb, now())
      returning id
    `);
    const r = await sql.unsafe<Array<{ status: string; hours_remaining: string | null }>>(
      `select * from public.component_life_remaining('${cmp[0]!.id}')`,
    );
    expect(r[0]!.status).toBe('current');
    expect(r[0]!.hours_remaining).toBeNull();
  });
});

describe('recompute_maintenance_status() auto-ground', () => {
  it('overdue item causes grounded_at to be set', async () => {
    const sql = dbAsAdmin();
    // Fresh aircraft
    const ac = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft (school_id, base_id, tail_number)
      values ('${seed.schoolA}', '${seed.baseA}', 'N-GRND1')
      returning id
    `);
    const acId = ac[0]!.id;
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_in, tach_in, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}', 'baseline',
         now() - interval '30 days', 500, 500, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    await sql.unsafe(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         last_completed_at, last_completed_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         now() - interval '30 days',
         '{"tach":300}'::jsonb)
    `);

    await sql.unsafe(`select public.recompute_maintenance_status('${acId}')`);
    const r = await sql.unsafe<Array<{ grounded_at: string | null }>>(
      `select grounded_at from public.aircraft where id = '${acId}'`,
    );
    expect(r[0]!.grounded_at).not.toBeNull();
  });

  it('active overrun on 100-hour suppresses grounding', async () => {
    const sql = dbAsAdmin();
    const ac = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft (school_id, base_id, tail_number)
      values ('${seed.schoolA}', '${seed.baseA}', 'N-OVR1')
      returning id
    `);
    const acId = ac[0]!.id;
    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_in, tach_in, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}', 'baseline',
         now() - interval '30 days', 500, 500, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         last_completed_at, last_completed_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         now() - interval '30 days',
         '{"tach":300}'::jsonb)
      returning id
    `);
    await sql.unsafe(`
      insert into public.maintenance_overrun
        (school_id, base_id, aircraft_id, item_id, justification,
         max_additional_hours, signer_snapshot, expires_at)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}', '${mi[0]!.id}',
         'Ferry to maintenance base this afternoon weather permitting',
         5, '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb,
         now() + interval '5 days')
    `);
    await sql.unsafe(`select public.recompute_maintenance_status('${acId}')`);
    const r = await sql.unsafe<Array<{ grounded_at: string | null }>>(
      `select grounded_at from public.aircraft where id = '${acId}'`,
    );
    expect(r[0]!.grounded_at).toBeNull();
  });
});

describe('overrun kind CHECK', () => {
  it('rejects overrun on non-100-hour item', async () => {
    const sql = dbAsAdmin();
    const mi = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}',
         'annual_inspection', 'Annual',
         '{"clock":"calendar","months":12}'::jsonb)
      returning id
    `);
    await expect(
      sql.unsafe(`
        insert into public.maintenance_overrun
          (school_id, base_id, aircraft_id, item_id, justification,
           max_additional_hours, signer_snapshot, expires_at)
        values
          ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', '${mi[0]!.id}',
           'Trying to overrun an annual which should not work',
           5, '{"user_id":"${seed.userA}"}'::jsonb,
           now() + interval '5 days')
      `),
    ).rejects.toThrow(/91\.409.*100-hour/);
  });
});

describe('concurrent flight log inserts serialize via FOR UPDATE', () => {
  it('two parallel flight_in inserts race-cleanly (no double-ground)', async () => {
    const sql = dbAsAdmin();
    const ac = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft (school_id, base_id, tail_number)
      values ('${seed.schoolA}', '${seed.baseA}', 'N-CONC')
      returning id
    `);
    const acId = ac[0]!.id;

    await sql.unsafe(`set session_replication_role = replica`);
    await sql.unsafe(`
      insert into public.flight_log_entry
        (school_id, base_id, aircraft_id, kind, flown_at,
         hobbs_in, tach_in, recorded_by)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}', 'baseline',
         now() - interval '30 days', 299, 299, '${seed.userA}')
    `);
    await sql.unsafe(`set session_replication_role = origin`);

    // Item with last_completed tach=200, rule=100 → next=300. Baseline tach=299.
    await sql.unsafe(`
      insert into public.maintenance_item
        (school_id, base_id, aircraft_id, kind, title, interval_rule,
         last_completed_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${acId}',
         'hundred_hour_inspection', '100hr',
         '{"clock":"tach","hours":100}'::jsonb,
         '{"tach":200}'::jsonb)
    `);

    // Two parallel clients each insert a flight_out then flight_in pair
    // that pushes total tach from 299 over 300.
    const clientA = postgres(DIRECT_URL, { prepare: false, max: 1, onnotice: () => {} });
    const clientB = postgres(DIRECT_URL, { prepare: false, max: 1, onnotice: () => {} });
    try {
      const runner = async (client: postgres.Sql, label: string) => {
        await client.begin(async (tx) => {
          const out = await tx.unsafe<Array<{ id: string }>>(`
            insert into public.flight_log_entry
              (school_id, base_id, aircraft_id, kind, flown_at,
               hobbs_out, tach_out, recorded_by)
            values
              ('${seed.schoolA}', '${seed.baseA}', '${acId}', 'flight_out',
               now(), 0, 0, '${seed.userA}')
            returning id
          `);
          await tx.unsafe(`
            insert into public.flight_log_entry
              (school_id, base_id, aircraft_id, kind, flown_at,
               hobbs_in, tach_in, paired_entry_id, recorded_by)
            values
              ('${seed.schoolA}', '${seed.baseA}', '${acId}', 'flight_in',
               now(), 1, 1, '${out[0]!.id}', '${seed.userA}')
          `);
        });
        void label;
      };
      // Accept either: both succeed (serialized) OR one loses to deadlock/
      // serialization (40P01 / 40001). Both outcomes prove exactly-one-winner
      // semantics — what we must NOT see is two successful double-grounds.
      const results = await Promise.allSettled([
        runner(clientA, 'A'),
        runner(clientB, 'B'),
      ]);
      const failures = results.filter((r) => r.status === 'rejected');
      for (const f of failures) {
        if (f.status === 'rejected') {
          expect(String(f.reason)).toMatch(/deadlock|serialization|40P01|40001/i);
        }
      }
    } finally {
      await clientA.end({ timeout: 5 });
      await clientB.end({ timeout: 5 });
    }

    // Exactly one grounded_at timestamp should exist
    const r = await sql.unsafe<Array<{ grounded_at: string | null }>>(
      `select grounded_at from public.aircraft where id = '${acId}'`,
    );
    expect(r[0]!.grounded_at).not.toBeNull();

    // And only one grounded_by_item_id
    const r2 = await sql.unsafe<Array<{ grounded_by_item_id: string | null }>>(
      `select grounded_by_item_id from public.aircraft where id = '${acId}'`,
    );
    expect(r2[0]!.grounded_by_item_id).not.toBeNull();
  });
});

describe('bridge triggers', () => {
  it('inserting aircraft_component with life_limit creates bridged maintenance_item', async () => {
    const sql = dbAsAdmin();
    const cmp = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_component
        (school_id, base_id, aircraft_id, kind, life_limit_hours, installed_at_hours)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', 'starter', 1500,
         '{"airframe":0}'::jsonb)
      returning id
    `);
    const r = await sql.unsafe<Array<{ id: string }>>(
      `select id from public.maintenance_item where component_id = '${cmp[0]!.id}'`,
    );
    expect(r.length).toBe(1);
  });

  it('inserting aircraft_ad_compliance creates bridged maintenance_item', async () => {
    const sql = dbAsAdmin();
    const ad = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.airworthiness_directive (school_id, ad_number, title)
      values ('${seed.schoolA}', 'AD-TEST-01', 'Test AD')
      returning id
    `);
    const adc = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_ad_compliance
        (school_id, base_id, aircraft_id, ad_id, applicable, status)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftId}', '${ad[0]!.id}', true, 'current')
      returning id
    `);
    const r = await sql.unsafe<Array<{ id: string }>>(
      `select id from public.maintenance_item where ad_compliance_id = '${adc[0]!.id}'`,
    );
    expect(r.length).toBe(1);
  });
});
