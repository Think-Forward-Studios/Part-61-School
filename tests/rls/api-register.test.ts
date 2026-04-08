/**
 * register + approveRegistration integration test (PER-02).
 *
 * Exercises the full self-registration lifecycle at the tRPC layer:
 *   1. publicProcedure register.submit creates a pending public.users row
 *      (no auth.users yet) via the SECURITY DEFINER submit_registration
 *      function.
 *   2. admin.people.listPending surfaces the new row.
 *   3. admin.people.approveRegistration calls supabase.auth.admin.createUser
 *      with the pre-assigned id and flips users.status to 'active'.
 *
 * The approve step requires a running Supabase auth server at
 * NEXT_PUBLIC_SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY in env.
 * If either is missing we skip the approve assertion and log a warning
 * so the rest of the suite still runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAdmin, dbAsAdmin, seedTwoSchools, type SeedResult } from './harness';
import { adminCaller, publicCaller } from './api-caller';

let seed: SeedResult;

beforeAll(async () => {
  seed = await seedTwoSchools();
});

afterAll(async () => {
  await closeAdmin();
});

describe('register.submit + admin.people.approveRegistration (PER-02)', () => {
  let submittedUserId: string | null = null;

  it('register.submit creates a pending users row via the SECURITY DEFINER function', async () => {
    const pub = publicCaller();
    const result = await pub.register.submit({
      schoolId: seed.schoolA,
      email: 'new-student@alpha.test',
      firstName: 'New',
      lastName: 'Student',
      phone: '555-1234',
      requestedRole: 'student',
    });
    expect(result.ok).toBe(true);
    expect(result.userId).toBeTruthy();
    submittedUserId = result.userId as string;

    const rows = await dbAsAdmin().unsafe<
      Array<{ status: string; email: string }>
    >(`select status, email from public.users where id = '${submittedUserId}'`);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.email).toBe('new-student@alpha.test');
  });

  it('admin.people.listPending returns the pending row', async () => {
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    const rows = await caller.admin.people.listPending();
    const found = (rows as Array<{ id: string }>).find(
      (r) => r.id === submittedUserId,
    );
    expect(found).toBeDefined();
  });

  it('duplicate email submission is rejected cleanly', async () => {
    const pub = publicCaller();
    await expect(
      pub.register.submit({
        schoolId: seed.schoolA,
        email: 'new-student@alpha.test',
        firstName: 'Dup',
        lastName: 'Student',
        requestedRole: 'student',
      }),
    ).rejects.toThrow(/already/i);
  });

  it('admin.people.approveRegistration creates the auth user with matching id', async () => {
    if (
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
    ) {
      console.warn(
        '[api-register] skipping approveRegistration assertion — SUPABASE_SERVICE_ROLE_KEY not set',
      );
      return;
    }
    const caller = adminCaller({ userId: seed.userA, schoolId: seed.schoolA });
    try {
      const result = await caller.admin.people.approveRegistration({
        userId: submittedUserId!,
      });
      expect(result.ok).toBe(true);
      expect(result.userId).toBe(submittedUserId);

      const rows = await dbAsAdmin().unsafe<Array<{ status: string }>>(
        `select status from public.users where id = '${submittedUserId}'`,
      );
      expect(rows[0]?.status).toBe('active');

      // Verify the auth.users row exists with the same id.
      const authRows = await dbAsAdmin().unsafe<Array<{ id: string }>>(
        `select id from auth.users where id = '${submittedUserId}'`,
      );
      expect(authRows.length).toBe(1);
    } finally {
      // Clean up the auth user we created so subsequent test runs on
      // the same DB don't collide.
      try {
        await dbAsAdmin().unsafe(
          `delete from auth.users where id = '${submittedUserId}'`,
        );
      } catch {
        /* ignore */
      }
    }
  });
});
