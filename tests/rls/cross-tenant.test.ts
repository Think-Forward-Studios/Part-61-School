/**
 * Cross-tenant RLS coverage (FND-01 verification gate).
 *
 * Asserts that a user authenticated as school A cannot read or write
 * any row owned by school B, for every Phase 1 business table. Also
 * verifies the audit trigger writes rows on insert/soft-delete and
 * the hard-delete trigger blocks DELETE on `documents`.
 *
 * Run with `pnpm --filter @part61/rls-tests test` after
 * `supabase start` and `drizzle-kit migrate`.
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

beforeAll(async () => {
  seed = await seedTwoSchools();
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Group 1: cross-tenant SELECT/UPDATE isolation
// ---------------------------------------------------------------------
describe('cross-tenant isolation', () => {
  it('JWT claims are visible inside the session', async () => {
    const claimSchool = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) => {
        const rows = await sql.unsafe<Array<{ school_id: string }>>(
          `select (current_setting('request.jwt.claims', true)::jsonb ->> 'school_id') as school_id`,
        );
        return rows[0]!.school_id;
      },
    );
    expect(claimSchool).toBe(seed.schoolA);
  });

  it('user A cannot SELECT school B documents', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.documents where id = '${seed.docB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A CAN SELECT their own school documents (sanity)', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.documents where id = '${seed.docA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user A cannot UPDATE school B documents', async () => {
    const updated = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `update public.documents set mime_type = 'image/png' where id = '${seed.docB}' returning id`,
        ),
    );
    expect(updated).toHaveLength(0);
  });

  it('user A cannot SELECT school B users', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.users where id = '${seed.userB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A cannot SELECT school B user_roles', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.user_roles where user_id = '${seed.userB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // Phase 3 tables — one isolation assertion per new table.
  // We seed a row in school B for each table directly via the admin
  // client (bypassing RLS) and assert school A cannot see it.
  // -------------------------------------------------------------------
  it('phase 3 tables: user A cannot SELECT any school B row', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(`set session_replication_role = replica`);

    // aircraft (needed for FK targets)
    const ac = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft (school_id, base_id, tail_number)
      values ('${seed.schoolB}', '${seed.baseB}', 'N-XT-B')
      returning id
    `);
    const acId = ac[0]!.id;

    const rm = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.room (school_id, base_id, name)
      values ('${seed.schoolB}', '${seed.baseB}', 'XT Room')
      returning id
    `);
    const rmId = rm[0]!.id;

    const sq = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.aircraft_squawk
        (school_id, base_id, aircraft_id, severity, title)
      values ('${seed.schoolB}', '${seed.baseB}', '${acId}', 'info', 'xt')
      returning id
    `);
    const sqId = sq[0]!.id;

    const sb = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.schedule_block (school_id, base_id, kind)
      values ('${seed.schoolB}', '${seed.baseB}', 'instructor_block')
      returning id
    `);
    const sbId = sb[0]!.id;

    const fn = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.fif_notice (school_id, title, body, severity)
      values ('${seed.schoolB}', 'xt', 'xt body', 'info')
      returning id
    `);
    const fnId = fn[0]!.id;

    const rs = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.reservation
        (school_id, base_id, activity_type, time_range, status,
         room_id, requested_by)
      values
        ('${seed.schoolB}', '${seed.baseB}', 'oral',
         tstzrange('2026-12-01 14:00+00','2026-12-01 15:00+00','[)'),
         'requested', '${rmId}', '${seed.userB}')
      returning id
    `);
    const rsId = rs[0]!.id;

    const pm = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.passenger_manifest
        (reservation_id, position, name)
      values ('${rsId}', 'pic', 'XT PIC')
      returning id
    `);
    const pmId = pm[0]!.id;

    const pu = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.person_unavailability
        (school_id, user_id, time_range, kind, created_by)
      values
        ('${seed.schoolB}', '${seed.userB}',
         tstzrange('2026-12-02 09:00+00','2026-12-02 17:00+00','[)'),
         'vacation', '${seed.userB}')
      returning id
    `);
    const puId = pu[0]!.id;

    await sql.unsafe(`set session_replication_role = origin`);

    const checkInvisible = async (table: string, id: string) => {
      const rows = await asUserOf(
        { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
        (s) =>
          s.unsafe<Array<{ id: string }>>(
            `select id from public.${table} where id = '${id}'`,
          ),
      );
      expect(rows, `${table} should be invisible to school A`).toHaveLength(0);
    };

    await checkInvisible('room', rmId);
    await checkInvisible('aircraft_squawk', sqId);
    await checkInvisible('schedule_block', sbId);
    await checkInvisible('fif_notice', fnId);
    await checkInvisible('reservation', rsId);
    await checkInvisible('passenger_manifest', pmId);
    await checkInvisible('person_unavailability', puId);
  });
});

// ---------------------------------------------------------------------
// Group 2: audit trigger
// ---------------------------------------------------------------------
describe('audit trigger', () => {
  it('insert into documents writes a matching audit_log row', async () => {
    const sql = dbAsAdmin();
    // Set tenant context so the trigger captures who/what.
    await sql.unsafe(`select set_config('app.school_id', $1, false)`, [
      seed.schoolA,
    ]);
    await sql.unsafe(`select set_config('app.user_id', $1, false)`, [
      seed.userA,
    ]);
    await sql.unsafe(
      `select set_config('app.active_role', 'admin', false)`,
    );

    const inserted = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.documents
        (school_id, user_id, kind, storage_path, mime_type, byte_size, uploaded_by)
      values
        ('${seed.schoolA}', '${seed.userA}', 'pilot_license',
         'school_${seed.schoolA}/user_${seed.userA}/audit-test',
         'application/pdf', 2048, '${seed.userA}')
      returning id
    `);
    const newId = inserted[0]!.id;

    const audit = await sql.unsafe<
      Array<{ action: string; user_id: string | null; school_id: string }>
    >(
      `select action, user_id, school_id from public.audit_log where record_id = '${newId}'`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.action).toBe('insert');
    expect(audit[0]!.user_id).toBe(seed.userA);
    expect(audit[0]!.school_id).toBe(seed.schoolA);
  });

  it('soft-delete writes an audit_log row with action=soft_delete', async () => {
    const sql = dbAsAdmin();
    await sql.unsafe(
      `update public.documents set deleted_at = now() where id = '${seed.docA}'`,
    );
    const audit = await sql.unsafe<Array<{ action: string }>>(
      `select action from public.audit_log
       where record_id = '${seed.docA}' and action = 'soft_delete'`,
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------
// Group 3: hard-delete prevention
// ---------------------------------------------------------------------
describe('hard delete prevention', () => {
  it('DELETE on documents raises P0001', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`delete from public.documents where id = '${seed.docB}'`),
    ).rejects.toThrow(/Hard delete is not permitted/i);
  });
});
