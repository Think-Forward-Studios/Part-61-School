/**
 * Phase 4 RLS + behavior tests for CAMP primitives.
 *
 * Covers:
 *   - Cross-tenant isolation for every new Phase 4 table
 *   - Hard-delete blocker on the safety-relevant tables
 *   - logbook_entry seal trigger rejects UPDATE on sealed=true
 *   - ad_compliance_history append-only RLS (INSERT ok, UPDATE/DELETE blocked)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUserOf, closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;

let aircraftA: string;
let aircraftB: string;
let maintenanceItemA: string;
let maintenanceItemB: string;
let adA: string;
let adB: string;
let adComplianceA: string;
let adComplianceB: string;
let adHistoryA: string;
let componentA: string;
let componentB: string;
let workOrderA: string;
let workOrderB: string;
let workOrderTaskA: string;
let workOrderTaskB: string;
let partA: string;
let partB: string;
let partLotA: string;
let partLotB: string;
let logbookEntryA: string;
let logbookEntryB: string;
let sealedLogbookEntryA: string;
let maintenanceOverrunA: string;
let maintenanceOverrunB: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Aircraft per school
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'N4A'),
      ('${seed.schoolB}', '${seed.baseB}', 'N4B')
    returning id
  `);
  aircraftA = ac[0]!.id;
  aircraftB = ac[1]!.id;

  // maintenance_item per school
  const mi = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.maintenance_item
      (school_id, base_id, aircraft_id, kind, title, interval_rule)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}',
       'hundred_hour_inspection', '100hr', '{"clock":"hobbs","hours":100}'::jsonb),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}',
       'hundred_hour_inspection', '100hr', '{"clock":"hobbs","hours":100}'::jsonb)
    returning id
  `);
  maintenanceItemA = mi[0]!.id;
  maintenanceItemB = mi[1]!.id;

  // airworthiness_directive per school
  const ad = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.airworthiness_directive
      (school_id, ad_number, title)
    values
      ('${seed.schoolA}', '2021-AAA-001', 'Test AD A'),
      ('${seed.schoolB}', '2021-BBB-001', 'Test AD B')
    returning id
  `);
  adA = ad[0]!.id;
  adB = ad[1]!.id;

  // aircraft_ad_compliance per school
  const adc = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_ad_compliance
      (school_id, base_id, aircraft_id, ad_id, applicable, status)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', '${adA}', true, 'current'),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', '${adB}', true, 'current')
    returning id
  `);
  adComplianceA = adc[0]!.id;
  adComplianceB = adc[1]!.id;

  // ad_compliance_history (one for school A so we can probe append-only)
  const adh = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.ad_compliance_history
      (compliance_record_id, school_id, signer_snapshot)
    values
      ('${adComplianceA}', '${seed.schoolA}',
       '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb)
    returning id
  `);
  adHistoryA = adh[0]!.id;

  // aircraft_component per school
  const cmp = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_component
      (school_id, base_id, aircraft_id, kind, life_limit_hours)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', 'magneto', 500),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', 'magneto', 500)
    returning id
  `);
  componentA = cmp[0]!.id;
  componentB = cmp[1]!.id;

  // work_order per school
  const wo = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.work_order
      (school_id, base_id, aircraft_id, kind, title)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', '100_hour', '100hr Inspection'),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', '100_hour', '100hr Inspection')
    returning id
  `);
  workOrderA = wo[0]!.id;
  workOrderB = wo[1]!.id;

  const wot = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.work_order_task
      (work_order_id, description, required_authority, position)
    values
      ('${workOrderA}', 'Inspect engine', 'a_and_p', 1),
      ('${workOrderB}', 'Inspect engine', 'a_and_p', 1)
    returning id
  `);
  workOrderTaskA = wot[0]!.id;
  workOrderTaskB = wot[1]!.id;

  // part + part_lot per school
  const pt = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.part
      (school_id, base_id, part_number, kind, unit, on_hand_qty)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'P-A-001', 'consumable', 'each', 10),
      ('${seed.schoolB}', '${seed.baseB}', 'P-B-001', 'consumable', 'each', 10)
    returning id
  `);
  partA = pt[0]!.id;
  partB = pt[1]!.id;

  const pl = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.part_lot
      (part_id, school_id, lot_number, received_qty, qty_remaining)
    values
      ('${partA}', '${seed.schoolA}', 'LOT-A', 10, 10),
      ('${partB}', '${seed.schoolB}', 'LOT-B', 10, 10)
    returning id
  `);
  partLotA = pl[0]!.id;
  partLotB = pl[1]!.id;

  // logbook_entry per school — one unsealed, plus a sealed one for the
  // seal-trigger test.
  const le = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.logbook_entry
      (school_id, base_id, aircraft_id, book_kind, entry_date, description)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}',
       'airframe', '2026-04-01', 'unsealed entry A'),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}',
       'airframe', '2026-04-01', 'unsealed entry B')
    returning id
  `);
  logbookEntryA = le[0]!.id;
  logbookEntryB = le[1]!.id;

  // Sealed entry — insert via session_replication_role=replica so the
  // BEFORE UPDATE trigger doesn't fire on this initial seal. Inserting
  // with sealed=true directly is permitted because the trigger only
  // fires on UPDATE.
  const sealed = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.logbook_entry
      (school_id, base_id, aircraft_id, book_kind, entry_date,
       description, signer_snapshot, signed_at, sealed)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}',
       'airframe', '2026-04-02', 'sealed entry A',
       '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb,
       now(), true)
    returning id
  `);
  sealedLogbookEntryA = sealed[0]!.id;

  // maintenance_overrun per school (each on its own item — note schoolB
  // overrun targets the schoolB item)
  const mo = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.maintenance_overrun
      (school_id, base_id, aircraft_id, item_id, justification,
       max_additional_hours, signer_snapshot, expires_at)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', '${maintenanceItemA}',
       'Need to ferry to maintenance base across the state',
       5, '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb,
       now() + interval '10 days'),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', '${maintenanceItemB}',
       'Need to ferry to maintenance base across the state',
       5, '{"user_id":"${seed.userB}","certificate_type":"ia"}'::jsonb,
       now() + interval '10 days')
    returning id
  `);
  maintenanceOverrunA = mo[0]!.id;
  maintenanceOverrunB = mo[1]!.id;

  await sql.unsafe(`set session_replication_role = origin`);

  // Touch unused so eslint stays happy
  void aircraftB;
  void adComplianceB;
  void componentB;
  void workOrderTaskB;
  void partLotB;
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Group 1: cross-tenant isolation per Phase 4 table
// ---------------------------------------------------------------------
describe('phase 4 cross-tenant isolation', () => {
  const checkInvisible = async (table: string, id: string) => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(`select id from public.${table} where id = '${id}'`),
    );
    expect(rows).toHaveLength(0);
  };

  it('user A cannot see school B maintenance_item', async () => {
    await checkInvisible('maintenance_item', maintenanceItemB);
  });
  it('user A cannot see school B airworthiness_directive', async () => {
    await checkInvisible('airworthiness_directive', adB);
  });
  it('user A cannot see school B aircraft_ad_compliance', async () => {
    await checkInvisible('aircraft_ad_compliance', adComplianceB);
  });
  it('user A cannot see school B aircraft_component', async () => {
    await checkInvisible('aircraft_component', componentB);
  });
  it('user A cannot see school B work_order', async () => {
    await checkInvisible('work_order', workOrderB);
  });
  it('user A cannot see school B work_order_task', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.work_order_task where id = '${workOrderTaskB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
  it('user A cannot see school B part', async () => {
    await checkInvisible('part', partB);
  });
  it('user A cannot see school B part_lot', async () => {
    await checkInvisible('part_lot', partLotB);
  });
  it('user A cannot see school B logbook_entry', async () => {
    await checkInvisible('logbook_entry', logbookEntryB);
  });
  it('user A cannot see school B maintenance_overrun', async () => {
    await checkInvisible('maintenance_overrun', maintenanceOverrunB);
  });

  it('user A CAN see their own maintenance_item (sanity)', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.maintenance_item where id = '${maintenanceItemA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
    void workOrderA;
    void partA;
    void componentA;
    void adA;
    void adComplianceA;
    void logbookEntryA;
    void maintenanceOverrunA;
    void workOrderTaskA;
  });
});

// ---------------------------------------------------------------------
// Group 2: hard-delete blocker
// ---------------------------------------------------------------------
describe('phase 4 hard-delete blocker', () => {
  it('cannot hard-delete a maintenance_item', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`delete from public.maintenance_item where id = '${maintenanceItemA}'`),
    ).rejects.toThrow(/Hard delete is not permitted/);
  });

  it('cannot hard-delete a work_order', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`delete from public.work_order where id = '${workOrderA}'`),
    ).rejects.toThrow(/Hard delete is not permitted/);
  });

  it('cannot hard-delete a part', async () => {
    const sql = dbAsAdmin();
    await expect(sql.unsafe(`delete from public.part where id = '${partA}'`)).rejects.toThrow(
      /Hard delete is not permitted/,
    );
  });

  it('cannot hard-delete a logbook_entry', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`delete from public.logbook_entry where id = '${logbookEntryA}'`),
    ).rejects.toThrow(/Hard delete is not permitted/);
  });
});

// ---------------------------------------------------------------------
// Group 3: logbook_entry seal trigger
// ---------------------------------------------------------------------
describe('logbook_entry seal trigger', () => {
  it('rejects UPDATE on a sealed entry', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(
        `update public.logbook_entry set description = 'tampered' where id = '${sealedLogbookEntryA}'`,
      ),
    ).rejects.toThrow(/sealed and cannot be modified/);
  });

  it('allows the unsealed -> sealed transition when signer fields are set', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`
      update public.logbook_entry
         set sealed = true,
             signer_snapshot = '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb,
             signed_at = now()
       where id = '${logbookEntryA}'
    `);
    // Verify
    const rows = await sql.unsafe<Array<{ sealed: boolean }>>(
      `select sealed from public.logbook_entry where id = '${logbookEntryA}'`,
    );
    expect(rows[0]!.sealed).toBe(true);
  });

  it('rejects sealing without signer_snapshot/signed_at', async () => {
    const sql = dbAsAdmin();
    // Insert a new unsealed entry first
    const r = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.logbook_entry
        (school_id, base_id, aircraft_id, book_kind, entry_date, description)
      values
        ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}',
         'airframe', '2026-04-03', 'unsealed for failed-seal test')
      returning id
    `);
    const id = r[0]!.id;
    await expect(
      sql.unsafe(`update public.logbook_entry set sealed = true where id = '${id}'`),
    ).rejects.toThrow(/requires signer_snapshot and signed_at/);
  });
});

// ---------------------------------------------------------------------
// Group 4: ad_compliance_history append-only
// ---------------------------------------------------------------------
describe('ad_compliance_history append-only', () => {
  it('user A can INSERT a history row in their own school', async () => {
    await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) => {
        await sql.unsafe(`
          insert into public.ad_compliance_history
            (compliance_record_id, school_id, signer_snapshot)
          values
            ('${adComplianceA}', '${seed.schoolA}',
             '{"user_id":"${seed.userA}","certificate_type":"ia"}'::jsonb)
        `);
      },
    );
  });

  it('user A cannot UPDATE a history row (RLS blocks)', async () => {
    const result = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) => {
        const r = await sql.unsafe<Array<{ id: string }>>(
          `update public.ad_compliance_history
              set notes = 'tampered'
            where id = '${adHistoryA}'
            returning id`,
        );
        return r;
      },
    );
    expect(result).toHaveLength(0);
  });

  it('user A cannot DELETE a history row (RLS blocks)', async () => {
    const result = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) => {
        const r = await sql.unsafe<Array<{ id: string }>>(
          `delete from public.ad_compliance_history
            where id = '${adHistoryA}'
            returning id`,
        );
        return r;
      },
    );
    expect(result).toHaveLength(0);
  });
});
