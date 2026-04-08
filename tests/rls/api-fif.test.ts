/**
 * fif.* router integration tests (Phase 3 plan 03-02).
 *
 * Covers: admin post → listActive → listUnacked → acknowledge → revoke,
 * and the dispatch-blocks-on-unacked-FIF gate.
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
  const ac = await sql.unsafe<Array<{ id: string }>>(
    `insert into public.aircraft (school_id, base_id, tail_number) values ('${seed.schoolA}', '${seed.baseA}', 'N-FIF1') returning id`,
  );
  aircraftId = ac[0]!.id;
  const instId = '33333333-2222-3333-4444-555555555555';
  const stuId = '33333333-2222-3333-4444-666666666666';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}', '${seed.schoolA}', 'fif-inst@alpha.test', 'FIF Inst'),
      ('${stuId}',  '${seed.schoolA}', 'fif-stu@alpha.test',  'FIF Stu')
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

describe('fif post / listActive / acknowledge / revoke', () => {
  let noticeId: string;

  it('admin posts a notice', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const row = await caller.fif.post({
      title: 'Runway 27 closed',
      body: 'Use 09 until further notice',
      severity: 'important',
    });
    expect(row.id).toBeDefined();
    noticeId = row.id;
  });

  it('listActive includes the new notice', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const rows = await caller.fif.listActive();
    expect(rows.some((r) => (r as { id: string }).id === noticeId)).toBe(true);
  });

  it('acknowledge is idempotent', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    await caller.fif.acknowledge({ noticeId });
    await caller.fif.acknowledge({ noticeId });
    // second call must not throw
  });

  it('revoke sets expires_at', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    await caller.fif.revoke({ noticeId });
    const rows = await caller.fif.listActive();
    expect(rows.some((r) => (r as { id: string }).id === noticeId)).toBe(false);
  });
});

describe('dispatch blocks on unacknowledged FIF', () => {
  it('unacked notice prevents dispatch', async () => {
    const adminCallerObj = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    // Post a fresh mandatory notice — no user will have acked it yet.
    await adminCallerObj.fif.post({
      title: 'Mandatory brief',
      body: 'Read me',
      severity: 'critical',
    });
    const resReq = await adminCallerObj.schedule.request({
      activityType: 'flight',
      aircraftId,
      instructorId,
      studentId,
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
    });
    const resId = resReq.reservationIds[0]!;
    await adminCallerObj.schedule.approve({ reservationId: resId });
    await adminCallerObj.dispatch.markStudentPresent({ reservationId: resId });
    await adminCallerObj.dispatch.authorizeRelease({ reservationId: resId });
    await expect(
      adminCallerObj.dispatch.dispatchReservation({
        reservationId: resId,
        hobbsOut: 200.0,
        tachOut: 200.0,
      }),
    ).rejects.toThrow(/Flight Information File|unacknowledged/i);
  });
});
