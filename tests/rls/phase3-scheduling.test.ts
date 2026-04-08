/**
 * Phase 3 RLS + behavior tests for scheduling/dispatch primitives.
 *
 * Covers:
 *   - Cross-tenant isolation for every new Phase 3 table
 *   - is_airworthy_at() for active / grounded / open-grounding-squawk
 *   - person_unavailability shadow-row trigger
 *   - aircraft_current_totals view handles paired flight_out/flight_in
 *   - reservation exclusion constraint rejects an overlapping insert
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
} from './harness';

let seed: SeedResult;

// IDs we seed in beforeAll
let aircraftA: string;
let aircraftB: string;
let aircraftGrounded: string;
let aircraftWithSquawk: string;
let roomA: string;
let roomB: string;
let blockA: string;
let blockB: string;
let blockInstanceA: string;
let blockInstanceB: string;
let squawkA: string;
let squawkB: string;
let fifNoticeA: string;
let fifNoticeB: string;
let manifestReservationA: string;
let manifestReservationB: string;
let unavailabilityA: string;
let unavailabilityB: string;
let pairedAircraft: string;
let baselineEntryId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Aircraft for both schools
  const ac = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft (school_id, base_id, tail_number)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'N1A'),
      ('${seed.schoolB}', '${seed.baseB}', 'N1B'),
      ('${seed.schoolA}', '${seed.baseA}', 'N-GROUND'),
      ('${seed.schoolA}', '${seed.baseA}', 'N-SQK'),
      ('${seed.schoolA}', '${seed.baseA}', 'N-PAIRED')
    returning id
  `);
  aircraftA = ac[0]!.id;
  aircraftB = ac[1]!.id;
  aircraftGrounded = ac[2]!.id;
  aircraftWithSquawk = ac[3]!.id;
  pairedAircraft = ac[4]!.id;

  // Ground one aircraft via grounded_at
  await sql.unsafe(
    `update public.aircraft set grounded_at = now() - interval '1 day' where id = '${aircraftGrounded}'`,
  );

  // Rooms
  const rm = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.room (school_id, base_id, name, capacity)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'Briefing 1', 4),
      ('${seed.schoolB}', '${seed.baseB}', 'Briefing 1', 4)
    returning id
  `);
  roomA = rm[0]!.id;
  roomB = rm[1]!.id;

  // Schedule blocks + instances
  const bk = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.schedule_block (school_id, base_id, kind)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'instructor_block'),
      ('${seed.schoolB}', '${seed.baseB}', 'instructor_block')
    returning id
  `);
  blockA = bk[0]!.id;
  blockB = bk[1]!.id;

  const bi = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.schedule_block_instance (block_id, school_id, base_id, time_range)
    values
      ('${blockA}', '${seed.schoolA}', '${seed.baseA}',
       tstzrange('2026-06-01 14:00+00','2026-06-01 16:00+00','[)')),
      ('${blockB}', '${seed.schoolB}', '${seed.baseB}',
       tstzrange('2026-06-01 14:00+00','2026-06-01 16:00+00','[)'))
    returning id
  `);
  blockInstanceA = bi[0]!.id;
  blockInstanceB = bi[1]!.id;

  // Squawks
  const sq = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.aircraft_squawk
      (school_id, base_id, aircraft_id, severity, title, opened_at)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftA}', 'info', 'minor scratch', now()),
      ('${seed.schoolB}', '${seed.baseB}', '${aircraftB}', 'info', 'minor scratch', now()),
      ('${seed.schoolA}', '${seed.baseA}', '${aircraftWithSquawk}', 'grounding',
       'open ground squawk', now() - interval '1 hour')
    returning id
  `);
  squawkA = sq[0]!.id;
  squawkB = sq[1]!.id;

  // FIF notices
  const fn = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.fif_notice (school_id, title, body, severity)
    values
      ('${seed.schoolA}', 'Welcome', 'Read me', 'info'),
      ('${seed.schoolB}', 'Welcome', 'Read me', 'info')
    returning id
  `);
  fifNoticeA = fn[0]!.id;
  fifNoticeB = fn[1]!.id;

  // FIF acks
  await sql.unsafe(`
    insert into public.fif_acknowledgement (notice_id, user_id, school_id)
    values
      ('${fifNoticeA}', '${seed.userA}', '${seed.schoolA}'),
      ('${fifNoticeB}', '${seed.userB}', '${seed.schoolB}')
  `);

  // Manifest-attached reservations (one per school)
  const mr = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.reservation
      (school_id, base_id, activity_type, time_range, status,
       aircraft_id, instructor_id, requested_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', 'flight',
       tstzrange('2026-07-01 14:00+00','2026-07-01 16:00+00','[)'),
       'approved', '${aircraftA}', '${seed.userA}', '${seed.userA}'),
      ('${seed.schoolB}', '${seed.baseB}', 'flight',
       tstzrange('2026-07-01 14:00+00','2026-07-01 16:00+00','[)'),
       'approved', '${aircraftB}', '${seed.userB}', '${seed.userB}')
    returning id
  `);
  manifestReservationA = mr[0]!.id;
  manifestReservationB = mr[1]!.id;

  await sql.unsafe(`
    insert into public.passenger_manifest
      (reservation_id, position, name, weight_lbs)
    values
      ('${manifestReservationA}', 'pic', 'Alpha PIC', 180.0),
      ('${manifestReservationB}', 'pic', 'Bravo PIC', 180.0)
  `);

  // person_unavailability — needs the trigger to run with replica off
  // because the trigger inserts a reservation row that we want the
  // exclusion constraint to see. With session_replication_role=replica,
  // user-defined triggers are SKIPPED, which means we'd lose the
  // shadow-row insert. Switch back temporarily.
  await sql.unsafe(`set session_replication_role = origin`);

  // Make seed.userA's default role 'instructor' so the shadow-row
  // trigger picks instructor_id (not student_id, not null).
  await sql.unsafe(`
    update public.user_roles set is_default = false where user_id = '${seed.userA}'
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default)
    values ('${seed.userA}', 'instructor', 'none', true)
  `);

  const ua = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.person_unavailability
      (school_id, user_id, time_range, kind, reason, created_by)
    values
      ('${seed.schoolA}', '${seed.userA}',
       tstzrange('2026-08-01 09:00+00','2026-08-01 17:00+00','[)'),
       'vacation', 'beach', '${seed.userA}'),
      ('${seed.schoolB}', '${seed.userB}',
       tstzrange('2026-08-01 09:00+00','2026-08-01 17:00+00','[)'),
       'vacation', 'beach', '${seed.userB}')
    returning id
  `);
  unavailabilityA = ua[0]!.id;
  unavailabilityB = ua[1]!.id;

  // Paired flight_out / flight_in entries on pairedAircraft for
  // the totals-view test. Baseline first.
  await sql.unsafe(`set session_replication_role = replica`);
  const baseline = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at,
       hobbs_in, tach_in, recorded_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${pairedAircraft}', 'baseline',
       now() - interval '10 days', 100.0, 100.0, '${seed.userA}')
    returning id
  `);
  baselineEntryId = baseline[0]!.id;

  const out = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at,
       hobbs_out, tach_out, recorded_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${pairedAircraft}', 'flight_out',
       now() - interval '5 days', 100.0, 100.0, '${seed.userA}')
    returning id
  `);
  const outId = out[0]!.id;

  await sql.unsafe(`
    insert into public.flight_log_entry
      (school_id, base_id, aircraft_id, kind, flown_at,
       hobbs_in, tach_in, paired_entry_id, recorded_by)
    values
      ('${seed.schoolA}', '${seed.baseA}', '${pairedAircraft}', 'flight_in',
       now() - interval '5 days', 101.5, 101.4, '${outId}', '${seed.userA}')
  `);

  await sql.unsafe(`set session_replication_role = origin`);

  // Touch baselineEntryId so the linter/typecheck doesn't complain
  void baselineEntryId;
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Group 1: cross-tenant isolation per Phase 3 table
// ---------------------------------------------------------------------
describe('phase 3 cross-tenant isolation', () => {
  const checkInvisible = async (table: string, id: string) => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.${table} where id = '${id}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  };

  it('user A cannot see school B reservation', async () => {
    await checkInvisible('reservation', manifestReservationB);
  });
  it('user A cannot see school B room', async () => {
    await checkInvisible('room', roomB);
  });
  it('user A cannot see school B aircraft_squawk', async () => {
    await checkInvisible('aircraft_squawk', squawkB);
  });
  it('user A cannot see school B schedule_block', async () => {
    await checkInvisible('schedule_block', blockB);
  });
  it('user A cannot see school B schedule_block_instance', async () => {
    await checkInvisible('schedule_block_instance', blockInstanceB);
  });
  it('user A cannot see school B fif_notice', async () => {
    await checkInvisible('fif_notice', fifNoticeB);
  });
  it('user A cannot see school B fif_acknowledgement', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.fif_acknowledgement where notice_id = '${fifNoticeB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
  it('user A cannot see school B passenger_manifest', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.passenger_manifest where reservation_id = '${manifestReservationB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
  it('user A cannot see school B person_unavailability', async () => {
    await checkInvisible('person_unavailability', unavailabilityB);
  });

  it('user A CAN see their own school reservation (sanity)', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.reservation where id = '${manifestReservationA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
    void aircraftB; // referenced for variable usage
    void squawkA;
    void blockA;
    void blockInstanceA;
    void fifNoticeA;
    void unavailabilityA;
  });
});

// ---------------------------------------------------------------------
// Group 2: is_airworthy_at()
// ---------------------------------------------------------------------
describe('is_airworthy_at()', () => {
  it('returns true for an active aircraft', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ result: boolean }>>(
      `select public.is_airworthy_at('${aircraftA}', now()) as result`,
    );
    expect(rows[0]!.result).toBe(true);
  });

  it('returns false for an aircraft with grounded_at set in the past', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ result: boolean }>>(
      `select public.is_airworthy_at('${aircraftGrounded}', now()) as result`,
    );
    expect(rows[0]!.result).toBe(false);
  });

  it('returns false for an aircraft with an open grounding squawk', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ result: boolean }>>(
      `select public.is_airworthy_at('${aircraftWithSquawk}', now()) as result`,
    );
    expect(rows[0]!.result).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Group 3: person_unavailability shadow-row trigger
// ---------------------------------------------------------------------
describe('person_unavailability shadow trigger', () => {
  it('insert created a matching shadow reservation', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<
      Array<{
        id: string;
        status: string;
        activity_type: string;
        instructor_id: string | null;
      }>
    >(`
      select r.id, r.status, r.activity_type, r.instructor_id
        from public.reservation r
        join public.person_unavailability pu
          on pu.shadow_reservation_id = r.id
       where pu.id = '${unavailabilityA}'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('approved');
    expect(rows[0]!.activity_type).toBe('misc');
    // Instructor role was assigned to userA in the seed
    expect(rows[0]!.instructor_id).toBe(seed.userA);
  });

  it('inserting an overlapping flight on the unavailable instructor is rejected', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`
        insert into public.reservation
          (school_id, base_id, activity_type, time_range, status,
           aircraft_id, instructor_id, requested_by, approved_at, approved_by)
        values
          ('${seed.schoolA}', '${seed.baseA}', 'flight',
           tstzrange('2026-08-01 12:00+00','2026-08-01 13:00+00','[)'),
           'approved', '${aircraftA}', '${seed.userA}',
           '${seed.userA}', now(), '${seed.userA}')
      `),
    ).rejects.toThrow(/exclusion|overlap|23P01/i);
  });
});

// ---------------------------------------------------------------------
// Group 4: aircraft_current_totals handles paired flight_out / flight_in
// ---------------------------------------------------------------------
describe('aircraft_current_totals view (Phase 3 paired entries)', () => {
  it('returns baseline + delta for the paired aircraft', async () => {
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<
      Array<{ current_hobbs: string; current_tach: string }>
    >(
      `select current_hobbs, current_tach from public.aircraft_current_totals where aircraft_id = '${pairedAircraft}'`,
    );
    expect(rows).toHaveLength(1);
    // Baseline 100.0 + (101.5 - 100.0) = 101.5
    expect(Number(rows[0]!.current_hobbs)).toBeCloseTo(101.5, 1);
    expect(Number(rows[0]!.current_tach)).toBeCloseTo(101.4, 1);
  });
});
