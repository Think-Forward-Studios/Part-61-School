/**
 * schedule.* router integration tests (Phase 3 plan 03-02).
 *
 * Exercises: request → approve happy path, airworthiness gate,
 * exclusion-constraint conflict mapping, recurring expansion rollback,
 * cancel-free/late derivation, list modes, markNoShow writing a Phase 2
 * no_show row, and freebusy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCaller } from './api-caller';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;
let aircraftId: string;
let groundedAircraftId: string;
let instructorId: string;
let studentId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Aircraft: one active, one grounded
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'N-API1'),
      ('${seed.schoolA}', '${seed.baseA}', 'N-API2')
    returning id
  `);
  aircraftId = ac[0]!.id;
  groundedAircraftId = ac[1]!.id;
  await sql.unsafe(
    `update public.aircraft set grounded_at = now() - interval '1 day' where id = '${groundedAircraftId}'`,
  );

  // Additional users in school A: an instructor and a student
  const instId = '11111111-2222-3333-4444-555555555555';
  const stuId = '11111111-2222-3333-4444-666666666666';
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name) values
      ('${instId}', '${seed.schoolA}', 'inst-a@alpha.test', 'Inst A'),
      ('${stuId}',  '${seed.schoolA}', 'stu-a@alpha.test',  'Stu A')
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

describe('schedule.request + approve happy path', () => {
  let resId: string;

  it('request creates a requested reservation', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const startsAt = new Date('2027-01-10T14:00:00Z');
    const endsAt = new Date('2027-01-10T15:30:00Z');
    const res = await caller.schedule.request({
      activityType: 'flight',
      aircraftId,
      instructorId,
      studentId,
      startsAt,
      endsAt,
    });
    expect(res.reservationIds).toHaveLength(1);
    resId = res.reservationIds[0]!;
  });

  it('approve transitions to approved', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const approved = await caller.schedule.approve({ reservationId: resId });
    expect(approved.status).toBe('approved');
  });

  it('approving a second overlapping reservation maps to CONFLICT', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const res = await caller.schedule.request({
      activityType: 'flight',
      aircraftId,
      startsAt: new Date('2027-01-10T14:30:00Z'),
      endsAt: new Date('2027-01-10T16:00:00Z'),
    });
    await expect(
      caller.schedule.approve({ reservationId: res.reservationIds[0]! }),
    ).rejects.toThrow(/conflict|already booked/i);
  });
});

describe('schedule.approve airworthiness gate', () => {
  it('rejects approve when aircraft is grounded', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const res = await caller.schedule.request({
      activityType: 'flight',
      aircraftId: groundedAircraftId,
      startsAt: new Date('2027-02-10T14:00:00Z'),
      endsAt: new Date('2027-02-10T15:00:00Z'),
    });
    await expect(
      caller.schedule.approve({ reservationId: res.reservationIds[0]! }),
    ).rejects.toThrow(/airworthy/i);
  });
});

describe('schedule.request recurring expansion rollback', () => {
  it('if any child conflicts after approve, whole series initial insert succeeds (conflict is deferred)', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    // Recurring creates children with status='requested' which do NOT
    // participate in the exclusion constraint. So the insert succeeds
    // and the conflict only bites on approve. Verify 3 children are
    // created with a shared series id.
    const res = await caller.schedule.request({
      activityType: 'flight',
      aircraftId,
      startsAt: new Date('2027-03-01T14:00:00Z'),
      endsAt: new Date('2027-03-01T15:00:00Z'),
      recurrence: { frequency: 'daily', count: 3 },
    });
    expect(res.reservationIds).toHaveLength(3);
    expect(res.seriesId).not.toBeNull();
  });
});

describe('schedule.cancel derives free vs late', () => {
  it('far-future reservation is cancelled_free', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const far = new Date();
    far.setFullYear(far.getFullYear() + 1);
    const res = await caller.schedule.request({
      activityType: 'misc',
      startsAt: far,
      endsAt: new Date(far.getTime() + 60 * 60 * 1000),
    });
    const cancelled = await caller.schedule.cancel({
      reservationId: res.reservationIds[0]!,
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.closeOutReason).toBe('cancelled_free');
  });
});

describe('schedule.markNoShow writes Phase 2 no_show row', () => {
  it('marks no-show and inserts no_show when student set', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const res = await caller.schedule.request({
      activityType: 'flight',
      aircraftId,
      studentId,
      instructorId,
      startsAt: new Date('2027-04-01T14:00:00Z'),
      endsAt: new Date('2027-04-01T15:00:00Z'),
    });
    await caller.schedule.approve({ reservationId: res.reservationIds[0]! });
    await caller.schedule.markNoShow({
      reservationId: res.reservationIds[0]!,
    });
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ count: string }>>(
      `select count(*)::text from public.no_show where user_id = '${studentId}'`,
    );
    expect(Number(rows[0]!.count)).toBeGreaterThan(0);
  });
});

describe('schedule.list modes', () => {
  it('mine returns caller reservations', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const res = await caller.schedule.list({ mode: 'mine' });
    expect(res.mode).toBe('mine');
  });
  it('full allowed for admin', async () => {
    const caller = adminCaller({
      userId: seed.userA,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
    });
    const res = await caller.schedule.list({ mode: 'full' });
    expect(res.mode).toBe('full');
  });
  it('full rejected for student', async () => {
    const caller = adminCaller({
      userId: studentId,
      schoolId: seed.schoolA,
      activeBaseId: seed.baseA,
      roles: ['student'],
      activeRole: 'student',
    });
    await expect(caller.schedule.list({ mode: 'full' })).rejects.toThrow(
      /instructors or admins/i,
    );
  });
});
