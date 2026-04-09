/**
 * Phase 4 plan 04-03 — CAMP tRPC router integration tests.
 *
 * Covers every ceremony contract: role gating, mechanic_authority
 * gating, historical signature integrity, work order sign-off,
 * concurrent parts consumption, AD fleet apply, overrun kind guard.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let aircraftC172Id: string;
let aircraftPA28Id: string;
let mechApId: string; // A&P only
let mechIaId: string; // IA
let studentId: string;
let instructorId: string;

const MECH_AP_CERT = '3000000111';
const MECH_IA_CERT = '3000000222';

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Two aircraft for AD applyToFleet test.
  const c172 = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-CAMP1', 'Cessna', '172', 2000)
    returning id
  `);
  aircraftC172Id = c172[0]!.id;
  const pa28 = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number, make, model, year)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-CAMP2', 'Piper', 'PA-28', 1998)
    returning id
  `);
  aircraftPA28Id = pa28[0]!.id;

  // Users: A&P mechanic, IA mechanic, student, instructor.
  const apId = '33333333-0000-0000-0000-000000000001';
  const iaId = '33333333-0000-0000-0000-000000000002';
  const stuId = '33333333-0000-0000-0000-000000000003';
  const instId = '33333333-0000-0000-0000-000000000004';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${apId}',  '${seed.schoolA}', 'ap@alpha.test',  'Alice AP'),
      ('${iaId}',  '${seed.schoolA}', 'ia@alpha.test',  'Ivy IA'),
      ('${stuId}', '${seed.schoolA}', 'stu@alpha.test', 'Sam Student'),
      ('${instId}','${seed.schoolA}', 'ins@alpha.test', 'Ian Instructor')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${apId}',  'mechanic',  'a_and_p', true),
      ('${iaId}',  'mechanic',  'ia',      true),
      ('${stuId}', 'student',   'none',    true),
      ('${instId}','instructor','none',    true)
  `);
  await sql.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, faa_airman_cert_number) values
      ('${apId}',  '${seed.schoolA}', 'Alice', 'AP', '${MECH_AP_CERT}'),
      ('${iaId}',  '${seed.schoolA}', 'Ivy',   'IA', '${MECH_IA_CERT}'),
      ('${stuId}', '${seed.schoolA}', 'Sam',   'Student', null),
      ('${instId}','${seed.schoolA}', 'Ian',   'Instructor', null)
  `);
  mechApId = apId;
  mechIaId = iaId;
  studentId = stuId;
  instructorId = instId;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

function adminAsA() {
  return adminCaller({ userId: seed.userA, schoolId: seed.schoolA, activeBaseId: seed.baseA });
}
function mechApCaller() {
  return adminCaller({
    userId: mechApId,
    schoolId: seed.schoolA,
    activeBaseId: seed.baseA,
    roles: ['mechanic'],
    activeRole: 'mechanic',
  });
}
function mechIaCaller() {
  return adminCaller({
    userId: mechIaId,
    schoolId: seed.schoolA,
    activeBaseId: seed.baseA,
    roles: ['mechanic'],
    activeRole: 'mechanic',
  });
}
function studentCaller() {
  return adminCaller({
    userId: studentId,
    schoolId: seed.schoolA,
    activeBaseId: seed.baseA,
    roles: ['student'],
    activeRole: 'student',
  });
}
function instructorCaller() {
  return adminCaller({
    userId: instructorId,
    schoolId: seed.schoolA,
    activeBaseId: seed.baseA,
    roles: ['instructor'],
    activeRole: 'instructor',
  });
}

describe('Phase 4 CAMP API — role gating', () => {
  it('rejects a student from admin.maintenance.create', async () => {
    const caller = studentCaller();
    await expect(
      caller.admin.maintenance.create({
        aircraftId: aircraftC172Id,
        kind: 'oil_change',
        title: 'Oil change 50h',
        intervalRule: { clock: 'hobbs', hours: 50 },
      }),
    ).rejects.toThrow(/Requires one of|FORBIDDEN/);
  });

  it('rejects an instructor from admin.squawks.triage', async () => {
    const ins = instructorCaller();
    // Open a squawk as admin first.
    const adminC = adminAsA();
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_squawk
        (school_id, base_id, aircraft_id, severity, title, opened_by)
      values ('${seed.schoolA}', '${seed.baseA}', '${aircraftC172Id}', 'watch', 'test squawk', '${seed.userA}')
      returning id
    `);
    const squawkId = rows[0]!.id;
    await expect(
      ins.admin.squawks.triage({ squawkId, action: 'in_work' }),
    ).rejects.toThrow(/Requires one of|FORBIDDEN/);
    // Clean up for later tests
    void adminC;
  });
});

describe('Phase 4 CAMP API — interval_rule validation', () => {
  it('rejects negative-hours interval_rule on maintenance.create', async () => {
    const caller = mechApCaller();
    await expect(
      caller.admin.maintenance.create({
        aircraftId: aircraftC172Id,
        kind: 'oil_change',
        title: 'Bad interval',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        intervalRule: { clock: 'hobbs', hours: -10 } as any,
      }),
    ).rejects.toThrow();
  });
});

describe('Phase 4 CAMP API — squawk lifecycle', () => {
  let squawkId: string;

  beforeAll(async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_squawk
        (school_id, base_id, aircraft_id, severity, title, opened_by)
      values ('${seed.schoolA}', '${seed.baseA}', '${aircraftC172Id}', 'grounding', 'RTS test', '${seed.userA}')
      returning id
    `);
    squawkId = rows[0]!.id;
  });

  it('A&P can triage → in_work → markFixed → returnToService', async () => {
    const ap = mechApCaller();
    const triaged = await ap.admin.squawks.triage({ squawkId, action: 'in_work' });
    expect(triaged.status).toBe('in_work');
    const fixed = await ap.admin.squawks.markFixed({ squawkId, notes: 'ok' });
    expect(fixed.status).toBe('fixed');
    const rts = await ap.admin.squawks.returnToService({ squawkId });
    expect(rts.status).toBe('returned_to_service');
    expect((rts.signer as { certificate_number: string }).certificate_number).toBe(MECH_AP_CERT);
  });

  it('historical signer snapshot integrity: mutating cert number leaves old signatures untouched', async () => {
    const sql = dbAsAdmin();
    // Mutate the A&P cert number.
    await sql.unsafe(`
      update public.person_profile
         set faa_airman_cert_number = '9999999999'
       where user_id = '${mechApId}'
    `);
    const rows = await sql.unsafe<Array<{ snap: { certificate_number: string } }>>(`
      select returned_to_service_signer_snapshot as snap
        from public.aircraft_squawk
       where id = '${squawkId}'
    `);
    expect(rows[0]!.snap.certificate_number).toBe(MECH_AP_CERT);
    // Restore.
    await sql.unsafe(`
      update public.person_profile
         set faa_airman_cert_number = '${MECH_AP_CERT}'
       where user_id = '${mechApId}'
    `);
  });
});

describe('Phase 4 CAMP API — overruns', () => {
  let hundredHourItemId: string;
  let annualItemId: string;

  beforeAll(async () => {
    const ia = mechIaCaller();
    const it1 = await ia.admin.maintenance.create({
      aircraftId: aircraftC172Id,
      kind: 'hundred_hour_inspection',
      title: '100-hour',
      intervalRule: { clock: 'tach', hours: 100 },
    });
    hundredHourItemId = it1.id;
    const it2 = await ia.admin.maintenance.create({
      aircraftId: aircraftC172Id,
      kind: 'annual_inspection',
      title: 'Annual',
      intervalRule: { clock: 'calendar', months: 12 },
    });
    annualItemId = it2.id;
  });

  it('A&P is rejected from overruns.grant (IA required)', async () => {
    const ap = mechApCaller();
    await expect(
      ap.admin.overruns.grant({
        itemId: hundredHourItemId,
        justification: 'Need to ferry aircraft to maintenance base',
        maxAdditionalHours: 5,
      }),
    ).rejects.toThrow(/IA authority/);
  });

  it('IA can grant on a 100-hour item', async () => {
    const ia = mechIaCaller();
    const grant = await ia.admin.overruns.grant({
      itemId: hundredHourItemId,
      justification: 'Ferry flight to maintenance base per 91.409(b)',
      maxAdditionalHours: 5,
    });
    expect(grant.maxAdditionalHours).toBe(5);
    expect((grant.signerSnapshot as { certificate_number: string }).certificate_number).toBe(MECH_IA_CERT);
  });

  it('IA is rejected from granting on an annual item (kind guard)', async () => {
    const ia = mechIaCaller();
    await expect(
      ia.admin.overruns.grant({
        itemId: annualItemId,
        justification: 'Try to overrun an annual which is forbidden',
        maxAdditionalHours: 5,
      }),
    ).rejects.toThrow();
  });
});

describe('Phase 4 CAMP API — AD applyToFleet', () => {
  it('applies a C172 AD to the C172 only, not the PA-28', async () => {
    const admin = adminAsA();
    const ad = await admin.admin.ads.create({
      adNumber: '2026-TEST-01',
      title: 'C172 spar inspection',
      applicability: { aircraft_make: 'Cessna', aircraft_model: '172' },
    });
    const result = await admin.admin.ads.applyToFleet({ adId: ad.id });
    expect(result.newComplianceRows).toBe(1);
    // Verify the PA-28 has no compliance row for this AD.
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ c: number }>>(`
      select count(*)::int as c
        from public.aircraft_ad_compliance
       where ad_id = '${ad.id}' and aircraft_id = '${aircraftPA28Id}'
    `);
    expect(rows[0]!.c).toBe(0);
  });
});

describe('Phase 4 CAMP API — parts consumption concurrency', () => {
  it('concurrent consumePart: exactly one succeeds on insufficient qty', async () => {
    const ap = mechApCaller();
    // Create part + lot with 7 qty, open a work order.
    const p = await ap.admin.parts.create({
      partNumber: 'OIL-FILTER-TEST',
      description: 'Test oil filter',
      kind: 'consumable',
      unit: 'each',
    });
    const lot = await ap.admin.parts.receiveLot({
      partId: p.id,
      lotNumber: 'LOT-1',
      receivedQty: 7,
    });
    const wo = await ap.admin.workOrders.create({
      aircraftId: aircraftC172Id,
      kind: 'oil_change',
      title: 'Oil change',
    });
    const results = await Promise.allSettled([
      ap.admin.workOrders.consumePart({
        workOrderId: wo.id,
        partId: p.id,
        partLotId: lot.id,
        quantity: 5,
      }),
      ap.admin.workOrders.consumePart({
        workOrderId: wo.id,
        partId: p.id,
        partLotId: lot.id,
        quantity: 5,
      }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(ok).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message ?? '').toMatch(/Insufficient/);
  });
});

describe('Phase 4 CAMP API — work order sign-off ceremony', () => {
  it('annual sign-off writes logbook entries for all three books', async () => {
    const ia = mechIaCaller();
    // Create a dedicated aircraft to avoid cross-test grounding state.
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);
    const acRows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft (school_id, base_id, tail_number, make, model)
      values ('${seed.schoolA}', '${seed.baseA}', 'N-CAMP3', 'Cessna', '172')
      returning id
    `);
    const acId = acRows[0]!.id;
    await sql.unsafe(`set session_replication_role = origin`);

    const wo = await ia.admin.workOrders.create({
      aircraftId: acId,
      kind: 'annual',
      title: 'Annual inspection 2026',
    });
    const task = await ia.admin.workOrders.addTask({
      workOrderId: wo.id,
      description: 'Perform annual inspection',
      kind: 'annual_inspection',
    });
    await ia.admin.workOrders.completeTask({ taskId: task.id });
    const result = await ia.admin.workOrders.signOff({
      workOrderId: wo.id,
      description: 'Annual inspection complete, returned to service',
      taskKinds: ['annual_inspection'],
    });
    expect(result.ok).toBe(true);
    const books = new Set(result.logbookEntries.map((e) => e.book));
    expect(books.has('airframe')).toBe(true);
    expect(books.has('engine')).toBe(true);
    expect(books.has('prop')).toBe(true);

    // Verify DB: 3 sealed entries
    const rows = await sql.unsafe<Array<{ book_kind: string; sealed: boolean }>>(`
      select book_kind, sealed from public.logbook_entry where work_order_id = '${wo.id}'
    `);
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.sealed).toBe(true);
  });
});
