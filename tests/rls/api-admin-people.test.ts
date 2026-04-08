/**
 * admin/people router integration test (ADM-01/02/03).
 *
 * Covers: list, getById, update (excluding create/approveRegistration —
 * those hit supabase.auth.admin which requires the live auth server;
 * register.test.ts exercises the self-registration path instead),
 * assignRole, removeRole, softDelete, rejectRegistration.
 *
 * Note: the create path calls supabase.auth.admin.inviteUserByEmail
 * which the local Supabase stack supports; we opt out of exercising
 * it in unit-ish tests to keep them hermetic. The register.test.ts
 * file exercises approveRegistration which is the critical PER-02
 * contract.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';
import { adminCaller } from './api-caller';

let seed: SeedResult;
// A target user we insert into school A to run assignRole / softDelete against.
let targetUserId: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  // Seed a "target" student user so tests don't depend on an admin-invite path.
  targetUserId = '99999999-9999-4999-8999-999999999901';
  const s = dbAsAdmin();
  await s.unsafe(`set session_replication_role = replica`);
  await s.unsafe(`
    insert into public.users (id, school_id, email, full_name, status)
    values ('${targetUserId}', '${seed.schoolA}', 'target@alpha.test', 'Target Student', 'active')
  `);
  await s.unsafe(`
    insert into public.person_profile (user_id, school_id, first_name, last_name, phone)
    values ('${targetUserId}', '${seed.schoolA}', 'Target', 'Student', '555-0001')
  `);
  await s.unsafe(`
    insert into public.user_roles (user_id, role, is_default)
    values ('${targetUserId}', 'student', true)
  `);
  await s.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('admin.people router', () => {
  it('list returns the school A users (admin A, target) with aggregated roles', async () => {
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    const result = await caller.admin.people.list({ limit: 100, offset: 0 });
    expect(result.total).toBeGreaterThanOrEqual(2);
    const emails = (result.rows as Array<{ email: string }>).map((r) => r.email);
    expect(emails).toContain('target@alpha.test');
    expect(emails).toContain('admin-a@alpha.test');
  });

  it('getById returns profile + roles for the target', async () => {
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    const result = await caller.admin.people.getById({ userId: targetUserId });
    expect(result.user.id).toBe(targetUserId);
    expect(result.profile?.firstName).toBe('Target');
    expect(result.roles.some((r) => r.role === 'student')).toBe(true);
  });

  it('update mutates person_profile fields', async () => {
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (caller.admin.people.update as any)({
      userId: targetUserId,
      phone: '555-9999',
    });
    const result = await caller.admin.people.getById({ userId: targetUserId });
    expect(result.profile?.phone).toBe('555-9999');
  });

  it('assignRole + removeRole toggles instructor role', async () => {
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    await caller.admin.people.assignRole({
      userId: targetUserId,
      role: 'instructor',
    });
    const after = await caller.admin.people.getById({ userId: targetUserId });
    expect(after.roles.some((r) => r.role === 'instructor')).toBe(true);

    await caller.admin.people.removeRole({
      userId: targetUserId,
      role: 'instructor',
    });
    const after2 = await caller.admin.people.getById({ userId: targetUserId });
    expect(after2.roles.some((r) => r.role === 'instructor')).toBe(false);
  });

  it('softDelete marks the user inactive + deleted_at set', async () => {
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    await caller.admin.people.softDelete({ userId: targetUserId });
    // Query directly via admin connection since RLS now filters the row.
    const rows = await dbAsAdmin().unsafe<
      Array<{ status: string; deleted_at: string | null }>
    >(`select id, status, deleted_at from public.users where id = '${targetUserId}'`);
    expect(rows[0]?.status).toBe('inactive');
    expect(rows[0]?.deleted_at).not.toBeNull();
  });

  it('rejectRegistration flips a pending row to rejected', async () => {
    const pendingId = '99999999-9999-4999-8999-999999999902';
    const s = dbAsAdmin();
    await s.unsafe(`set session_replication_role = replica`);
    await s.unsafe(`
      insert into public.users (id, school_id, email, full_name, status)
      values ('${pendingId}', '${seed.schoolA}', 'pending@alpha.test', 'Pending User', 'pending')
    `);
    await s.unsafe(`
      insert into public.person_profile (user_id, school_id, first_name, last_name)
      values ('${pendingId}', '${seed.schoolA}', 'Pending', 'User')
    `);
    await s.unsafe(`set session_replication_role = origin`);

    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    await caller.admin.people.rejectRegistration({
      userId: pendingId,
      reason: 'Incomplete info',
    });
    const rows = await dbAsAdmin().unsafe<Array<{ status: string }>>(
      `select status from public.users where id = '${pendingId}'`,
    );
    expect(rows[0]?.status).toBe('rejected');
  });
});
