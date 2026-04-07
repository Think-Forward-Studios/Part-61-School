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
