/**
 * Phase 7 RLS + behavior tests for the geofence table.
 *
 * Covers:
 *   - Cross-tenant isolation (school A cannot see school B geofences)
 *   - Admin-only write (non-admin cannot INSERT)
 *   - Hard-delete is blocked by trigger (expect P0001)
 *   - Soft-delete succeeds for admin
 *   - Partial unique index (one active per base)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
  SCHOOL_A,
  SCHOOL_B,
  USER_A,
  USER_B,
  BASE_A,
  BASE_B,
} from './harness';

let seed: SeedResult;
let geofenceA: string;
let geofenceB: string;

const samplePolygon = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [-97.0, 32.0],
      [-97.0, 33.0],
      [-96.0, 33.0],
      [-96.0, 32.0],
      [-97.0, 32.0],
    ],
  ],
});

const sampleCircle = JSON.stringify({
  type: 'Point',
  coordinates: [-118.4, 34.0],
});

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();
  await sql.unsafe(`set session_replication_role = replica`);

  // Insert a geofence per school
  const rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.geofence
      (school_id, base_id, kind, geometry, label, created_by)
    values
      ('${SCHOOL_A}', '${BASE_A}', 'polygon', '${samplePolygon}'::jsonb, 'Alpha Training Area', '${USER_A}'),
      ('${SCHOOL_B}', '${BASE_B}', 'circle', '${sampleCircle}'::jsonb, 'Bravo Training Area', '${USER_B}')
    returning id
  `);
  geofenceA = rows[0]!.id;
  geofenceB = rows[1]!.id;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Group 1: cross-tenant isolation
// ---------------------------------------------------------------------
describe('phase 7 geofence cross-tenant isolation', () => {
  it('user A cannot see school B geofence', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.geofence where id = '${geofenceB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A CAN see their own geofence', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.geofence where id = '${geofenceA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user B cannot see school A geofence', async () => {
    const rows = await asUserOf(
      { userId: USER_B, schoolId: SCHOOL_B, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.geofence where id = '${geofenceA}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Group 2: admin-only write policy
// ---------------------------------------------------------------------
describe('phase 7 geofence admin-only write', () => {
  it('non-admin user cannot INSERT a geofence', async () => {
    await expect(
      asUserOf({ userId: USER_A, schoolId: SCHOOL_A, activeRole: 'student' }, (sql) =>
        sql.unsafe(`
            insert into public.geofence
              (school_id, base_id, kind, geometry, label, created_by)
            values
              ('${SCHOOL_A}', '${BASE_A}', 'polygon',
               '${samplePolygon}'::jsonb,
               'Student should not be able to create',
               '${USER_A}')
          `),
      ),
    ).rejects.toThrow();
  });

  it('non-admin user CAN SELECT geofences in their school', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'student' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.geofence where school_id = '${SCHOOL_A}'`,
        ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------
// Group 3: hard-delete blocker
// ---------------------------------------------------------------------
describe('phase 7 geofence hard-delete blocker', () => {
  it('cannot hard-delete a geofence', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`delete from public.geofence where id = '${geofenceA}'`),
    ).rejects.toThrow(/Hard delete is not permitted/);
  });
});

// ---------------------------------------------------------------------
// Group 4: soft-delete
// ---------------------------------------------------------------------
describe('phase 7 geofence soft-delete', () => {
  it('admin can soft-delete a geofence', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string; deleted_at: string | null }>>(
          `update public.geofence
              set deleted_at = now(), updated_at = now()
            where id = '${geofenceA}'
           returning id, deleted_at`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------
// Group 5: partial unique index (one active per base)
// ---------------------------------------------------------------------
describe('phase 7 geofence partial unique index', () => {
  it('allows new geofence after previous was soft-deleted', async () => {
    // geofenceA was soft-deleted above, so inserting a new active one should work
    const sql = dbAsAdmin();
    const rows = await sql.unsafe<Array<{ id: string }>>(`
      insert into public.geofence
        (school_id, base_id, kind, geometry, label, created_by)
      values
        ('${SCHOOL_A}', '${BASE_A}', 'circle',
         '${sampleCircle}'::jsonb,
         'New Alpha Geofence',
         '${USER_A}')
      returning id
    `);
    expect(rows).toHaveLength(1);
  });

  it('rejects second active geofence for same base', async () => {
    const sql = dbAsAdmin();
    await expect(
      sql.unsafe(`
        insert into public.geofence
          (school_id, base_id, kind, geometry, label, created_by)
        values
          ('${SCHOOL_A}', '${BASE_A}', 'polygon',
           '${samplePolygon}'::jsonb,
           'Duplicate should be rejected',
           '${USER_A}')
      `),
    ).rejects.toThrow(/geofence_active_per_base/);
  });
});
