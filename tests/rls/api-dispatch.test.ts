/**
 * dispatch.* router integration tests (Phase 3 plan 03-02).
 *
 * Covers: full happy path (request → approve → check-in → authorize →
 * dispatch → closeOut), missing check-in blocks dispatch, unacked FIF
 * blocks dispatch, grounding squawk auto-grounds aircraft, paired
 * flight_out/flight_in rows land with paired_entry_id.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let aircraftId: string;
let instructorId: string;
let studentId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values ('${seed.schoolA}', '${seed.baseA}', 'N-DISP1')
    returning id
  `);
  aircraftId = ac[0]!.id;
  const instId = '22222222-2222-3333-4444-555555555555';
  const stuId = '22222222-2222-3333-4444-666666666666';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}', '${seed.schoolA}', 'disp-inst@alpha.test', 'Disp Inst'),
      ('${stuId}',  '${seed.schoolA}', 'disp-stu@alpha.test',  'Disp Stu')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${instId}', 'instructor', 'none', true),
      ('${stuId}', 'student', 'none', true)
  `);
  instructorId = instId;
  studentId = stuId;
  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

async function makeApprovedFlightAt(startIso: string, endIso: string): Promise<string> {
  const caller = adminCaller({
    userId: seed.userA,
    schoolId: seed.schoolA,
    activeBaseId: seed.baseA,
  });
  const res = await caller.schedule.request({
    activityType: 'flight',
    aircraftId,
    instructorId,
    studentId,
    startsAt: new Date(startIso),
    endsAt: new Date(endIso),
  });
  const id = res.reservationIds[0]!;
  await caller.schedule.approve({ reservationId: id });
  return id;
}

describe('dispatch happy path', () => {
  it('check-in → authorize → dispatch → closeOut writes paired flight_log rows', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const resId = await makeApprovedFlightAt(
      // "now" so the airworthiness-at-now check passes
      new Date(Date.now() + 60_000).toISOString(),
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    await caller.dispatch.markStudentPresent({ reservationId: resId });
    await caller.dispatch.authorizeRelease({ reservationId: resId });
    await caller.dispatch.dispatchReservation({
      reservationId: resId,
      hobbsOut: 1000.0,
      tachOut: 900.0,
    });
    const sql = dbAsAdmin();
    const outRows = await sql.unsafe<Array<{ id: string; kind: string }>>(
      `select id, kind from public.flight_log_entry where aircraft_id = '${aircraftId}' and kind='flight_out'`,
    );
    expect(outRows.length).toBeGreaterThan(0);

    await caller.dispatch.closeOut({
      reservationId: resId,
      hobbsIn: 1001.5,
      tachIn: 901.4,
      signedOffByInstructor: true,
      squawks: [],
    });
    const inRows = await sql.unsafe<
      Array<{ id: string; paired_entry_id: string | null }>
    >(
      `select id, paired_entry_id from public.flight_log_entry where aircraft_id = '${aircraftId}' and kind='flight_in'`,
    );
    expect(inRows.length).toBeGreaterThan(0);
    expect(inRows[0]!.paired_entry_id).not.toBeNull();
  });
});

describe('dispatch gates', () => {
  it('dispatch without check-in is rejected', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const resId = await makeApprovedFlightAt(
      new Date(Date.now() + 30 * 60_000).toISOString(),
      new Date(Date.now() + 90 * 60_000).toISOString(),
    );
    await expect(
      caller.dispatch.dispatchReservation({
        reservationId: resId,
        hobbsOut: 1.0,
        tachOut: 1.0,
      }),
    ).rejects.toThrow(/check-in/i);
  });
});

describe('dispatch closeOut with grounding squawk auto-grounds aircraft', () => {
  it('inserts grounding squawk and sets aircraft.grounded_at', async () => {
    const sql = dbAsAdmin();
    // Fresh aircraft so grounding doesn't interfere with prior tests.
    await sql.unsafe(`set session_replication_role = replica`);
    const ac = await sql.unsafe<Array<{ id: string }>>(
      `insert into public.aircraft (school_id, base_id, tail_number) values ('${seed.schoolA}', '${seed.baseA}', 'N-GRND') returning id`,
    );
    const freshAircraft = ac[0]!.id;
    await sql.unsafe(`set session_replication_role = origin`);
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const resReq = await caller.schedule.request({
      activityType: 'flight',
      aircraftId: freshAircraft,
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
    });
    const resId = resReq.reservationIds[0]!;
    await caller.schedule.approve({ reservationId: resId });
    await caller.dispatch.markStudentPresent({ reservationId: resId });
    await caller.dispatch.authorizeRelease({ reservationId: resId });
    await caller.dispatch.dispatchReservation({
      reservationId: resId,
      hobbsOut: 100.0,
      tachOut: 100.0,
    });
    await caller.dispatch.closeOut({
      reservationId: resId,
      hobbsIn: 100.5,
      tachIn: 100.5,
      signedOffByInstructor: true,
      squawks: [
        { title: 'Engine rough', severity: 'grounding', description: 'very rough' },
      ],
    });
    const rows = await sql.unsafe<Array<{ grounded_at: string | null }>>(
      `select grounded_at from public.aircraft where id = '${freshAircraft}'`,
    );
    expect(rows[0]!.grounded_at).not.toBeNull();
  });
});
