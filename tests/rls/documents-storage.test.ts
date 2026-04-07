/**
 * Cross-tenant coverage for the documents feature (FND-07).
 *
 * Complements `cross-tenant.test.ts` (which covers row-level RLS on
 * public.documents) with:
 *
 *   1. storage.objects RLS — a user in school A cannot INSERT into
 *      school B's folder, cannot SELECT school B's objects, and
 *      cannot UPDATE them either.
 *   2. Path policy belt-and-suspenders — inserting an object whose
 *      name begins with the wrong `school_<id>/` prefix is denied
 *      even if the caller spoofs the second segment correctly.
 *   3. Row-level cross-tenant SELECT on public.documents (re-assert
 *      specifically for the documents table, targeting docB from
 *      school A).
 *
 * NOTE: These tests require a running local Supabase stack with
 * migrations `0000_init.sql` and `0001_storage_policies.sql`
 * applied. They are skipped automatically if DIRECT_DATABASE_URL is
 * not reachable. The tRPC-layer path-tamper rejection is covered
 * by unit tests colocated with the router in a future plan — here
 * we only assert the SQL/storage guarantees that cannot be faked
 * from TypeScript.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUserOf, closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';

let seed: SeedResult;

beforeAll(async () => {
  seed = await seedTwoSchools();

  // Seed two storage.objects rows — one in each school's prefix —
  // using the admin (service-role equivalent) connection. The
  // `documents` bucket is created by migration 0001.
  const sql = dbAsAdmin();
  await sql.unsafe(`
    insert into storage.buckets (id, name, public)
    values ('documents', 'documents', false)
    on conflict (id) do nothing
  `);
  // Clean any prior test objects, then insert the two fixtures.
  // Supabase blocks direct DELETE on storage.objects via a trigger; bypass it
  // for the duration of this cleanup by switching session_replication_role.
  await sql.unsafe(`set session_replication_role = replica`);
  await sql.unsafe(`delete from storage.objects where bucket_id = 'documents'`);
  await sql.unsafe(`set session_replication_role = origin`);
  await sql.unsafe(`
    insert into storage.objects (bucket_id, name, owner, metadata)
    values
      ('documents',
       'school_${seed.schoolA}/user_${seed.userA}/${seed.docA}.pdf',
       '${seed.userA}',
       '{"mimetype":"application/pdf","size":1024}'::jsonb),
      ('documents',
       'school_${seed.schoolB}/user_${seed.userB}/${seed.docB}.pdf',
       '${seed.userB}',
       '{"mimetype":"application/pdf","size":1024}'::jsonb)
  `);
});

afterAll(async () => {
  await closeAdmin();
});

describe('storage.objects cross-tenant RLS (documents bucket)', () => {
  it('user A cannot SELECT school B storage objects', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) =>
        sql.unsafe<Array<{ name: string }>>(
          `select name from storage.objects
             where bucket_id = 'documents'
               and name like 'school_${seed.schoolB}/%'`,
        ),
    );
    expect(rows).toEqual([]);
  });

  it('user A can SELECT their own school A storage objects', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) =>
        sql.unsafe<Array<{ name: string }>>(
          `select name from storage.objects
             where bucket_id = 'documents'
               and name like 'school_${seed.schoolA}/%'`,
        ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('user A cannot INSERT a storage object into school B prefix', async () => {
    await expect(
      asUserOf({ userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' }, async (sql) =>
        sql.unsafe(`
            insert into storage.objects (bucket_id, name, owner, metadata)
            values ('documents',
                    'school_${seed.schoolB}/user_${seed.userA}/evil.pdf',
                    '${seed.userA}',
                    '{"mimetype":"application/pdf","size":10}'::jsonb)
          `),
      ),
    ).rejects.toThrow(/row-level security|violates|permission/i);
  });

  it('user A cannot INSERT into school A under another user_<id> folder', async () => {
    await expect(
      asUserOf({ userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' }, async (sql) =>
        sql.unsafe(`
            insert into storage.objects (bucket_id, name, owner, metadata)
            values ('documents',
                    'school_${seed.schoolA}/user_${seed.userB}/hijack.pdf',
                    '${seed.userA}',
                    '{"mimetype":"application/pdf","size":10}'::jsonb)
          `),
      ),
    ).rejects.toThrow(/row-level security|violates|permission/i);
  });

  it('user A cannot UPDATE a school B storage object (RLS filters to 0 rows)', async () => {
    // RLS UPDATE policy filters rows the user can't see to 0 affected rows
    // (Postgres semantics — no exception thrown). Verify two things:
    //   1. The UPDATE affects 0 rows from user A's perspective.
    //   2. The school B object's metadata is unchanged when read as admin.
    const result = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) =>
        sql.unsafe(`
            update storage.objects
               set metadata = '{"tampered":true}'::jsonb
             where bucket_id = 'documents'
               and name = 'school_${seed.schoolB}/user_${seed.userB}/${seed.docB}.pdf'
            returning name
          `),
    );
    expect(result.length).toBe(0);

    const adminCheck = await dbAsAdmin().unsafe<Array<{ metadata: { tampered?: boolean } }>>(
      `select metadata from storage.objects
        where bucket_id = 'documents'
          and name = 'school_${seed.schoolB}/user_${seed.userB}/${seed.docB}.pdf'`,
    );
    expect(adminCheck[0]?.metadata?.tampered).toBeUndefined();
  });

  it('user A SELECT on public.documents filtered to school B returns zero rows', async () => {
    const rows = await asUserOf(
      { userId: seed.userA, schoolId: seed.schoolA, activeRole: 'admin' },
      async (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.documents where school_id = '${seed.schoolB}'`,
        ),
    );
    expect(rows).toEqual([]);
  });
});
